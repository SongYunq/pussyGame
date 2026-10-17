import { useMemo } from 'react';
import { TableSeat } from '../types/game';

export interface CalculatedSeatPosition {
  seatIndex: number;
  seat: TableSeat | null;
  isMe: boolean;
  angleRad: number; // 座位在椭圆上的极坐标角度 (rad)
  xPercent: number; // 头像位置 X (0 ~ 100%)
  yPercent: number; // 头像位置 Y (0 ~ 100%)
  cardXPercent: number; // 手牌位置 X (0 ~ 100%，靠牌桌中央方向)
  cardYPercent: number; // 手牌位置 Y (0 ~ 100%，靠牌桌中央方向)
  chipXPercent: number; // 玩家身前筹码堆出现位置 X (0 ~ 100%)
  chipYPercent: number; // 玩家身前筹码堆出现位置 Y (0 ~ 100%)
  cardAngleDeg: number; // 手牌朝向牌桌中心的旋转角度 (deg)
}

/**
 * 动态 8 人自适应桌位第一人称排布算法 Hook
 * 核心数学公式：
 * θ = 2π * (orderIndex) / N + π/2
 * 头像外圈坐标：X = 50% + Rx_avatar * cos(θ), Y = 50% + Ry_avatar * sin(θ)
 * 手牌内圈坐标：X = 50% + Rx_card * cos(θ),   Y = 50% + Ry_card * sin(θ)
 * 手牌朝向角度：deg = θ * (180 / π) - 90°（使扇形手牌顶部始终朝向牌桌中心）
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
    // 头像外圈椭圆长短半轴（贴近牌桌边缘）
    const avatarRadiusX = 44;
    const avatarRadiusY = 42;

    // 自身手牌内圈椭圆长短半轴（保持原有舒适距离）
    const myCardRadiusX = 27;
    const myCardRadiusY = 22;

    // 其他玩家手牌内圈椭圆长短半轴（更贴近各自的外圈头像）
    const otherCardRadiusX = 34;
    const otherCardRadiusY = 28;

    // 玩家身前筹码堆起始位置椭圆长短半轴（位于手牌靠向桌面中心的前方区域）
    const myChipRadiusX = 22;
    const myChipRadiusY = 19;
    const otherChipRadiusX = 27;
    const otherChipRadiusY = 22;

    // 找到自己在在座列表中的排序索引
    const myOrderIndex = seatedList.findIndex((item) => item.seatIndex === mySeatedIndex);
    const baseOffset = myOrderIndex >= 0 ? myOrderIndex : 0;

    const result: CalculatedSeatPosition[] = [];

    // 为每个在座玩家计算相对平滑角度、外圈头像坐标、内圈手牌坐标及朝向
    seatedList.forEach((item, index) => {
      // 保证 myOrderIndex 对应 index 时，相对序号为 0，角度正好是 π/2 (底部)
      const relativeOrder = (index - baseOffset + totalOccupied) % totalOccupied;
      const angle = (2 * Math.PI * relativeOrder) / totalOccupied + Math.PI / 2;
      const isMe = item.seat.user?.id === myUserId;

      const x = 50 + avatarRadiusX * Math.cos(angle);
      const y = 50 + avatarRadiusY * Math.sin(angle);

      const currentCardRadiusX = isMe ? myCardRadiusX : otherCardRadiusX;
      const currentCardRadiusY = isMe ? myCardRadiusY : otherCardRadiusY;
      const cardX = 50 + currentCardRadiusX * Math.cos(angle);
      const cardY = 50 + currentCardRadiusY * Math.sin(angle);

      const currentChipRadiusX = isMe ? myChipRadiusX : otherChipRadiusX;
      const currentChipRadiusY = isMe ? myChipRadiusY : otherChipRadiusY;
      const chipX = 50 + currentChipRadiusX * Math.cos(angle);
      const chipY = 50 + currentChipRadiusY * Math.sin(angle);

      // 计算手牌朝向牌桌中心的旋转角度，并归一化到 [-180, 180] 避免过渡动画绕大圈
      let rawDeg = (angle * 180) / Math.PI - 90;
      while (rawDeg > 180) rawDeg -= 360;
      while (rawDeg <= -180) rawDeg += 360;

      result.push({
        seatIndex: item.seatIndex,
        seat: item.seat,
        isMe,
        angleRad: angle,
        xPercent: Math.round(x * 100) / 100,
        yPercent: Math.round(y * 100) / 100,
        cardXPercent: Math.round(cardX * 100) / 100,
        cardYPercent: Math.round(cardY * 100) / 100,
        chipXPercent: Math.round(chipX * 100) / 100,
        chipYPercent: Math.round(chipY * 100) / 100,
        cardAngleDeg: Math.round(rawDeg * 100) / 100,
      });
    });

    return result;
  }, [seats, myUserId]);
}
