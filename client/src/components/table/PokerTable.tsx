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

  // 径向距离（距离中心 50%,50% 的椭圆半轴百分比）：既向中间推进，又明显靠近加注玩家一侧
  const rowRadiusOffsets = [0, -3.2, 2.8];
  const rOffset = rowRadiusOffsets[row] ?? 0;
  // 偶数列轻微前后错落 0.5%，营造真实赌场推码的层次感
  const stagger = Math.abs(col) % 2 === 1 ? -0.55 : 0;

  const baseRx = seatPos.isMe ? 15.2 : 19.8;
  const baseRy = seatPos.isMe ? 13.2 : 15.8;
  const radialRx = baseRx + rOffset + stagger;
  const radialRy = baseRy + rOffset * 0.82 + stagger;

  const cosA = Math.cos(seatPos.angleRad);
  const sinA = Math.sin(seatPos.angleRad);
  // 切向单位向量（沿玩家座位前方的桌面弧线横向展开）
  const tanX = -sinA;
  const tanY = cosA;

  const tangentStepX = 3.25;
  const tangentStepY = 2.65;

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

          {/* 正中央：仅保留无胶囊的总池金额 */}
          <div className="relative z-20 pointer-events-none flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold tracking-widest text-amber-300/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              总池
            </span>
            <span className="text-lg md:text-2xl font-black font-mono tracking-tight text-yellow-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] [text-shadow:0_0_14px_rgba(250,204,21,0.55)]">
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
