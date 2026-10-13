import { useMemo } from 'react';
import { TableSeat } from '../types/game';

export interface CalculatedSeatPosition {
  seatIndex: number;
  seat: TableSeat | null;
  isMe: boolean;
  xPercent: number; // 0 ~ 100%
  yPercent: number; // 0 ~ 100%
}

/**
 * 动态 8 人自适应桌位第一人称排布算法 Hook
 * 核心数学公式：
 * θ = 2π * (orderIndex) / N + π/2
 * X = 50% + Rx * cos(θ)
 * Y = 50% + Ry * sin(θ)
 * 保证当前玩家无论坐在哪个物理编号，在自己的客户端屏幕上永远处于正下方底部中心 (θ = π/2)
 */
export function useTableLayout(seats: (TableSeat | null)[], myUserId: number) {
  return useMemo(() => {
    // 找出所有有效在座玩家
    const seatedList: { seatIndex: number; seat: TableSeat }[] = [];
    let mySeatedIndex = -1;

    seats.forEach((seat, idx) => {
      if (seat && seat.user) {
        seatedList.push({ seatIndex: idx, seat });
        if (seat.user.id === myUserId) {
          mySeatedIndex = idx;
        }
      }
    });

    const totalOccupied = seatedList.length || 1;
    // 牌桌椭圆长半轴与短半轴比率
    const radiusX = 40; // 距离中心左右 40%
    const radiusY = 36; // 距离中心上下 36%

    // 找到自己在在座列表中的排序索引
    const myOrderIndex = seatedList.findIndex((item) => item.seatIndex === mySeatedIndex);
    const baseOffset = myOrderIndex >= 0 ? myOrderIndex : 0;

    const result: CalculatedSeatPosition[] = [];

    // 为每个在座玩家计算相对平滑角度与坐标
    seatedList.forEach((item, index) => {
      // 保证 myOrderIndex 对应 index 时，相对序号为 0，角度正好是 π/2 (底部)
      const relativeOrder = (index - baseOffset + totalOccupied) % totalOccupied;
      const angle = (2 * Math.PI * relativeOrder) / totalOccupied + Math.PI / 2;

      const x = 50 + radiusX * Math.cos(angle);
      const y = 50 + radiusY * Math.sin(angle);

      result.push({
        seatIndex: item.seatIndex,
        seat: item.seat,
        isMe: item.seat.user?.id === myUserId,
        xPercent: Math.round(x * 100) / 100,
        yPercent: Math.round(y * 100) / 100,
      });
    });

    return result;
  }, [seats, myUserId]);
}
