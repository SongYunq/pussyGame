import React from 'react';
import { RoomState } from '../../types/game';
import { CalculatedSeatPosition, useTableLayout } from '../../hooks/useTableLayout';
import { TableSeat } from './TableSeat';
import { FlyingChipStack } from './FlyingChipStack';
import { FloatingBubble, FlyingChip } from '../../store/useGameStore';

interface PokerTableProps {
  roomState: RoomState;
  myUserId: number;
  isPKSelecting: boolean;
  onSelectPKTarget: (targetPlayerId: number) => void;
  floatingBubbles: FloatingBubble[];
  flyingChips: FlyingChip[];
}

/**
 * 计算每摞筹码在对应玩家面前的落点坐标：
 * 筹码从玩家手牌前推向中间，但停留在靠近该玩家的内圈扇区（每排5摞，最多3排），
 * 谁加注多、筹码垒得高且宽，一眼即可分辨。
 */
function getPlayerChipZoneCoords(
  seatPos: CalculatedSeatPosition | undefined,
  stackIndex: number
): { endX: number; endY: number } {
  if (!seatPos) {
    return { endX: 50, endY: 58 };
  }

  const colOrder = [0, -1, 1, -2, 2];
  const row = Math.floor(stackIndex / 5); // 0: 主排, 1: 靠中心前排, 2: 靠玩家后排
  const col = colOrder[stackIndex % 5] ?? 0;

  // 径向距离（距离中心 50%,50% 的椭圆半轴百分比）：既留出正中央微小的数字呼吸区，又紧靠各玩家前方
  const rowRadiusOffsets = seatPos.isMe ? [0, -2.2, -4.2] : [0, -3.0, 2.6];
  const rOffset = rowRadiusOffsets[row] ?? 0;
  // 偶数列轻微前后错落 0.5%，营造真实赌场推码的层次感
  const stagger = Math.abs(col) % 2 === 1 ? -0.55 : 0;

  const baseRx = seatPos.isMe ? 15.0 : 20.2;
  const baseRy = seatPos.isMe ? 13.5 : 16.2;
  const radialRx = baseRx + rOffset + stagger;
  const radialRy = baseRy + rOffset * 0.82 + stagger;

  const cosA = Math.cos(seatPos.angleRad);
  const sinA = Math.sin(seatPos.angleRad);
  // 切向单位向量（沿玩家座位前方的桌面弧线横向展开）
  const tanX = -sinA;
  const tanY = cosA;

  const tangentStepX = 3.35;
  const tangentStepY = 2.75;

  const endX = 50 + radialRx * cosA + col * tangentStepX * tanX;
  const endY = 50 + radialRy * sinA + col * tangentStepY * tanY;

  return {
    endX: Math.round(endX * 100) / 100,
    endY: Math.round(endY * 100) / 100,
  };
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

  return (
    <div className="relative w-full h-full flex items-center justify-center p-3 select-none overflow-hidden">
      {/* 牌桌主体椭圆外框 */}
      <div className="relative w-full max-w-4xl h-[480px] md:h-[560px] rounded-[180px] md:rounded-[240px] poker-rim bg-gradient-to-b from-[#2b1704] via-[#1a0e02] to-[#2b1704] p-3 md:p-4 border-4 border-amber-600/40 shadow-2xl">
        {/* 内层深色高档绿色毛呢桌面 */}
        <div className="relative w-full h-full rounded-[160px] md:rounded-[220px] poker-felt-texture border-2 border-emerald-500/20 flex items-center justify-center">
          {/* 桌面暗色金线装饰椭圆 */}
          <div className="absolute inset-8 rounded-[140px] md:rounded-[200px] border border-amber-400/15 pointer-events-none" />

          {/* 正中央偏上：无光晕半透明全息金字 */}
          <div className="relative z-30 -translate-y-12 md:-translate-y-14 pointer-events-none flex flex-col items-center justify-center">
            <span className="text-[10px] font-extrabold tracking-[0.25em] text-amber-200/65">
              TOTAL
            </span>
            <span
              className="text-xl md:text-3xl font-black font-mono tracking-tight leading-none"
              style={{
                color: 'rgba(253, 224, 71, 0.72)',
                WebkitTextStroke: '0.75px rgba(254, 249, 195, 0.88)',
              }}
            >
              {roomState.totalPot.toLocaleString()}
            </span>
          </div>

          {/* 玩家推向中间但停留在各自前方阵地的立体筹码堆层 */}
          {flyingChips.map((chip) => {
            const seatPos = calculatedSeats.find((s) => s.seatIndex === chip.fromSeatIndex);
            const startX = seatPos ? seatPos.chipXPercent : 50;
            const startY = seatPos ? seatPos.chipYPercent : 69;
            const { endX, endY } = getPlayerChipZoneCoords(seatPos, chip.seatStackIndex ?? 0);

            return (
              <FlyingChipStack
                key={chip.id}
                chip={chip}
                startXPercent={startX}
                startYPercent={startY}
                endXPercent={endX}
                endYPercent={endY}
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
