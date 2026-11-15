import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';
import { onAction } from './ack.js';

export function registerGameEvents(_io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  const requireRoom = () => {
    const room = RoomManager.findRoomByUserId(userId);
    if (!room) throw new Error('未在房间中');
    return room;
  };

  // 1. 看牌
  onAction(socket, 'game:look', '看牌失败', () => {
    const cards = requireRoom().lookCards(userId);
    return { code: 200, cards };
  });

  // 2. 下注 / 加注 / All-in
  onAction(socket, 'game:bet', '下注失败', data => {
    const room = requireRoom();
    room.bet(
      userId,
      data.actionType as 'call' | 'raise' | 'allin',
      data.chipOption as number | string,
      typeof data.amount === 'number' ? data.amount : undefined,
    );
    return { code: 200, message: '下注成功' };
  });

  // 3. 弃牌
  onAction(socket, 'game:fold', '弃牌失败', () => {
    requireRoom().fold(userId, 'manual');
    return { code: 200, message: '已弃牌' };
  });

  // 4. 双人比牌
  onAction(socket, 'game:compare', '比牌失败', data => {
    const room = requireRoom();
    if (!Number.isSafeInteger(data.targetPlayerId)) throw new Error('比牌对象无效');
    room.compare(userId, data.targetPlayerId as number);
    return { code: 200, message: '比牌成功' };
  });
}
