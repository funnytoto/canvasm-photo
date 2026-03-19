import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Camera, FolderHeart, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <React.Fragment>
      <Head>
        <title>canvasM-Photo Standalone</title>
      </Head>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-4">
            <div className="w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-[32px] flex items-center justify-center mx-auto text-rose-500">
              <FolderHeart className="w-12 h-12" />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-black italic uppercase tracking-tight">추억<span className="text-rose-400">개기</span></h1>
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.3em] font-bold">Standalone Desktop Edition</p>
            </div>
          </div>

          <div className="p-8 rounded-[40px] bg-zinc-900/40 border border-zinc-800 space-y-6">
            <p className="text-sm text-zinc-400 font-medium leading-relaxed">
              분산된 수천 장의 사진과 영상을 <br/>
              직접 로컬 서버 권한으로 안전하고 빠르게 <br/>
              날짜별로 정리합니다.
            </p>
            
            <Link 
              href="/photo"
              className="w-full py-4 rounded-2xl bg-rose-500 text-white font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-600 transition-all shadow-xl shadow-rose-500/10 group"
            >
              정리하러 가기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">© 2026 canvasM Lab. All rights reserved.</p>
        </div>
      </div>
    </React.Fragment>
  );
}
