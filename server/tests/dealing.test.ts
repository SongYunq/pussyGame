import { describe, expect, it } from 'vitest';
import { AlgorithmConfig, GUARANTEE_TYPES, dealHands, defaultAlgorithmConfig, simulateDeals, validateAlgorithmConfig } from '../src/shared/dealing.js';
import { Card, DeckKind, compareHands, createDeck, evaluateHand, showdownMultiple, splitPot } from '../src/shared/poker.js';
import { evaluateHand as frontendEvaluate, compareHands as frontendCompare } from '../../client/src/utils/pokerEvaluator';

function randomSeed(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function forced(kind: DeckKind, mode: 'random' | 'rival' | 'guarantee'): AlgorithmConfig {
  const config = defaultAlgorithmConfig();
  config.deckProbabilities = { standard: kind === 'standard' ? 100 : 0, short: kind === 'short' ? 100 : 0 };
  config.standardModes = { random: mode === 'random' ? 100 : 0, rival: mode === 'rival' ? 100 : 0, guarantee: mode === 'guarantee' ? 100 : 0 };
  config.shortModes = { random: mode === 'random' ? 100 : 0, rival: mode === 'rival' ? 100 : 0 };
  if (kind === 'standard' && mode === 'guarantee') config.shortModes = { random: 100, rival: 0 };
  return config;
}
const card = (rank: number, suit: Card['suit']): Card => ({ rank, suit });

describe('Dealing configuration and all five branches', () => {
  it('validates probability totals and each 2–8 player plan without changing input', () => {
    const defaults = defaultAlgorithmConfig();
    const copy = structuredClone(defaults);
    expect(validateAlgorithmConfig(defaults)).toEqual(copy);
    const invalid = structuredClone(defaults); invalid.standardModes.random = 31;
    expect(() => validateAlgorithmConfig(invalid)).toThrow('100%');
    invalid.standardModes.random = 30; invalid.guarantees[2].straight = 1;
    expect(() => validateAlgorithmConfig(invalid)).toThrow('不能超过');
    invalid.guarantees[2].straight = -1;
    expect(() => validateAlgorithmConfig(invalid)).toThrow('整数');
    expect(() => validateAlgorithmConfig({ mode: 'fair' })).toThrow('版本');
    expect(defaults).toEqual(copy);
    const fractional = forced('standard', 'random');
    fractional.standardModes.random = 99.999999999;
    expect(dealHands(2, fractional, () => .999999999999).mode).toBe('random');
  });

  it.each(['standard', 'short'] as const)('deals legal unique cards for 2–8 players in %s random and rival modes', kind => {
    const random = randomSeed(1357);
    for (let count = 2; count <= 8; count++) for (const mode of ['random', 'rival'] as const) {
      for (let sample = 0; sample < 25; sample++) {
        const result = dealHands(count, forced(kind, mode), random);
        expect(result.deckKind).toBe(kind); expect(result.mode).toBe(mode);
        expect(result.hands).toHaveLength(count);
        const cards = result.hands.flatMap(hand => hand.cards);
        expect(new Set(cards.map(c => `${c.rank}-${c.suit}`)).size).toBe(count * 3);
        expect(cards.every(c => c.rank >= (kind === 'short' ? 8 : 2))).toBe(true);
        result.hands.forEach(hand => expect(hand.cards).toHaveLength(3));
      }
    }
  });

  it('guarantees exactly the requested hands, with random slots free to exceed the guarantee', () => {
    const random = randomSeed(2481);
    const config = forced('standard', 'guarantee');
    for (let count = 2; count <= 8; count++) {
      const result = dealHands(count, config, random);
      const guaranteed = result.hands.filter(hand => hand.source === 'guarantee');
      expect(guaranteed).toHaveLength(2);
      expect(guaranteed.every(hand => evaluateHand(hand.cards).type === 'pair')).toBe(true);
      expect(result.hands.filter(hand => hand.source === 'random')).toHaveLength(count - 2);
    }
    for (const type of GUARANTEE_TYPES) {
      config.guarantees[8] = { pair: 0, straight: 0, flush: 0, straight_flush: 0, leopard: 0, [type]: 8 };
      for (let sample = 0; sample < 5; sample++) {
        const result = dealHands(8, config, random);
        expect(result.hands.every(hand => evaluateHand(hand.cards).type === type)).toBe(true);
      }
    }
    config.guarantees[8] = { pair: 2, straight: 2, flush: 2, straight_flush: 1, leopard: 1 };
    const mixed = dealHands(8, config, random);
    for (const type of GUARANTEE_TYPES) expect(mixed.hands.filter(hand => evaluateHand(hand.cards).type === type)).toHaveLength(config.guarantees[8][type]);
    config.guarantees[8] = { pair: 0, straight: 0, flush: 0, straight_flush: 0, leopard: 0 };
    expect(dealHands(8, config, random).hands.every(hand => hand.source === 'random')).toBe(true);
  });

  it('preserves each rival category and its strict rank requirements in both decks', () => {
    const random = randomSeed(339);
    for (const kind of ['standard', 'short'] as const) for (const combo of ['big_pair', 'straight', 'flush', 'premium'] as const) {
      const config = forced(kind, 'rival');
      config.rivalWeights = { big_pair: 0, straight: 0, flush: 0, premium: 0, [combo]: 100 };
      for (let sample = 0; sample < 50; sample++) {
        const result = dealHands(8, config, random);
        const weak = result.hands.find(hand => hand.source === 'rival_weak')!;
        const strong = result.hands.find(hand => hand.source === 'rival_strong')!;
        const a = evaluateHand(weak.cards, kind), b = evaluateHand(strong.cards, kind);
        expect(compareHands(strong.cards, weak.cards, 'A', kind)).toBe(1);
        expect(result.rivalCombo).toBe(combo);
        if (combo === 'big_pair') { expect(a.type).toBe('pair'); expect(a.ranks[0]).toBeGreaterThanOrEqual(10); expect(a.ranks[0]).toBeLessThanOrEqual(13); expect(['pair', 'straight']).toContain(b.type); }
        if (combo === 'straight') { expect(a.type).toBe('straight'); expect(['flush', 'straight']).toContain(b.type); }
        if (combo === 'flush') { expect(a.type).toBe('flush'); expect([12, 13]).toContain(a.ranks[0]); expect(b.type).toBe('flush'); expect(b.ranks[0]).toBe(14); }
        if (combo === 'premium') expect(['straight_flush', 'leopard']).toContain(a.type);
      }
    }
  });

  it('randomizes which seats get guarantees and stronger rival hands', () => {
    const random = randomSeed(98342);
    const seen = Array(8).fill(0);
    const config = forced('short', 'rival');
    for (let i = 0; i < 1200; i++) dealHands(8, config, random).hands.forEach((hand, seat) => { if (hand.source === 'rival_strong') seen[seat]++; });
    for (const count of seen) expect(count).toBeGreaterThan(100);
    for (const count of seen) expect(count).toBeLessThan(200);
  });

  it('simulates real hands and the default conditional branch frequencies', async () => {
    const result = await simulateDeals(5000, 4, defaultAlgorithmConfig(), randomSeed(12473));
    expect(result.totalHands).toBe(20000);
    expect(Object.values(result.stats).reduce((sum, stat) => sum + stat.count, 0)).toBe(20000);
    const expected = { standard_random: .06, standard_rival: .08, standard_guarantee: .06, short_random: .56, short_rival: .24 };
    for (const [key, probability] of Object.entries(expected)) expect(Math.abs(result.branches[key] / 5000 - probability)).toBeLessThan(.025);
    await expect(simulateDeals(5001, 4, defaultAlgorithmConfig())).rejects.toThrow('5000');
  }, 20000);
});

describe('Shared referee, short deck and suit ordering', () => {
  it('supports deck-specific lowest straights and keeps flush above straight', () => {
    const a89 = [card(14, 'spades'), card(8, 'hearts'), card(9, 'clubs')];
    const eightToTen = [card(8, 'clubs'), card(9, 'diamonds'), card(10, 'spades')];
    expect(evaluateHand(a89, 'short').ranks).toEqual([9, 8, 7]);
    expect(evaluateHand(a89, 'standard').type).toBe('high_card');
    expect(compareHands(a89, eightToTen, 'A', 'short')).toBe(-1);
    const flush = [card(8, 'hearts'), card(10, 'hearts'), card(12, 'hearts')];
    expect(compareHands(flush, eightToTen, 'A', 'short')).toBe(1);
    const a23 = [card(14, 'spades'), card(2, 'hearts'), card(3, 'clubs')];
    expect(evaluateHand(a23).ranks).toEqual([3, 2, 1]);
    expect(() => evaluateHand(a23, 'short')).toThrow('无效');
  });

  it('uses the highest-card suit, the best pair suit and the effective top straight suit', () => {
    const a = [card(4, 'diamonds'), card(6, 'clubs'), card(7, 'spades')];
    const b = [card(4, 'spades'), card(6, 'diamonds'), card(7, 'hearts')];
    expect(compareHands(a, b)).toBe(1);
    const pairA = [card(8, 'spades'), card(8, 'diamonds'), card(14, 'diamonds')];
    const pairB = [card(8, 'hearts'), card(8, 'clubs'), card(14, 'spades')];
    expect(compareHands(pairA, pairB)).toBe(1);
    const lowA = [card(14, 'spades'), card(8, 'hearts'), card(9, 'clubs')];
    const lowB = [card(14, 'hearts'), card(8, 'clubs'), card(9, 'spades')];
    expect(compareHands(lowA, lowB, 'A', 'short')).toBe(-1);
    expect(compareHands(a, a, 'A')).toBe(-1);
  });

  it('splits only on an actual 235 cycle, and keeps payouts equal to the pot', () => {
    const leopard = [card(14, 'spades'), card(14, 'hearts'), card(14, 'clubs')];
    const upset = [card(2, 'spades'), card(3, 'clubs'), card(5, 'hearts')];
    const flush = [card(6, 'diamonds'), card(9, 'diamonds'), card(13, 'diamonds')];
    const players = [{ id: 1, cards: leopard }, { id: 2, cards: upset }, { id: 3, cards: flush }];
    expect(showdownMultiple(players).winnerIds).toEqual([1, 2, 3]);
    expect(showdownMultiple([...players].reverse()).winnerIds.sort()).toEqual([1, 2, 3]);
    expect(showdownMultiple(players.slice(0, 2)).winnerId).toBe(2);
    const payouts = splitPot(35, [1, 2, 3]);
    expect(payouts.reduce((sum, payout) => sum + payout.amount, 0)).toBe(35);
    payouts.forEach(payout => expect(payout.amount).toBeCloseTo(35 / 3, 10));
  });

  it('matches frontend and backend classification and comparison for both deck kinds', () => {
    const random = randomSeed(17);
    for (const kind of ['standard', 'short'] as const) for (let i = 0; i < 100; i++) {
      const result = dealHands(2, forced(kind, 'random'), random);
      const [a, b] = result.hands.map(hand => hand.cards);
      expect(frontendEvaluate(a, kind).type).toBe(evaluateHand(a, kind).type);
      expect(frontendCompare(a, b, true, kind)).toBe(compareHands(a, b, 'A', kind));
    }
    expect(createDeck('short')).toHaveLength(28);
  });
});
