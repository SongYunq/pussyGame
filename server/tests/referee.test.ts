import { describe, it, expect } from 'vitest';
import { GameReferee } from '../src/game/GameReferee.js';
import { Deck } from '../src/game/Card.js';
import { Card } from '../src/types/index.js';

describe('Deck and Shuffling', () => {
  it('should generate 52 unique cards', () => {
    const deck = Deck.createDeck();
    expect(deck.length).toBe(52);

    const keys = new Set(deck.map(c => `${c.suit}_${c.rank}`));
    expect(keys.size).toBe(52);
  });

  it('should shuffle properly without losing cards', () => {
    const deck = Deck.createDeck();
    const shuffled = Deck.shuffle(deck);
    expect(shuffled.length).toBe(52);

    const keys = new Set(shuffled.map(c => `${c.suit}_${c.rank}`));
    expect(keys.size).toBe(52);
  });
});

describe('GameReferee - Hand Evaluation', () => {
  it('should identify Leopards (豹子)', () => {
    const hand: Card[] = [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 14 },
      { suit: 'diamonds', rank: 14 },
    ];
    const res = GameReferee.evaluateHand(hand);
    expect(res.type).toBe('leopard');
    expect(res.weight).toBe(6);
    expect(res.typeName).toContain('豹子');
  });

  it('should identify Straight Flush (同花顺)', () => {
    const hand: Card[] = [
      { suit: 'hearts', rank: 10 },
      { suit: 'hearts', rank: 11 },
      { suit: 'hearts', rank: 12 },
    ];
    const res = GameReferee.evaluateHand(hand);
    expect(res.type).toBe('straight_flush');
    expect(res.weight).toBe(5);
  });

  it('should identify A-2-3 Straight Flush (最小同花顺)', () => {
    const hand: Card[] = [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 2 },
      { suit: 'spades', rank: 3 },
    ];
    const res = GameReferee.evaluateHand(hand);
    expect(res.type).toBe('straight_flush');
    expect(res.weight).toBe(5);
    expect(res.ranks).toEqual([3, 2, 1]);
  });

  it('should identify Flush (金花)', () => {
    const hand: Card[] = [
      { suit: 'clubs', rank: 14 },
      { suit: 'clubs', rank: 9 },
      { suit: 'clubs', rank: 3 },
    ];
    const res = GameReferee.evaluateHand(hand);
    expect(res.type).toBe('flush');
    expect(res.weight).toBe(4);
  });

  it('should identify Straight (顺子) and A-2-3 as smallest straight', () => {
    const normalStraight: Card[] = [
      { suit: 'spades', rank: 4 },
      { suit: 'hearts', rank: 3 },
      { suit: 'diamonds', rank: 2 },
    ];
    const resNormal = GameReferee.evaluateHand(normalStraight);
    expect(resNormal.type).toBe('straight');
    expect(resNormal.ranks).toEqual([4, 3, 2]);

    const a23Straight: Card[] = [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 3 },
      { suit: 'diamonds', rank: 2 },
    ];
    const resA23 = GameReferee.evaluateHand(a23Straight);
    expect(resA23.type).toBe('straight');
    expect(resA23.ranks).toEqual([3, 2, 1]);

    // 2-3-4 顺子比 A-2-3 顺子大
    expect(GameReferee.compareHands(normalStraight, a23Straight, 'A')).toBe(1);
    expect(GameReferee.compareHands(a23Straight, normalStraight, 'A')).toBe(-1);
  });

  it('should identify Pair (对子) and compare kickers', () => {
    const pair1: Card[] = [
      { suit: 'spades', rank: 8 },
      { suit: 'hearts', rank: 8 },
      { suit: 'diamonds', rank: 13 }, // 对8带K
    ];
    const pair2: Card[] = [
      { suit: 'clubs', rank: 8 },
      { suit: 'diamonds', rank: 8 },
      { suit: 'spades', rank: 12 }, // 对8带Q
    ];
    const res1 = GameReferee.evaluateHand(pair1);
    expect(res1.type).toBe('pair');
    expect(res1.ranks).toEqual([8, 8, 13]);

    expect(GameReferee.compareHands(pair1, pair2, 'A')).toBe(1);
  });

  it('should identify Special 2-3-5 (不同花色235)', () => {
    const special235: Card[] = [
      { suit: 'spades', rank: 5 },
      { suit: 'hearts', rank: 3 },
      { suit: 'diamonds', rank: 2 },
    ];
    const res = GameReferee.evaluateHand(special235);
    expect(res.type).toBe('special_235');
  });
});

