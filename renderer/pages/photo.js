import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { 
  FolderHeart, Images, ArrowRight, Play, CheckCircle2, 
  AlertCircle, Loader2, Home, Trash2, Copy, Move, 
  Search, ShieldCheck, Clock, Pause, Square
} from '../components/ui/IconLibrary';

export default function PhotoOrganizerPage() {
  const [theme, setTheme] = useState('dark');
  const [sourcePath, setSourcePath] = useState('');
  const [destPath, setDestPath] = useState('');
  const [organizeInPlace, setOrganizeInPlace] = useState(true);
  const [mode, setMode] = useState('move');
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState({ processed: 0, moved: 0, duplicated: 0, errors: 0 });
  const [error, setError] = useState('');
  
  const [filesToProcess, setFilesToProcess] = useState([]);
  const [fileMap, setFileMap] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [log, setLog] = useState([]);
  const [currentActivity, setCurrentActivity] = useState('');
  
  const isPausedRef = useRef(false);
  const stopRequestedRef = useRef(false);

  const analyzeBatch = async (files, startIdx) => {
    let localIdx = startIdx;
    const batchSize = 20;
    
    while (localIdx < files.length && !isPausedRef.current && !stopRequestedRef.current) {
      const batch = files.slice(localIdx, localIdx + batchSize);
      try {
        const data = await window.ipc.invoke('photo-analyze', { 
            files: batch, 
            sourcePath, 
            destPath: organizeInPlace ? sourcePath : destPath, 
            organizeInPlace 
        });

        setFileMap(prev => [...prev, ...data.analysis]);
        localIdx += batch.length;
        setCurrentIndex(localIdx);
        
        await new Promise(r => setTimeout(r, 10));
      } catch (err) {
        setError(err.message);
        setStatus('error');
        return;
      }
    }

    if (stopRequestedRef.current) {
      setStatus('idle');
      stopRequestedRef.current = false;
    } else if (localIdx >= files.length) {
      setStatus('ready');
    } else if (isPausedRef.current) {
      setStatus('paused');
    }
  };

  const getBaseName = (p) => p.split(/[\\/]/).pop() || p;

  const executeBatch = async (map, startIdx) => {
    let localIdx = startIdx;
    const batchSize = 10;

    while (localIdx < map.length && !isPausedRef.current && !stopRequestedRef.current) {
      const batch = map.slice(localIdx, localIdx + batchSize);
      const currentFile = getBaseName(batch[0].src);
      setCurrentActivity(`대조 및 ${mode === 'move' ? '이동' : '복사'} 중 (${batch.length}개): ${currentFile}...`);

      try {
        const data = await window.ipc.invoke('photo-execute', { 
             map: batch, 
             destPath: organizeInPlace ? sourcePath : destPath, 
             mode: organizeInPlace ? 'move' : mode
        });

        setResults((prev) => ({
          ...prev,
          moved: prev.moved + data.summary.moved,
          duplicated: prev.duplicated + data.summary.duplicated,
          errors: prev.errors + data.summary.errors,
          processed: prev.processed + batch.length
        }));

        if (data.processedFiles) {
          const newLogEntries = data.processedFiles.map(f => 
            f.startsWith('[중복]') ? `⏭️ ${f}` : f
          );
          setLog((prev) => [
              ...newLogEntries.reverse(),
              ...prev
          ].slice(0, 50));
        }

        localIdx += batch.length;
        setCurrentIndex(localIdx);
        await new Promise(r => setTimeout(r, 10)); 
      } catch (err) {
        setError(err.message);
        setStatus('error');
        return;
      }
    }

    if (stopRequestedRef.current) {
      setStatus('idle');
      stopRequestedRef.current = false;
    } else if (localIdx >= map.length) {
      setStatus('success');
    } else if (isPausedRef.current) {
      setStatus('paused');
    }
  };

  const handleStart = async () => {
    if (!sourcePath || (!organizeInPlace && !destPath)) {
      setError('원본 폴더 경로를 입력해주세요.');
      return;
    }

    setStatus('scanning');
    setError('');
    isPausedRef.current = false;
    stopRequestedRef.current = false;

    try {
      const data = await window.ipc.invoke('photo-scan', { sourcePath });
      
      setFilesToProcess(data.files);
      setFileMap([]);
      setCurrentIndex(0);
      setResults({ processed: 0, moved: 0, duplicated: 0, errors: 0 });
      
      if (data.files.length === 0) {
        setError('해당 경로에서 정리할 사진이나 영상을 찾지 못했습니다.');
        setStatus('idle');
        return;
      }

      setStatus('analyzing');
      analyzeBatch(data.files, 0);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleExecuteMove = () => {
    setStatus('executing');
    setCurrentIndex(0); 
    executeBatch(fileMap, 0);
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setStatus('paused');
  };

  const handleResume = () => {
    isPausedRef.current = false;
    if (status === 'paused') {
      if (fileMap.length < filesToProcess.length) {
        setStatus('analyzing');
        analyzeBatch(filesToProcess, currentIndex);
      } else {
        setStatus('executing');
        executeBatch(fileMap, currentIndex);
      }
    }
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    if (status === 'paused' || status === 'ready') {
      setStatus('idle');
    }
  };

  const lowConfidenceCount = fileMap.filter(f => f.confidence === 'low').length;
  const highConfidenceCount = fileMap.filter(f => f.confidence === 'high').length;
  const noDateCount = fileMap.filter(f => f.confidence === 'none').length;

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 p-8`}>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center p-3 text-rose-400">
               <FolderHeart className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight italic uppercase">추억<span className="text-rose-400">개기</span></h1>
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em] font-bold">DESKTOP STANDALONE v1.0</p>
            </div>
          </div>
          <Link href="/home" className="p-3 rounded-xl border bg-zinc-900 border-zinc-800 text-zinc-400 font-bold">홈으로</Link>
        </header>

        <section className="p-8 rounded-[40px] border bg-zinc-900/40 border-zinc-800 relative overflow-hidden">
            <div className="relative z-10 space-y-8">
               <div className="space-y-2">
                  <h2 className="text-xl font-bold">전용 프로그램으로 더욱 빠르고 강력하게.</h2>
                  <p className="text-sm text-zinc-500 font-medium">데스크탑 전용 앱에서는 웹 권한 제약 없이 직접 로컬 파일을 제어합니다.</p>
               </div>

               <div className="space-y-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">정리할 폴더 경로 (Source)</label>
                     <div className="relative">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                        <input 
                          type="text" 
                          placeholder="폴더 경로 (예: C:\Users\user\Pictures)"
                          value={sourcePath}
                          onChange={(e) => setSourcePath(e.target.value)}
                          disabled={status !== 'idle' && status !== 'error' && status !== 'success'}
                          className="w-full pl-14 pr-4 py-5 rounded-[24px] text-sm font-bold outline-none border bg-zinc-950 border-zinc-800 focus:border-rose-400 disabled:opacity-50"
                        />
                     </div>
                  </div>

                  {status !== 'idle' && status !== 'error' && status !== 'success' && status !== 'scanning' && (
                    <div className="space-y-3">
                       <div className="flex justify-between items-end">
                          <span className="text-[10px] font-black uppercase text-rose-400">
                             {status === 'analyzing' ? '날짜 분석 중...' : status === 'executing' ? '파일 정리 중...' : '준비 완료'}
                          </span>
                          <span className="text-xs font-mono font-bold">
                             {Math.round(((results.moved + results.errors + results.duplicated) / (status === 'executing' ? fileMap.length : filesToProcess.length)) * 100)}%
                          </span>
                       </div>
                       <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${((results.moved + results.errors + results.duplicated) / Math.max(1, status === 'executing' ? fileMap.length : filesToProcess.length)) * 100}%` }}
                            className="h-full bg-gradient-to-r from-rose-500 to-orange-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                          />
                       </div>

                       <div className="h-32 w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] overflow-y-auto text-zinc-400">
                          {log.map((entry, i) => <div key={i} className="mb-0.5 truncate">{entry}</div>)}
                       </div>
                    </div>
                  )}

                  {(status === 'idle' || status === 'error' || status === 'success') && (
                    <div className="flex flex-col gap-4">
                       <div className="flex items-center gap-3">
                          <button 
                            onClick={() => setOrganizeInPlace(!organizeInPlace)}
                            className={`w-12 h-6 rounded-full transition-all relative ${organizeInPlace ? 'bg-rose-400' : 'bg-zinc-700'}`}
                          >
                             <motion.div animate={{ x: organizeInPlace ? 26 : 4 }} className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                          </button>
                          <span className="text-xs font-black uppercase tracking-wider">현재 폴더 안에 정리하기</span>
                       </div>
                       {!organizeInPlace && (
                          <div className="space-y-2">
                             <input 
                               type="text" 
                               placeholder="저장할 폴더 경로"
                               value={destPath}
                               onChange={(e) => setDestPath(e.target.value)}
                               className="w-full px-5 py-4 rounded-[20px] text-sm font-bold bg-zinc-950 border border-zinc-800 focus:border-rose-400"
                             />
                          </div>
                       )}
                    </div>
                  )}
               </div>

               <div className="flex gap-4">
                  {status === 'idle' || status === 'error' || status === 'success' ? (
                    <button 
                      onClick={handleStart}
                      className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                       <Play className="w-5 h-5 fill-current" /> 정리 시작
                    </button>
                  ) : status === 'ready' ? (
                    <button 
                      onClick={handleExecuteMove}
                      className="flex-1 py-4 rounded-2xl bg-rose-500 text-white font-black uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                       <ShieldCheck className="w-5 h-5" /> 파일 이동 시작
                    </button>
                  ) : (
                    <button onClick={handleStop} className="flex-1 py-4 rounded-2xl bg-zinc-800 text-red-500 font-black flex items-center justify-center gap-2">
                       <Square className="w-4 h-4 fill-current" /> 중단
                    </button>
                  )}
               </div>
            </div>
        </section>
      </div>
    </div>
  );
}
