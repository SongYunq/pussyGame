import React, { useEffect, useState } from 'react';
import { CompareResultEvent, TableSeat } from '../../types/game';
import { Swords, Flame, Sparkles } from 'lucide-react';

interface PKClashModalProps {
  clashEvent: CompareResultEvent;
  seats: (TableSeat | null)[];
  onClose: () => void;
}

export const PKClashModal: React.FC<PKClashModalProps> = ({
  clashEvent,
  seats,
  onClose,
}) => {
  const [animationPhase, setAnimationPhase] = useState<'approaching' | 'clashed' | 'result'>('approaching');

  const initiatorSeat = seats.find((s) => s?.user?.id === clashEvent.initiatorId);
  const targetSeat = seats.find((s) => s?.user?.id === clashEvent.targetId);

  useEffect(() => {
    // 阶段1：两张卡牌对撞逼近 (400ms)
    const t1 = setTimeout(() => {
      setAnimationPhase('clashed');
    }, 450);

    // 阶段2：碰撞爆炸与裁决 (900ms)
    const t2 = setTimeout(() => {
      setAnimationPhase('result');
    }, 1100);

    // 阶段3：展示完毕自动淡出关闭 (2400ms)
    const t3 = setTimeout(() => {
      onClose();
    }, 2800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onClose]);

  if (!initiatorSeat?.user || !targetSeat?.user) return null;

  const isInitiatorWin = clashEvent.winnerId === clashEvent.initiatorId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in select-none">
      {/* 顶部标题 */}
      <div className="absolute top-12 flex flex-col items-center">
        <div className="flex items-center gap-2 text-amber-400 font-black text-2xl tracking-widest drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">
          <Swords className="w-8 h-8 text-rose-500 animate-pulse" />
          <span>绝 密 对 决</span>
          <Swords className="w-8 h-8 text-rose-500 animate-pulse scale-x-[-1]" />
        </div>
        <div className="text-xs text-slate-400 mt-1">底牌绝密暗封 · 仅由裁判裁定胜负</div>
      </div>

      {/* 决斗舞台 */}
      <div className="relative w-full max-w-lg h-72 flex items-center justify-between px-8">
        {/* 左侧发起方 */}
        <div
          className={`flex flex-col items-center transition-all duration-500 ${
            animationPhase === 'approaching'
              ? 'translate-x-12'
              : animationPhase === 'clashed'
              ? 'translate-x-8 scale-95'
              : 'translate-x-0'
          }`}
        >
          <div className="relative mb-2">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-xl">
              {initiatorSeat.user.avatar}
            </div>
            {animationPhase === 'result' && !isInitiatorWin && (
              <div className="absolute inset-0 bg-black/75 rounded-full flex items-center justify-center">
                <span className="text-red-500 font-black text-lg border-2 border-red-500 px-2 py-0.5 -rotate-12 rounded">
                  战败
                </span>
              </div>
            )}
          </div>
          <span className="text-sm font-bold text-slate-200">{initiatorSeat.user.nickname}</span>
          <span className="text-xs text-amber-400 font-mono mt-0.5">挑战者</span>

          {/* 暗色扑克背面 */}
          <div className="mt-3 w-16 h-24 rounded-lg bg-gradient-to-br from-indigo-900 via-blue-950 to-slate-900 border-2 border-amber-500/50 shadow-2xl flex items-center justify-center">
            <span className="text-2xl text-amber-400/80">♠</span>
          </div>
        </div>

        {/* 中央碰撞特效区 */}
        <div className="relative flex flex-col items-center justify-center">
          {animationPhase === 'clashed' && (
            <div className="absolute z-20 flex items-center justify-center animate-ping pointer-events-none">
              <Flame className="w-28 h-28 text-amber-500 drop-shadow-[0_0_30px_rgba(245,158,11,1)]" />
            </div>
          )}

          <div className="p-4 rounded-full bg-red-950/40 border border-red-500/40 text-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]">
            <Swords className="w-10 h-10 animate-bounce" />
          </div>

          <div className="mt-3 text-xs text-rose-400 font-mono font-bold tracking-wider">
            消耗底池: +{clashEvent.cost}
          </div>
        </div>

        {/* 右侧被挑战方 */}
        <div
          className={`flex flex-col items-center transition-all duration-500 ${
            animationPhase === 'approaching'
              ? '-translate-x-12'
              : animationPhase === 'clashed'
              ? '-translate-x-8 scale-95'
              : 'translate-x-0'
          }`}
        >
          <div className="relative mb-2">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-xl">
              {targetSeat.user.avatar}
            </div>
            {animationPhase === 'result' && isInitiatorWin && (
              <div className="absolute inset-0 bg-black/75 rounded-full flex items-center justify-center">
                <span className="text-red-500 font-black text-lg border-2 border-red-500 px-2 py-0.5 rotate-12 rounded">
                  战败
                </span>
              </div>
            )}
          </div>
          <span className="text-sm font-bold text-slate-200">{targetSeat.user.nickname}</span>
          <span className="text-xs text-rose-400 font-mono mt-0.5">守擂者</span>

          {/* 暗色扑克背面 */}
          <div className="mt-3 w-16 h-24 rounded-lg bg-gradient-to-br from-indigo-900 via-blue-950 to-slate-900 border-2 border-amber-500/50 shadow-2xl flex items-center justify-center">
            <span className="text-2xl text-amber-400/80">♠</span>
          </div>
        </div>
      </div>

      {/* 底部结果告示 */}
      {animationPhase === 'result' && (
        <div className="absolute bottom-16 flex flex-col items-center animate-fade-in">
          <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black px-6 py-2 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.8)] text-base">
            <Sparkles className="w-5 h-5" />
            <span>
              {clashEvent.winnerId === clashEvent.initiatorId
                ? `${initiatorSeat.user.nickname} 决斗获胜！`
                : `${targetSeat.user.nickname} 防守反杀！`}
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-2">败者扣牌出局，筹码已累加进奖池</span>
        </div>
      )}
    </div>
  );
};