describe('GameReferee - Comparison and Special Rules', () => {
  const leopardAAA: Card[] = [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 14 },
    { suit: 'diamonds', rank: 14 },
  ];
  const leopard222: Card[] = [
    { suit: 'spades', rank: 2 },
    { suit: 'hearts', rank: 2 },
    { suit: 'diamonds', rank: 2 },
  ];
  const special235: Card[] = [
    { suit: 'spades', rank: 5 },
    { suit: 'hearts', rank: 3 },
    { suit: 'diamonds', rank: 2 },
  ];
  const flushAKQ: Card[] = [
    { suit: 'hearts', rank: 14 },
    { suit: 'hearts', rank: 13 },
    { suit: 'hearts', rank: 12 },
  ]; // 这是同花顺
  const flushA95: Card[] = [
    { suit: 'hearts', rank: 14 },
    { suit: 'hearts', rank: 9 },
    { suit: 'hearts', rank: 5 },
  ]; // 金花
  const straightQKA: Card[] = [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 13 },
    { suit: 'diamonds', rank: 12 },
  ];
  const highCardK97: Card[] = [
    { suit: 'spades', rank: 13 },
    { suit: 'hearts', rank: 9 },
    { suit: 'diamonds', rank: 7 },
  ];

  it('Special 235 beats Leopard (逆袭)', () => {
    // 235 发起比牌挑战 豹子 AAA
    expect(GameReferee.compareHands(special235, leopardAAA, 'A')).toBe(1);
    // 豹子 AAA 发起比牌挑战 235
    expect(GameReferee.compareHands(leopardAAA, special235, 'A')).toBe(-1);
    // 235 逆袭 豹子 222
    expect(GameReferee.compareHands(special235, leopard222, 'A')).toBe(1);
  });

  it('Special 235 loses to Flush, Straight, Pair, High Card when no Leopard is present', () => {
    // 面对金花：235 败
    expect(GameReferee.compareHands(special235, flushA95, 'A')).toBe(-1);
    // 面对顺子：235 败
    expect(GameReferee.compareHands(special235, straightQKA, 'A')).toBe(-1);
    // 面对单牌K：235 (5高) 败
    expect(GameReferee.compareHands(special235, highCardK97, 'A')).toBe(-1);
  });

  it('Leopard beats all other types (Straight Flush, Flush, Straight, Pair, High Card)', () => {
    expect(GameReferee.compareHands(leopard222, flushAKQ, 'A')).toBe(1);
    expect(GameReferee.compareHands(leopard222, flushA95, 'A')).toBe(1);
    expect(GameReferee.compareHands(leopard222, straightQKA, 'A')).toBe(1);
    expect(GameReferee.compareHands(leopardAAA, leopard222, 'A')).toBe(1);
  });

  it('Tie breaker: Initiator loses when hands and ranks are identical', () => {
    const hand1: Card[] = [
      { suit: 'spades', rank: 12 },
      { suit: 'hearts', rank: 11 },
      { suit: 'diamonds', rank: 10 },
    ];
    const hand2: Card[] = [
      { suit: 'clubs', rank: 12 },
      { suit: 'diamonds', rank: 11 },
      { suit: 'spades', rank: 10 },
    ];

    // 当 A 主动发起比牌时，同牌同点 A 判负 (返回 -1)
    expect(GameReferee.compareHands(hand1, hand2, 'A')).toBe(-1);

    // 当 B 主动发起比牌时，同牌同点 B 判负 (即 A 获胜，返回 1)
    expect(GameReferee.compareHands(hand1, hand2, 'B')).toBe(1);
  });

  it('ShowdownMultiple correctly finds winner', () => {
    const players = [
      { id: 1, cards: straightQKA, seatIndex: 0 },
      { id: 2, cards: flushA95, seatIndex: 1 },
      { id: 3, cards: leopard222, seatIndex: 2 },
    ];
    const result = GameReferee.showdownMultiple(players);
    expect(result.winnerId).toBe(3);
    expect(result.evaluation.type).toBe('leopard');
  });

  it('ShowdownMultiple with 235 and Leopard triggers 235 upset win', () => {
    const players = [
      { id: 1, cards: leopardAAA, seatIndex: 0 },
      { id: 2, cards: special235, seatIndex: 1 },
    ];
    const result = GameReferee.showdownMultiple(players);
    expect(result.winnerId).toBe(2);
  });
});
