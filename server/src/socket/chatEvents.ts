import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';

export function registerChatEvents(io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  // 1. 发送快捷表情
  socket.on('chat:emoji', (data: { emojiId: string }) => {
    const room = RoomManager.findRoomByUserId(userId);
    if (!room) return;

    io.to(`room:${room.roomId}`).emit('chat:emoji_broadcast', {
      playerId: userId,
      emojiId: data.emojiId,
    });
  });

  // 2. 发送快捷短语
  socket.on('chat:phrase', (data: { phraseId: number; text: string }) => {
    const room = RoomManager.findRoomByUserId(userId);
    if (!room) return;

    io.to(`room:${room.roomId}`).emit('chat:phrase_broadcast', {
      playerId: userId,
      phraseId: data.phraseId,
      text: data.text,
    });
  });
}
