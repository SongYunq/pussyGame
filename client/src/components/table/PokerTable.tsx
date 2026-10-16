import React from 'react';
import { RoomState } from '../../types/game';
import { useTableLayout } from '../../hooks/useTableLayout';
import { TableSeat } from './TableSeat';
import { FlyingChipStack } from './FlyingChipStack';
import { Coins } from 'lucide-react';
import { FloatingBubble, FlyingChip } from '../../store/useGameStore';

interface PokerTableProps {
  roomState: RoomState;
  myUserId: number;
  isPKSelecting: boolean;
  onSelectPKTarget: (targetPlayerId: number) => void;
  floatingBubbles: FloatingBubble[];
  flyingChips: FlyingChip[];
}

export const PokerTable: React.FC<PokerTableProps> = ({
  roomState,
  myUserId,
  isPKSelecting,
  onSelectPKTarget,
  floatingBubbles,
  flyingChips,
}) => {
  const calculatedSeats = useTableLayout(roomState.seats, myUserId);
  const hasIncomingChips = flyingChips.length > 0;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-3 select-none overflow-hidden">
      {/* 牌桌主体椭圆外框 */}
      <div className="relative w-full max-w-4xl h-[480px] md:h-[560px] rounded-[180px] md:rounded-[240px] poker-rim bg-gradient-to-b from-[#2b1704] via-[#1a0e02] to-[#2b1704] p-3 md:p-4 border-4 border-amber-600/40 shadow-2xl">
        {/* 内层深色高档绿色毛呢桌面 */}
        <div className="relative w-full h-full rounded-[160px] md:rounded-[220px] poker-felt-texture border-2 border-emerald-500/20 flex items-center justify-center">
          {/* 桌面暗色金线装饰椭圆 */}
          <div className="absolute inset-8 rounded-[140px] md:rounded-[200px] border border-amber-400/15 pointer-events-none" />

          {/* 桌面中央底池与对局信息 */}
          <div
            className={`relative z-10 flex flex-col items-center justify-center p-3 rounded-2xl bg-black/40 backdrop-blur-sm border transition-all duration-300 shadow-2xl ${
              hasIncomingChips
                ? 'border-amber-400/70 shadow-[0_0_28px_rgba(251,191,36,0.35)] scale-[1.03]'
                : 'border-amber-500/20'
            }`}
          >
            {/* 轮数与状态标签 */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-amber-400/90 font-mono font-bold bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/30">
                第 {roomState.currentRound} / 20 轮
              </span>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                底注: {roomState.baseAnte}
              </span>
            </div>

            {/* 中央总奖池 */}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-300 flex items-center justify-center shadow-lg animate-pulse">
                <Coins className="w-4 h-4 text-slate-950" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold tracking-wider">当前总底池</span>
                <span className="text-xl md:text-2xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-200">
                  {roomState.totalPot.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 当前单注基准 */}
            <div className="text-[10px] text-amber-300/80 font-mono mt-1">
              单注基准: <span className="font-bold text-amber-300">{roomState.currentBet}</span> (明注 {roomState.currentBet * 2})
            </div>
          </div>

          {/* 玩家身前出现并移向牌桌中央的立体筹码堆动画层 */}
          {flyingChips.map((chip) => {
            const seatPos = calculatedSeats.find((s) => s.seatIndex === chip.fromSeatIndex);
            const startX = seatPos ? seatPos.chipXPercent : 50;
            const startY = seatPos ? seatPos.chipYPercent : 69;

            return (
              <FlyingChipStack
                key={chip.id}
                chip={chip}
                startXPercent={startX}
                startYPercent={startY}
                endXPercent={50}
                endYPercent={50}
              />
            );
          })}

          {/* 动态 8 人自适应桌位渲染（外圈贴边头像 + 内圈朝向中心手牌） */}
          {calculatedSeats.map((item) => {
            if (!item.seat) return null;
            const bubble = floatingBubbles.find((b) => b.playerId === item.seat?.user?.id) || null;
            const isCurrentTurn = roomState.currentTurnPlayerId === item.seat.user?.id;

            return (
              <TableSeat
                key={item.seatIndex}
                seat={item.seat}
                isMe={item.isMe}
                isCurrentTurn={isCurrentTurn}
                turnDeadline={roomState.turnDeadline}
                isPKSelecting={isPKSelecting}
                onSelectPKTarget={onSelectPKTarget}
                floatingBubble={bubble}
                xPercent={item.xPercent}
                yPercent={item.yPercent}
                cardXPercent={item.cardXPercent}
                cardYPercent={item.cardYPercent}
                cardAngleDeg={item.cardAngleDeg}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
