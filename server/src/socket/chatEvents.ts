import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';
import { isQuickEmoji, resolvePhrase } from '../shared/chat.js';
import { SlidingWindowLimiter } from '../utils/rateLimiter.js';
import { asPayload } from './ack.js';

// 同一账号（含多窗口）每 10 秒最多 6 条表情/短语，超出部分静默丢弃。
const chatLimiter = new SlidingWindowLimiter(6, 10_000);

export function registerChatEvents(io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  function roomForChat() {
    const room = RoomManager.findRoomByUserId(userId);
    if (!room || !chatLimiter.tryConsume(String(userId))) return null;
    return room;
  }

  // 1. 发送快捷表情（仅白名单内表情）
  socket.on('chat:emoji', (raw: unknown) => {
    const data = asPayload(raw);
    if (!isQuickEmoji(data.emojiId)) return;
    const room = roomForChat();
    if (!room) return;

    io.to(`room:${room.roomId}`).emit('chat:emoji_broadcast', {
      playerId: userId,
      emojiId: data.emojiId,
    });
  });

  // 2. 发送快捷短语（按编号映射服务端标准文案，不转发客户端自定义文本）
  socket.on('chat:phrase', (raw: unknown) => {
    const data = asPayload(raw);
    const phrase = resolvePhrase(data.phraseId, data.text);
    if (!phrase) return;
    const room = roomForChat();
    if (!room) return;

    io.to(`room:${room.roomId}`).emit('chat:phrase_broadcast', {
      playerId: userId,
      phraseId: phrase.phraseId,
      text: phrase.text,
    });
  });
}
