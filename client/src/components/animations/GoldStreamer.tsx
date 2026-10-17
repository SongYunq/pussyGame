import React from 'react';
import { Crown, Sparkles, Volume2, Coins } from 'lucide-react';
import { AllInEffectInfo } from '../../store/useGameStore';

interface GoldStreamerProps {
  info?: AllInEffectInfo | null;
}

const FULLSCREEN_SPARKS = [
  { id: 1, left: '8%', bottom: '10%', size: 8, delay: '0ms', duration: '2400ms', drift: '30px' },
  { id: 2, left: '16%', bottom: '18%', size: 5, delay: '120ms', duration: '2600ms', drift: '-20px' },
  { id: 3, left: '24%', bottom: '8%', size: 7, delay: '60ms', duration: '2200ms', drift: '25px' },
  { id: 4, left: '34%', bottom: '14%', size: 6, delay: '220ms', duration: '2500ms', drift: '-18px' },
  { id: 5, left: '44%', bottom: '6%', size: 8, delay: '90ms', duration: '2300ms', drift: '15px' },
  { id: 6, left: '56%', bottom: '8%', size: 7, delay: '160ms', duration: '2450ms', drift: '-22px' },
  { id: 7, left: '66%', bottom: '16%', size: 6, delay: '40ms', duration: '2550ms', drift: '24px' },
  { id: 8, left: '76%', bottom: '10%', size: 8, delay: '190ms', duration: '2350ms', drift: '-28px' },
  { id: 9, left: '84%', bottom: '20%', size: 5, delay: '100ms', duration: '2650ms', drift: '18px' },
  { id: 10, left: '92%', bottom: '12%', size: 7, delay: '140ms', duration: '2400ms', drift: '-24px' },
  { id: 11, left: '12%', bottom: '38%', size: 6, delay: '260ms', duration: '2300ms', drift: '22px' },
  { id: 12, left: '28%', bottom: '45%', size: 5, delay: '310ms', duration: '2400ms', drift: '-16px' },
  { id: 13, left: '72%', bottom: '42%', size: 5, delay: '280ms', duration: '2450ms', drift: '20px' },
  { id: 14, left: '88%', bottom: '36%', size: 6, delay: '200ms', duration: '2350ms', drift: '-20px' },
] as const;

