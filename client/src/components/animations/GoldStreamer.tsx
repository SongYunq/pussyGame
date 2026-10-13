import React from 'react';
import { Sparkles, Coins } from 'lucide-react';

export const GoldStreamer: React.FC = () => {
  return (
    <div className="fixed top-16 inset-x-0 z-50 pointer-events-none flex justify-center animate-fade-in">
      <div className="relative px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-600 shadow-[0_0_40px_rgba(245,158,11,0.9)] border-2 border-yellow-200 flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-slate-950 animate-spin" />
        <Coins className="w-6 h-6 text-slate-950 animate-bounce" />
        <div className="flex flex-col">
          <span className="text-slate-950 font-black text-sm md:text-base tracking-widest uppercase">
            豪气冲天 · 大额加注！
          </span>
          <span className="text-slate-900 text-[10px] font-bold">
            单手掷注 5,000+，全场目光聚集！
          </span>
        </div>
        <Sparkles className="w-6 h-6 text-slate-950 animate-spin" />
      </div>
    </div>
  );
};
