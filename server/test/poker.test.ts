import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareHands, evaluateHand, showdownMultiple, splitPot } from '../src/shared/poker.js';
import { hand } from './helpers.js';

test('牌型顺序：豹子 > 顺金 > 金花 > 顺子 > 对子 > 散牌', () => {
  const order = ['2s 2h 2d', '4s 5s 6s', '2h 7h 9h', '4s 5h 6d', '9s 9h 3d', 'As Kh 9d'];
  for (let i = 0; i < order.length - 1; i++) {
    assert.equal(compareHands(hand(order[i]), hand(order[i + 1])), 1, `${order[i]} 应胜 ${order[i + 1]}`);
  }
});

test('A 的顺子衔接：标准牌 A-2-3 最小、短牌 A-8-9 最小', () => {
  assert.equal(evaluateHand(hand('As 2h 3d')).type, 'straight');
  assert.equal(compareHands(hand('2s 3h 4d'), hand('As 2h 3d')), 1);
  assert.equal(evaluateHand(hand('As 8h 9d'), 'short').type, 'straight');
  assert.equal(evaluateHand(hand('As 8h 9d'), 'standard').type, 'high_card');
  assert.equal(compareHands(hand('8s 9h 10d'), hand('As 8h 9d'), 'A', 'short'), 1);
  assert.equal(evaluateHand(hand('Ks Ah 2d')).type, 'high_card');
});

test('特殊 235 仅克制豹子，金花 235 不触发', () => {
  assert.equal(compareHands(hand('2s 3h 5d'), hand('As Ah Ad')), 1);
  assert.equal(compareHands(hand('2s 3h 5d'), hand('2h 3d 6c')), -1);
  assert.equal(evaluateHand(hand('2s 3s 5s')).type, 'flush');
  assert.equal(evaluateHand(hand('8s 9h 10d'), 'short').type, 'straight');
});

test('散牌同点数比较最大点数牌花色（规则 2.5 示例）', () => {
  assert.equal(compareHands(hand('4d 6c 7s'), hand('4s 6d 7h')), 1);
  assert.equal(compareHands(hand('4s 6d 7h'), hand('4d 6c 7s')), -1);
});

test('对子比较对子点数、单张，再比较对子最大花色', () => {
  assert.equal(compareHands(hand('9c 9d Ah'), hand('9s 9h 2d')), 1);
  assert.equal(compareHands(hand('9s 9h 2d'), hand('9c 9d 2h')), 1);
  assert.equal(compareHands(hand('Ks Kh 2d'), hand('Qs Qh Ad')), 1);
});

test('多人摊牌出现循环克制时全员平分', () => {
  const result = showdownMultiple([
    { id: 1, cards: hand('As Ah Ad') },
    { id: 2, cards: hand('2s 3h 5d') },
    { id: 3, cards: hand('Ks Qh 9d') },
  ]);
  assert.equal(result.split, true);
  assert.deepEqual(result.winnerIds, [1, 2, 3]);
});

test('只有豹子与特殊 235 时按普通比较', () => {
  const result = showdownMultiple([
    { id: 1, cards: hand('As Ah Ad') },
    { id: 2, cards: hand('2s 3h 5d') },
  ]);
  assert.deepEqual(result.winnerIds, [2]);
});

test('splitPot 金额守恒', () => {
  const payouts = splitPot(100, [1, 2, 3]);
  assert.equal(payouts.reduce((sum, p) => sum + p.amount, 0), 100);
  assert.throws(() => splitPot(10, []));
  assert.throws(() => splitPot(10, [1, 1]));
});

test('非法手牌被拒绝', () => {
  assert.throws(() => evaluateHand(hand('As As Kd')));
  assert.throws(() => evaluateHand(hand('2s 3h 4d'), 'short'));
});
