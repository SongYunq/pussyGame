import React, { useMemo } from 'react';
import { TableSeat as TableSeatType } from '../../types/game';
import { Card3D } from './Card3D';
import { evaluateHand } from '../../utils/pokerEvaluator';
import { Swords } from 'lucide-react';

interface TableSeatProps {
  seat: TableSeatType;
  isMe: boolean;
  isCurrentTurn: boolean;
  turnDeadline: number | null;
  isPKSelecting: boolean;
  onSelectPKTarget: (playerId: number) => void;
  floatingBubble?: { type: 'emoji' | 'phrase'; content: string } | null;
}

export const TableSeat: React.FC<TableSeatProps> = ({
  seat,
  isMe,
  isCurrentTurn,
  isPKSelecting,
  onSelectPKTarget,
  floatingBubble,
}) => {
  const user = seat.user;
  if (!user) return null;

  // 自身手牌识别
  const handEvaluation = useMemo(() => {
    if (isMe && seat.hasLooked && seat.cards && seat.cards.length === 3) {
      return evaluateHand(seat.cards);
    }
    return null;
  }, [isMe, seat.hasLooked, seat.cards]);

  const isAlive = seat.status === 'active';
  const isFolded = seat.status === 'folded';
  const isLost = seat.status === 'lost';
  const canBePKTarget = isPKSelecting && !isMe && isAlive;

  return (
    <div
      className={`relative flex flex-col items-center select-none transition-all duration-300 ${
        canBePKTarget ? 'cursor-pointer scale-105' : ''
      }`}
      onClick={() => {
        if (canBePKTarget) {
          onSelectPKTarget(user.id);
        }
      }}
    >
      {/* 浮动表情/短语对话框 */}
      {floatingBubble && (
        <div className="absolute -top-12 z-40 pointer-events-none animate-float-up">
          {floatingBubble.type === 'emoji' ? (
            <div className="text-3xl filter drop-shadow-md">{floatingBubble.content}</div>
          ) : (
            <div className="bg-white/95 text-slate-900 text-xs px-2.5 py-1.5 rounded-xl font-bold shadow-2xl border border-amber-300 relative whitespace-nowrap">
              {floatingBubble.content}
              <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-white rotate-45 -translate-x-1/2"></div>
            </div>
          )}
        </div>
      )}

      {/* PK 挑战目标靶心标识 */}
      {canBePKTarget && (
        <div className="absolute -top-7 z-30 flex items-center gap-1 bg-red-600/90 text-white text-[11px] px-2 py-0.5 rounded-full font-bold shadow-lg animate-bounce border border-amber-300">
          <Swords className="w-3 h-3" />
          <span>点击对决</span>
        </div>
      )}

      {/* 手牌卡组区 */}
      <div className="relative mb-1 flex justify-center items-center h-14">
        {seat.status !== 'empty' && seat.status !== 'sitting' && (
          <div className="flex items-center justify-center">
            {[0, 1, 2].map((idx) => {
              const card = seat.cards ? seat.cards[idx] : null;
              return (
                <Card3D
                  key={idx}
                  card={card}
                  isRevealed={seat.hasLooked && (isMe || Boolean(seat.cards))}
                  fanIndex={idx}
                  size={isMe ? 'md' : 'sm'}
                  isFolded={isFolded || isLost}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 自身牌型识别标签 */}
      {isMe && seat.hasLooked && handEvaluation && (
        <div className="mb-1 px-2 py-0.5 bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 text-[10px] font-black rounded-full shadow-md border border-yellow-200 uppercase tracking-tight animate-fade-in">
          {handEvaluation.name}
        </div>
      )}

      {/* 头像与外环轮廓 */}
      <div className="relative">
        <div
          className={`relative w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${
            isCurrentTurn
              ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-105'
              : canBePKTarget
              ? 'ring-4 ring-red-500 animate-pulse'
              : 'ring-2 ring-slate-700'
          } ${isFolded || isLost ? 'grayscale opacity-50 bg-slate-800' : 'bg-gradient-to-b from-slate-700 to-slate-900'}`}
        >
          <span>{user.avatar || '👤'}</span>

          {/* 战败/淘汰印戳 */}
          {isLost && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
              <span className="text-red-500 font-black text-sm border-2 border-red-500 px-1 py-0.5 rotate-[-20deg] rounded">
                战败
              </span>
            </div>
          )}

          {/* 弃牌标识 */}
          {isFolded && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <span className="text-slate-400 font-bold text-xs">弃牌</span>
            </div>
          )}
        </div>

        {/* 已看牌角标 */}
        {seat.hasLooked && isAlive && (
          <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[9px] px-1 py-0.2 rounded font-bold shadow border border-blue-300">
            明注
          </span>
        )}
      </div>

      {/* 玩家名称与筹码余额 */}
      <div className="mt-1 flex flex-col items-center">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-slate-200 max-w-[70px] truncate">
            {user.nickname}
          </span>
          {isMe && <span className="text-[9px] text-amber-400 font-extrabold">(我)</span>}
        </div>

        {/* 钱包筹码 */}
        <div className="flex items-center gap-0.5 text-[10px] text-amber-400 font-mono font-bold bg-slate-950/80 px-1.5 py-0.5 rounded-full border border-amber-500/20 shadow-inner">
          <span>🪙</span>
          <span>{user.balance.toLocaleString()}</span>
        </div>

        {/* 本局累计投入 */}
        {seat.currentInvested > 0 && (
          <div className="text-[9px] text-emerald-400 font-mono mt-0.5">
            下注: {seat.currentInvested}
          </div>
        )}
      </div>
    </div>
  );
};
