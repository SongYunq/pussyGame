import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secureRandom, cardKey } from '../src/shared/poker.js';
import { dealHands, defaultAlgorithmConfig } from '../src/shared/dealing.js';

test('secureRandom 输出位于 [0,1) 且分布大致均匀', () => {
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20_000; i++) {
    const value = secureRandom();
    assert.ok(value >= 0 && value < 1);
    buckets[Math.floor(value * 10)]++;
  }
  for (const count of buckets) assert.ok(count > 1_700 && count < 2_300, `桶计数异常: ${count}`);
});

test('默认使用安全随机发牌，2～8 人无重复牌', () => {
  for (let players = 2; players <= 8; players++) {
    for (let i = 0; i < 30; i++) {
      const deal = dealHands(players, defaultAlgorithmConfig());
      const keys = deal.hands.flatMap(hand => hand.cards.map(cardKey));
      assert.equal(deal.hands.length, players);
      assert.equal(new Set(keys).size, players * 3);
    }
  }
});

test('注入随机源仍可复现', () => {
  const seeded = () => { let x = 42; return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); };
  assert.deepEqual(dealHands(4, defaultAlgorithmConfig(), seeded()), dealHands(4, defaultAlgorithmConfig(), seeded()));
});
