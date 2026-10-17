import React from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { AllInEffectInfo } from '../../store/useGameStore';

interface AllInEpicEffectProps {
  info?: AllInEffectInfo | null;
}

const EDGE_EMBERS = [
  { id: 1, side: 'left', offset: '3%', bottom: '8%', size: 6, delay: '0ms', duration: '1450ms', drift: '22px', color: 'amber' },
  { id: 2, side: 'left', offset: '7%', bottom: '18%', size: 4, delay: '120ms', duration: '1650ms', drift: '14px', color: 'red' },
  { id: 3, side: 'left', offset: '5%', bottom: '32%', size: 5, delay: '60ms', duration: '1500ms', drift: '28px', color: 'amber' },
  { id: 4, side: 'left', offset: '10%', bottom: '12%', size: 3.5, delay: '220ms', duration: '1700ms', drift: '16px', color: 'yellow' },
  { id: 5, side: 'left', offset: '4%', bottom: '45%', size: 4.5, delay: '160ms', duration: '1400ms', drift: '20px', color: 'red' },
  { id: 6, side: 'right', offset: '3%', bottom: '10%', size: 6, delay: '40ms', duration: '1500ms', drift: '-22px', color: 'amber' },
  { id: 7, side: 'right', offset: '8%', bottom: '20%', size: 4, delay: '150ms', duration: '1600ms', drift: '-15px', color: 'red' },
  { id: 8, side: 'right', offset: '5%', bottom: '34%', size: 5, delay: '80ms', duration: '1480ms', drift: '-26px', color: 'amber' },
  { id: 9, side: 'right', offset: '10%', bottom: '14%', size: 3.5, delay: '240ms', duration: '1720ms', drift: '-18px', color: 'yellow' },
  { id: 10, side: 'right', offset: '4%', bottom: '46%', size: 4.5, delay: '180ms', duration: '1420ms', drift: '-20px', color: 'red' },
] as const;

export const AllInEpicEffect: React.FC<AllInEpicEffectProps> = ({ info }) => {
  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden select-none">
      {/* 1. 四周柔和电影感赤金暗角（中央 65% 区域完全通透，绝不遮挡牌桌） */}
      <div
        className="absolute inset-0 animate-allin-vignette"
        style={{
          background:
            'radial-gradient(ellipse at 50% 52%, transparent 64%, rgba(153, 27, 27, 0.22) 84%, rgba(220, 38, 38, 0.52) 100%)',
        }}
      />

      {/* 2. 上下屏幕边缘流光锋线 */}
      <div className="absolute top-[52px] inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/90 to-transparent shadow-[0_0_20px_rgba(251,191,36,0.9)] animate-allin-vignette" />
      <div className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/80 to-transparent shadow-[0_0_24px_rgba(239,68,68,0.9)] animate-allin-vignette" />

      {/* 3. 左右屏幕边缘升腾的赤金火星粒子（仅分布在两侧边缘 3%~10% 处） */}
      {EDGE_EMBERS.map((ember) => {
        const bgClass =
          ember.color === 'amber'
            ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.95)]'
            : ember.color === 'yellow'
              ? 'bg-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.95)]'
              : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.95)]';

        return (
          <span
            key={ember.id}
            className={`absolute rounded-full ${bgClass} animate-allin-ember`}
            style={
              {
                [ember.side]: ember.offset,
                bottom: ember.bottom,
                width: `${ember.size}px`,
                height: `${ember.size}px`,
                animationDelay: ember.delay,
                '--ember-duration': ember.duration,
                '--ember-drift': ember.drift,
              } as React.CSSProperties
            }
          />
        );
      })}

      {/* 4. 顶部悬浮流光战报横幅（置于顶部栏下方，完全避开中央牌桌与玩家座位） */}
      <div className="fixed top-14 md:top-16 inset-x-0 flex justify-center px-4">
        <div className="relative flex items-center gap-3 md:gap-4 px-5 md:px-7 py-2 md:py-2.5 rounded-full bg-gradient-to-r from-red-950/95 via-slate-950/95 to-red-950/95 border border-amber-400/80 shadow-[0_8px_36px_rgba(220,38,38,0.55),0_0_20px_rgba(245,158,11,0.35)] backdrop-blur-md overflow-hidden animate-allin-banner">
          {/* 两侧流光翼角装饰线 */}
          <div className="hidden sm:block w-8 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-red-500 rounded-full" />

          {/* 扫光高光层 */}
          <div className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-amber-200/30 to-transparent pointer-events-none animate-allin-sheen" />

          {/* 左侧烈焰徽标与 ALL IN 金属字 */}
          <div className="relative flex items-center gap-1.5">
            <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 shadow-[0_0_15px_rgba(245,158,11,0.8)]">
              <Flame className="w-4 h-4 text-slate-950 fill-slate-950" />
            </div>
            <span
              className="text-lg md:text-xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-amber-400 to-orange-500"
              style={{
                filter: 'drop-shadow(0 2px 8px rgba(239, 68, 68, 0.75))',
              }}
            >
              ALL IN
            </span>
          </div>

          {/* 竖向能量分割线 */}
          <div className="w-[1px] h-5 bg-gradient-to-b from-transparent via-amber-400/60 to-transparent" />

          {/* 右侧全押玩家与金额战报 */}
          <div className="relative flex items-center gap-2 text-xs md:text-sm">
            {info?.nickname ? (
              <span className="font-extrabold text-amber-100 max-w-[110px] md:max-w-[160px] truncate">
                {info.nickname}
              </span>
            ) : null}
            <span className="font-bold text-red-300 tracking-widest">
              孤注一掷
            </span>
            {typeof info?.amount === 'number' && info.amount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono font-black text-xs shadow-inner">
                🪙 {info.amount.toLocaleString()}
              </span>
            )}
          </div>

          <Sparkles className="w-4 h-4 text-amber-300 shrink-0 animate-pulse" />

          {/* 右侧流光翼角装饰线 */}
          <div className="hidden sm:block w-8 h-[2px] bg-gradient-to-l from-transparent via-amber-400 to-red-500 rounded-full" />
        </div>
      </div>
    </div>
  );
};
