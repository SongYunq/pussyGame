import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { GameOverEvent, TableSeat } from '../../types/game';
import { Card3D } from '../table/Card3D';
import { Trophy, Coins, RotateCcw } from 'lucide-react';

interface SettlementModalProps {
  settlementEvent: GameOverEvent;
  seats: (TableSeat | null)[];
  onClose: () => void;
  onNextRound?: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  settlementEvent,
  seats,
  onClose,
  onNextRound,
}) => {
  const winnerSeat = seats.find((s) => s?.user?.id === settlementEvent.winnerId);

  useEffect(() => {
    // 燃放胜利礼花
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // 容错
    }
  }, []);

  if (!winnerSeat?.user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/50 rounded-3xl p-6 shadow-[0_0_50px_rgba(245,158,11,0.4)] flex flex-col items-center">
        {/* 顶部奖杯 */}
        <div className="absolute -top-10 w-20 h-20 rounded-full bg-gradient-to-b from-yellow-300 via-amber-500 to-amber-700 flex items-center justify-center shadow-[0_0_30px_rgba(251,191,36,0.8)] border-4 border-slate-950">
          <Trophy className="w-10 h-10 text-slate-950 drop-shadow" />
        </div>

        {/* 标题 */}
        <div className="mt-8 text-center">
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-100 tracking-wider">
            终 局 大 捷
          </h2>
          <span className="text-xs text-slate-400">
            {settlementEvent.reason === 'last_survivor' ? '对手悉数出局，一人独揽全池' : '打满20轮巅峰对决开牌结算'}
          </span>
        </div>

        {/* 赢家头像与信息 */}
        <div className="mt-5 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-lg ring-4 ring-amber-400/20">
            {winnerSeat.user.avatar}
          </div>
          <span className="mt-2 text-base font-extrabold text-slate-100">
            {winnerSeat.user.nickname}
          </span>
        </div>

        {/* 独揽筹码数值 */}
        <div className="mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/40 px-5 py-2 rounded-2xl shadow-inner">
          <Coins className="w-6 h-6 text-amber-400 animate-bounce" />
          <span className="text-2xl font-black font-mono text-amber-400">
            +{settlementEvent.winAmount.toLocaleString()}
          </span>
          <span className="text-xs text-amber-300/80 font-bold">筹码</span>
        </div>

        {/* 赢家牌型 (如有亮牌) */}
        {settlementEvent.revealedCards && settlementEvent.revealedCards.length > 0 && (
          <div className="mt-5 w-full flex flex-col items-center">
            <span className="text-xs text-slate-400 mb-2">获胜牌型：</span>
            <div className="flex justify-center items-center gap-1">
              {settlementEvent.revealedCards[0].cards.map((c, i) => (
                <Card3D key={i} card={c} isRevealed={true} fanIndex={i} size="sm" />
              ))}
            </div>
            <span className="mt-2 text-xs font-bold text-amber-400 bg-amber-950/60 px-3 py-0.5 rounded-full border border-amber-500/30">
              {settlementEvent.revealedCards[0].handTypeName}
            </span>
          </div>
        )}

        {/* 底部按钮 */}
        <div className="mt-6 w-full flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
          >
            关闭战报
          </button>
          <button
            onClick={() => {
              onClose();
              if (onNextRound) onNextRound();
            }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/30 flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>再来一局</span>
          </button>
        </div>
      </div>
    </div>
  );
};