export const GoldStreamer: React.FC<GoldStreamerProps> = ({ info }) => {
  const nickname = (info?.nickname || '贵宾玩家').trim();
  const numericAmount =
    typeof info?.amount === 'number' && info.amount > 0 ? Math.round(info.amount) : 5000;

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-auto select-none flex items-center justify-center overflow-hidden bg-slate-950/88 backdrop-blur-md animate-gold-backdrop"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* 1. 全屏径向鎏金皇室圣光底幕 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(245, 158, 11, 0.34) 0%, rgba(180, 83, 9, 0.18) 38%, rgba(15, 23, 42, 0.92) 78%)',
        }}
      />

      {/* 2. 中央缓慢旋转的巨型皇家太阳金芒射线 */}
      <div
        className="absolute left-1/2 top-1/2 w-[900px] h-[900px] md:w-[1200px] md:h-[1200px] rounded-full opacity-30 pointer-events-none animate-gold-rays"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(250, 204, 21, 0.38) 0deg 8deg, transparent 8deg 20deg)',
          maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 15%, rgba(0,0,0,0) 70%)',
          WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 15%, rgba(0,0,0,0) 70%)',
        }}
      />

      {/* 3. 全屏上下鎏金边框修饰线 */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-yellow-300 to-transparent shadow-[0_0_30px_rgba(250,204,21,1)]" />
      <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_30px_rgba(245,158,11,1)]" />

      {/* 4. 满屏升腾的鎏金星尘粒子 */}
      {FULLSCREEN_SPARKS.map((spark) => (
        <span
          key={spark.id}
          className="absolute rounded-full bg-gradient-to-t from-amber-500 via-yellow-300 to-yellow-100 shadow-[0_0_16px_rgba(250,204,21,0.95)] pointer-events-none animate-allin-ember"
          style={
            {
              left: spark.left,
              bottom: spark.bottom,
              width: `${spark.size}px`,
              height: `${spark.size}px`,
              animationDelay: spark.delay,
              '--ember-duration': spark.duration,
              '--ember-drift': spark.drift,
            } as React.CSSProperties
          }
        />
      ))}

      {/* 5. 中央全屏大金盛典主舞台 */}
      <div className="relative z-10 w-[92%] max-w-xl mx-auto flex flex-col items-center text-center animate-gold-stage">
        {/* 顶部皇冠圣徽与扩散波纹 */}
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-amber-400/25 animate-ping" />
          <div className="absolute w-28 h-28 rounded-full border-2 border-yellow-300/40 animate-pulse" />
          <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-700 p-1 shadow-[0_0_60px_rgba(250,204,21,0.95)] flex items-center justify-center border-2 border-yellow-100">
            <div className="w-full h-full rounded-full bg-gradient-to-b from-amber-900 via-slate-950 to-amber-950 flex items-center justify-center">
              <Crown className="w-10 h-10 md:w-12 md:h-12 text-yellow-300 fill-yellow-400 drop-shadow-[0_0_16px_rgba(250,204,21,0.9)]" />
            </div>
          </div>
        </div>

        {/* 女声语音播报状态胶囊 */}
        <div className="mb-2 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-500/20 border border-yellow-300/50 text-yellow-200 text-xs font-bold tracking-widest shadow-lg">
          <Volume2 className="w-3.5 h-3.5 text-yellow-300 animate-bounce" />
          <span>全桌尊享语音播报</span>
          <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
        </div>

        {/* 巨幅 3D 鎏金主标题：恭喜大金 */}
        <h1
          className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[0.18em] text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-300 to-amber-600 select-none my-1"
          style={{
            filter:
              'drop-shadow(0 4px 0px #78350f) drop-shadow(0 10px 30px rgba(245, 158, 11, 0.85))',
          }}
        >
          恭喜大金
        </h1>

        {/* 核心播报战报殿堂卡片 */}
        <div className="relative mt-4 w-full px-6 py-5 md:px-8 md:py-6 rounded-3xl bg-gradient-to-b from-amber-950/95 via-slate-950/95 to-amber-950/95 border-2 border-yellow-400/90 shadow-[0_20px_70px_rgba(245,158,11,0.55),inset_0_0_30px_rgba(250,204,21,0.2)] overflow-hidden">
          {/* 表面高光扫掠 */}
          <div className="absolute inset-y-0 w-28 bg-gradient-to-r from-transparent via-yellow-200/30 to-transparent pointer-events-none animate-allin-sheen" />

          {/* 玩家昵称高亮展示 */}
          <div className="relative flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500/25 via-yellow-400/30 to-amber-500/25 border border-yellow-300/60">
              <span className="text-lg md:text-2xl font-black text-yellow-100 tracking-wide">
                {nickname}
              </span>
            </div>

            {/* 首次下注 XXXX 码（与实际押注金额严格一致） */}
            <div className="mt-1 flex flex-wrap items-baseline justify-center gap-2 md:gap-3">
              <span className="text-xl md:text-3xl font-extrabold text-amber-200 tracking-wider">
                首次下注
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-4 py-1 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-slate-950 font-mono font-black text-2xl md:text-4xl shadow-[0_0_30px_rgba(250,204,21,0.8)] border-2 border-yellow-100"
              >
                <Coins className="w-6 h-6 md:w-7 md:h-7 text-amber-950 shrink-0" />
                <span>{numericAmount}</span>
              </span>
              <span className="text-xl md:text-3xl font-extrabold text-amber-200 tracking-wider">
                码
              </span>
            </div>

            {/* 播报台词印证 */}
            <p className="mt-2 text-xs md:text-sm font-bold text-yellow-200/80 tracking-widest">
              “恭喜大金！豪气冲天，一掷千金，全场瞩目！”
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
