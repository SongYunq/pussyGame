import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../src/game/Room.js';
import { RoomManager } from '../src/game/RoomManager.js';
import { UserModel } from '../src/models/userModel.js';

const playerIds: number[] = [];
const rooms: Room[] = [];

beforeAll(() => {
  for (let i = 0; i < 3; i++) {
    playerIds.push(UserModel.createUser(`timer_p${i}`, 'pass123', `思考时间玩家${i}`, 'avatar', 10000).id);
  }
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.resetToWaiting();
    RoomManager.deleteRoom(room.roomId);
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});

function createRoom(seconds?: number, count = 3) {
  const room = RoomManager.createRoom('思考时间测试', 10, seconds);
  rooms.push(room);
  playerIds.slice(0, count).forEach((id, index) => room.sit(id, index));
  playerIds.slice(0, count).forEach((id) => room.setReady(id, true));
  return room;
}

describe('Room thinking time', () => {
  it('preserves unlimited thinking time at creation and never times out a turn', () => {
    const room = createRoom(0);
    const playerId = room.currentTurnPlayerId!;
    const initialState = room.getMaskedState(playerId);
    expect(initialState.turnSeconds).toBe(0);
    expect(initialState.turnDeadline).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(room.gameStatus).toBe('playing');
    expect(room.currentTurnPlayerId).toBe(playerId);
    expect(room.totalPot).toBe(30);
    expect(room.getActiveSeats()).toHaveLength(3);
    expect(room.turnDeadline).toBeNull();
  });

  it('keeps unlimited time after looking, betting and starting the next hand', () => {
    const room = createRoom(0);
    const firstPlayerId = room.currentTurnPlayerId!;
    room.lookCards(firstPlayerId);
    room.bet(firstPlayerId, 'call', 10);
    expect(room.currentTurnPlayerId).not.toBe(firstPlayerId);
    expect(room.turnDeadline).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(room.getActiveSeats()).toHaveLength(3);

    room.resetToWaiting();
    playerIds.forEach((id) => room.setReady(id, true));
    expect(room.gameStatus).toBe('playing');
    expect(room.turnSeconds).toBe(0);
    expect(room.turnDeadline).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still allows manual folding and resets four seconds after settlement', () => {
    const room = createRoom(0, 2);
    room.fold(room.currentTurnPlayerId!);
    expect(room.gameStatus).toBe('settling');
    expect(room.turnDeadline).toBeNull();
    vi.advanceTimersByTime(4000);
    expect(room.gameStatus).toBe('waiting');
    expect(room.turnSeconds).toBe(0);
    expect(room.turnDeadline).toBeNull();
  });

  it.each([15, 20, 30, 60])('continues folding inactive players after %i seconds', (seconds) => {
    const room = createRoom(seconds);
    const playerId = room.currentTurnPlayerId!;
    expect(room.turnDeadline).toBe(Date.now() + seconds * 1000);
    vi.advanceTimersByTime(seconds * 1000 - 1);
    expect(room.currentTurnPlayerId).toBe(playerId);
    expect(room.getActiveSeats()).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(room.seats[room.findSeatIndexByUserId(playerId)]!.status).toBe('folded');
    expect(room.getActiveSeats()).toHaveLength(2);
    expect(room.currentTurnPlayerId).not.toBe(playerId);
    expect(room.turnDeadline).toBe(Date.now() + seconds * 1000);
  });

  it('retains the default of twenty seconds when thinking time is omitted', () => {
    const room = createRoom();
    expect(room.turnSeconds).toBe(20);
    expect(room.turnDeadline).toBe(Date.now() + 20000);
  });

  it.each([{ input: 1, expected: 10 }, { input: 90, expected: 60 }])('retains the finite time boundary for $input seconds', ({ input, expected }) => {
    const room = createRoom(input);
    expect(room.turnSeconds).toBe(expected);
    expect(room.turnDeadline).toBe(Date.now() + expected * 1000);
  });
});
