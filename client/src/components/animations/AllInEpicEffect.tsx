import React from 'react';
import { Flame, Zap } from 'lucide-react';

export const AllInEpicEffect: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden animate-allin-shake">
      {/* 四周暗红雷电血怒暗角外发光 */}
      <div className="absolute inset-0 border-8 border-red-600/80 shadow-[inset_0_0_100px_rgba(220,38,38,0.8)] animate-pulse" />

      {/* 闪烁闪电角标 */}
      <Zap className="absolute top-8 left-8 w-16 h-16 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,1)] animate-bounce" />
      <Zap className="absolute top-8 right-8 w-16 h-16 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,1)] animate-bounce" />

      {/* 屏幕正中金色烈焰 All-in 浮空徽章 */}
      <div className="flex flex-col items-center justify-center p-6 bg-red-950/80 border-4 border-amber-400 rounded-3xl shadow-[0_0_80px_rgba(239,68,68,1)] backdrop-blur-sm animate-scale-up">
        <Flame className="w-16 h-16 text-amber-400 animate-pulse drop-shadow-[0_0_20px_rgba(251,191,36,1)]" />
        <span className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-amber-400 to-red-600 tracking-wider">
          ALL - IN !
        </span>
        <span className="text-xs md:text-sm font-bold text-amber-200 mt-2 tracking-widest uppercase">
          孤 注 一 掷 · 绝 境 亮 剑
        </span>
      </div>
    </div>
  );
};
