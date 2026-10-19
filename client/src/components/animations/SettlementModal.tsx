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
  const winnerIds = settlementEvent.winnerIds ?? (settlementEvent.winnerId === null ? [] : [settlementEvent.winnerId]);
  const winners = seats.filter(seat => seat?.user && winnerIds.includes(seat.user.id));
  const shared = winnerIds.length > 1;

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

  if (!winners.length) return null;

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
            {shared ? '平 分 奖 池' : '终 局 大 捷'}
          </h2>
          <span className="text-xs text-slate-400">
            {shared ? '235 循环克制，存活玩家平分底池' : settlementEvent.reason === 'last_survivor' ? '对手悉数出局，一人独揽全池' : '打满20轮巅峰对决开牌结算'}
          </span>
        </div>

        <div className="mt-5 w-full max-h-[50vh] overflow-y-auto space-y-4">
          {winners.map(winnerSeat => {
            const user = winnerSeat!.user!;
            const payout = settlementEvent.payouts?.find(p => p.playerId === user.id)?.amount ?? settlementEvent.winAmount;
            const revealed = settlementEvent.revealedCards.find(hand => hand.playerId === user.id);
            return <div key={user.id} className="flex flex-col items-center rounded-2xl border border-amber-500/20 p-3">
              <div className="text-3xl">{user.avatar}</div>
              <span className="mt-1 font-bold text-slate-100">{user.nickname}</span>
              <div className="mt-2 flex items-center gap-2 text-amber-400 font-black"><Coins className="w-4 h-4" />+{payout.toLocaleString()} 筹码</div>
              {revealed && <><div className="mt-3 flex justify-center items-center gap-1">{revealed.cards.map((card, index) => <Card3D key={index} card={card} isRevealed={true} fanIndex={index} size="sm" />)}</div><span className="mt-2 text-xs font-bold text-amber-400">{revealed.handTypeName}</span></>}
            </div>;
          })}
        </div>

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
            <span>{onNextRound ? '再来一局' : '返回牌桌'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
