import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../src/game/Room.js';
import { UserModel } from '../src/models/userModel.js';
import type { Card } from '../src/types/index.js';

const playerIds: number[] = [];
const hands: Card[][] = [
  [{ rank: 8, suit: 'spades' }, { rank: 8, suit: 'hearts' }, { rank: 9, suit: 'clubs' }],
  [{ rank: 10, suit: 'diamonds' }, { rank: 11, suit: 'spades' }, { rank: 13, suit: 'hearts' }],
  [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }, { rank: 12, suit: 'clubs' }],
  [{ rank: 10, suit: 'spades' }, { rank: 10, suit: 'hearts' }, { rank: 11, suit: 'clubs' }],
];

beforeAll(() => {
  for (let i = 0; i < 4; i++) playerIds.push(UserModel.createUser(`compare_privacy_${i}`, 'pass123', `私密比牌${i}`, 'avatar', 10000).id);
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function startRoom() {
  const room = new Room({ roomId: 'privacy', roomName: '私密比牌', baseAnte: 10, turnSeconds: 0 });
  playerIds.forEach((id, index) => room.sit(id, index));
  playerIds.forEach(id => room.setReady(id, true));
  room.seats.forEach((seat, index) => { if (seat) seat.cards = hands[index].map(card => ({ ...card })); });
  room.currentRound = 2;
  return room;
}

describe('Private comparison hand visibility', () => {
  it.each([0, 1])('grants the actual winner the loser hand when seat %i initiates', (initiator) => {
    const room = startRoom();
    room.currentTurnPlayerId = playerIds[initiator];
    room.compare(playerIds[initiator], playerIds[1 - initiator]);
    const winnerView = room.getMaskedState(playerIds[0]);
    expect(winnerView.seats[1]!.cards).toEqual(hands[1]);
    expect(winnerView.seats[0]!.hasLooked).toBe(false);
    expect(winnerView.seats[2]!.cards).toBeNull();
    expect(room.getMaskedState(playerIds[1]).seats[0]!.cards).toBeNull();
    expect(room.getMaskedState(playerIds[2]).seats[1]!.cards).toBeNull();
    expect(room.getMaskedState().seats.every(seat => !seat || seat.cards === null)).toBe(true);
    expect(room.getMaskedState(99999).seats.every(seat => !seat || seat.cards === null)).toBe(true);
  });

  it('does not transfer previous comparison permissions to a later winner', () => {
    const room = startRoom();
    room.currentTurnPlayerId = playerIds[0];
    room.compare(playerIds[0], playerIds[1]);
    room.currentTurnPlayerId = playerIds[2];
    room.compare(playerIds[2], playerIds[0]);
    const laterWinner = room.getMaskedState(playerIds[2]);
    expect(laterWinner.seats[0]!.cards).toEqual(hands[0]);
    expect(laterWinner.seats[1]!.cards).toBeNull();
    expect(room.getMaskedState(playerIds[0]).seats[1]!.cards).toEqual(hands[1]);
    expect(room.getMaskedState(playerIds[3]).seats[0]!.cards).toBeNull();
  });

  it('clears grants when the room resets and the same players start the next hand', () => {
    const room = startRoom();
    room.currentTurnPlayerId = playerIds[0];
    room.compare(playerIds[0], playerIds[1]);
    room.resetToWaiting();
    expect(room.getMaskedState(playerIds[0]).seats[1]!.cards).toBeNull();
    playerIds.forEach(id => room.setReady(id, true));
    expect(room.getMaskedState(playerIds[0]).seats[1]!.cards).toBeNull();
  });

  it('does not grant access after an invalid comparison', () => {
    const room = startRoom();
    room.currentTurnPlayerId = playerIds[0];
    room.currentRound = 1;
    expect(() => room.compare(playerIds[0], playerIds[1])).toThrow('第 2 轮');
    expect(room.getMaskedState(playerIds[0]).seats[1]!.cards).toBeNull();
  });

  it('returns independent card snapshots so a viewer cannot change internal hands', () => {
    const room = startRoom();
    room.currentTurnPlayerId = playerIds[0];
    room.compare(playerIds[0], playerIds[1]);
    const snapshot = room.getMaskedState(playerIds[0]);
    snapshot.seats[1]!.cards![0].rank = 2;
    expect(room.getMaskedState(playerIds[0]).seats[1]!.cards).toEqual(hands[1]);
  });
});
