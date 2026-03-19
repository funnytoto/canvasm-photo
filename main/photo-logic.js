import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import exifr from 'exifr';

// Supported file extensions
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff'];
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv'];

function isValidDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year > 1970 && year <= new Date().getFullYear() + 1;
}

function parseFilenameDate(basename) {
  const match8 = basename.match(/(?:^|\D)(20[0-2]\d|19[7-9]\d)(\d{2})(\d{2})(?:\D|$)/);
  if (match8) {
    const y = parseInt(match8[1]);
    const m = parseInt(match8[2]);
    const d = parseInt(match8[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { date: new Date(y, m - 1, d), confidence: 'high' };
    }
  }

  const match13 = basename.match(/(?:^|\D)(1[5-7]\d{11})(?:\D|$)/);
  if (match13) {
    const ts = parseInt(match13[1]);
    const date = new Date(ts);
    if (isValidDate(date)) return { date, confidence: 'high' };
  }

  const match6 = basename.match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (match6) {
    const y = parseInt(match6[1]);
    const m = parseInt(match6[2]);
    const d = parseInt(match6[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const fullYear = y <= 40 ? 2000 + y : 1900 + y;
      return { date: new Date(fullYear, m - 1, d), confidence: 'low' };
    }
  }

  return { date: null, confidence: 'none' };
}

async function getCaptureDate(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  
  const fnResult = parseFilenameDate(basename);
  if (fnResult.confidence === 'high') return fnResult;

  try {
    if (IMAGE_EXTS.includes(ext)) {
      const output = await exifr.parse(filePath, { pick: ['DateTimeOriginal', 'CreateDate'] });
      let date = null;
      if (output?.DateTimeOriginal) date = new Date(output.DateTimeOriginal);
      else if (output?.CreateDate) date = new Date(output.CreateDate);
      if (date && isValidDate(date)) return { date, confidence: 'high' };
    }
  } catch (e) {}

  if (fnResult.confidence === 'low') return fnResult;

  try {
    const stats = await fs.stat(filePath);
    const date = stats.birthtime || stats.mtime;
    if (isValidDate(date)) return { date, confidence: 'low' };
  } catch (e) {}

  return { date: null, confidence: 'none' };
}

export function setupPhotoHandlers() {
  ipcMain.handle('photo-scan', async (event, { sourcePath }) => {
    const allFiles = [];
    async function scanDirectory(currentDir) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'android' || entry.name.toLowerCase() === '$recycle.bin') continue;
            await scanDirectory(fullPath);
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            if ((IMAGE_EXTS.includes(ext) || VIDEO_EXTS.includes(ext)) && !entry.name.startsWith('._')) {
              allFiles.push(fullPath);
            }
          }
        }
      } catch (e) {}
    }
    await scanDirectory(sourcePath);
    return { files: allFiles };
  });

  ipcMain.handle('photo-analyze', async (event, { files, sourcePath, destPath, organizeInPlace }) => {
    const results = [];
    for (const filePath of files) {
      const pathParts = filePath.split(/[\\/]/);
      const parentDir = pathParts[pathParts.length - 2];
      const folderDateMatch = parentDir?.match(/^(\d{4})[-년]\s*(\d{1,2})[월]?$/);
      
      const fileExtForType = path.extname(filePath).toLowerCase();
      const mediaTypeFolder = VIDEO_EXTS.includes(fileExtForType) ? 'Videos' : 'Photos';

      if (folderDateMatch) {
        results.push({ src: filePath, target: path.join(mediaTypeFolder, `${folderDateMatch[1]}-${folderDateMatch[2].padStart(2, '0')}`), confidence: 'high' });
      } else {
        const dateResult = await getCaptureDate(filePath);
        const targetDirName = dateResult.date ? path.join(mediaTypeFolder, `${dateResult.date.getFullYear()}-${String(dateResult.date.getMonth() + 1).padStart(2, '0')}`) : path.join(mediaTypeFolder, 'Unknown_Date');
        results.push({ src: filePath, target: targetDirName, confidence: dateResult.confidence });
      }
    }
    return { analysis: results };
  });

  ipcMain.handle('photo-execute', async (event, { map, destPath, mode }) => {
    const summary = { moved: 0, duplicated: 0, errors: 0 };
    const processedFiles = [];
    
    const uniqueDirs = new Set(map.map(item => path.join(destPath, item.target)));
    for (const dir of uniqueDirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    async function safeMove(src, dest, retries = 3) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try { await fs.rename(src, dest); return; } catch (err) {
          if (err.code === 'EXDEV') {
            await fs.copyFile(src, dest);
            try { await fs.unlink(src); } catch {}
            return;
          }
          if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < retries) {
            await new Promise(r => setTimeout(r, 300 * attempt)); continue;
          }
          throw err;
        }
      }
    }

    for (const item of map) {
      try {
        const { src, target } = item;
        const ext = path.extname(src).toLowerCase();
        let fileName = path.basename(src);
        if (/^\d+$/.test(path.parse(fileName).name)) {
          fileName = (VIDEO_EXTS.includes(ext) ? 'MOV_' : 'PIC_') + fileName;
        }
        const finalTargetPath = path.join(destPath, target, fileName);
        try { 
          await fs.access(finalTargetPath); 
          summary.duplicated++; 
          processedFiles.push(`[중복] ${fileName}`);
          continue; 
        } catch {}

        if (mode === 'move') await safeMove(src, finalTargetPath);
        else await fs.copyFile(src, finalTargetPath);
        
        summary.moved++;
        processedFiles.push(fileName);
      } catch (e) { 
        summary.errors++; 
      }
    }
    return { summary, processedFiles };
  });
}
