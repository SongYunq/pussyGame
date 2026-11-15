import { Server } from 'socket.io';
import { Room } from './Room.js';
import { UserModel } from '../models/userModel.js';

export class RoomManager {
  private static rooms: Map<string, Room> = new Map();
  // 记录在线用户的 Socket 映射：userId -> Set<socketId>
  private static userSockets: Map<number, Set<string>> = new Map();
  private static socketDisconnectors: Map<string, () => void> = new Map();
  // 记录用户最后一个连接断开的时间：userId -> 毫秒时间戳
  private static offlineSince: Map<number, number> = new Map();
  // 用户→房间号的查找提示缓存，命中时仍会校验实际归属
  private static userRoomHint: Map<number, string> = new Map();

  static createRoom(roomName: string, baseAnte: number = 10, turnSeconds: number = 20, io?: Server, playerCount: number = 2): Room {
    if (typeof roomName !== 'string') throw new Error('房间名称必须为文本');
    // 与前端输入框 maxLength=30 保持一致；房名会随每次 room:state 广播给全房间。
    if (roomName.trim().length > 30 || /[\u0000-\u001f\u007f]/u.test(roomName)) {
      throw new Error('房间名称不能超过 30 个字符且不能包含控制字符');
    }
    if (typeof baseAnte !== 'number' || !Number.isSafeInteger(baseAnte) || baseAnte <= 0
      || baseAnte * 10 > Number.MAX_SAFE_INTEGER) {
      throw new Error('底注必须为正整数');
    }
    if (!Number.isInteger(turnSeconds)) throw new Error('思考时间必须为整数秒');
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) throw new Error('房间人数必须为 2～8 的整数');
    if (this.rooms.size >= 9000) throw new Error('可用房间号已用尽');

    const start = Math.floor(Math.random() * 9000);
    let roomId = '';
    for (let offset = 0; offset < 9000; offset++) {
      const candidate = (1000 + (start + offset) % 9000).toString();
      if (!this.rooms.has(candidate)) { roomId = candidate; break; }
    }

    const room = new Room({
      roomId,
      roomName: roomName.trim() || `${roomId} 房间`,
      baseAnte: Math.max(1, baseAnte),
      turnSeconds: turnSeconds === 0 ? 0 : Math.max(10, Math.min(60, turnSeconds)),
      io,
      playerCount,
    });

    this.rooms.set(roomId, room);
    return room;
  }

  static getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null;
  }

  static deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      if (room.gameStatus === 'playing') throw new Error('进行中的房间不可删除');
      room.dispose();
      this.rooms.delete(roomId);
      for (const [userId, hintedId] of this.userRoomHint) {
        if (hintedId === roomId) this.userRoomHint.delete(userId);
      }
    }
  }

  /**
   * 查找用户所在房间。每个 Socket 动作都会调用，故先查“用户→房间”缓存并验证
   * 用户仍在该房间内（座位或观战席）；缓存失效时回退全量扫描并刷新缓存。
   * 房间状态由 Room 直接修改，缓存只作为提示，任何时候都以实际归属为准。
   */
  static findRoomByUserId(userId: number): Room | null {
    const hintedId = this.userRoomHint.get(userId);
    if (hintedId !== undefined) {
      const hinted = this.rooms.get(hintedId);
      if (hinted && this.isMember(hinted, userId)) return hinted;
      this.userRoomHint.delete(userId);
    }
    for (const room of this.rooms.values()) {
      if (this.isMember(room, userId)) {
        this.userRoomHint.set(userId, room.roomId);
        return room;
      }
    }
    return null;
  }

  private static isMember(room: Room, userId: number): boolean {
    return room.spectators.has(userId) || room.findSeatIndexByUserId(userId) !== -1;
  }

  static recordUserOnline(userId: number, socketId: string, disconnect?: () => void): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
    this.offlineSince.delete(userId);
    if (disconnect) this.socketDisconnectors.set(socketId, disconnect);
  }

  static recordUserOffline(userId: number, socketId: string): void {
    this.socketDisconnectors.delete(socketId);
    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.userSockets.delete(userId);
        this.offlineSince.set(userId, Date.now());
      }
    }
  }

  /**
   * 释放等待阶段长期离线玩家占用的座位。
   * 只处理 waiting 状态的房间，牌局进行中仍保留座位等待重连；超过宽限期仍离线的
   * 玩家直接离开房间（不进入观战席），空房随之回收。返回被释放的座位数。
   */
  static releaseOfflineSeats(graceMs: number, now: number = Date.now()): number {
    let released = 0;
    for (const room of Array.from(this.rooms.values())) {
      if (room.gameStatus !== 'waiting') continue;
      let changed = false;
      for (const seat of room.seats) {
        const userId = seat?.user?.id;
        if (userId === undefined) continue;
        const since = this.offlineSince.get(userId);
        if (since === undefined || this.userSockets.has(userId) || now - since < graceMs) continue;
        room.stand(userId, false);
        room.removeSpectator(userId);
        released++;
        changed = true;
      }
      if (changed) {
        room.broadcastState();
        this.removeEmptyRoom(room.roomId);
      }
    }
    for (const [userId, since] of this.offlineSince) {
      if (now - since >= graceMs && !this.findRoomByUserId(userId)) this.offlineSince.delete(userId);
    }
    return released;
  }

  static disconnectUser(userId: number): void {
    for (const socketId of Array.from(this.userSockets.get(userId) ?? [])) {
      this.socketDisconnectors.get(socketId)?.();
    }
  }

  static getUserOnlineStatus(userId: number): { isOnline: boolean; currentRoomId: string | null } {
    const isOnline = this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
    const room = this.findRoomByUserId(userId);
    return {
      isOnline,
      currentRoomId: room ? room.roomId : null,
    };
  }

  static refreshUser(userId: number): void {
    const user = UserModel.findById(userId);
    if (!user) return;
    for (const room of this.rooms.values()) {
      const seatIndex = room.findSeatIndexByUserId(userId);
      if (seatIndex !== -1) {
        room.seats[seatIndex]!.user = { id: user.id, nickname: user.nickname, avatar: user.avatar, balance: user.balance };
      }
      if (room.spectators.has(userId)) room.addSpectator(user);
      if (seatIndex !== -1 || room.spectators.has(userId)) room.broadcastState();
    }
  }

  static removeEmptyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room && room.gameStatus !== 'playing' && room.seats.every(seat => seat === null) && room.spectators.size === 0) {
      this.deleteRoom(roomId);
    }
  }

  static getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
