import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_PHRASES, isQuickEmoji, resolvePhrase } from '../src/shared/chat.js';
import { SlidingWindowLimiter } from '../src/utils/rateLimiter.js';

test('短语按编号映射标准文案，兼容旧客户端原文上报，拒绝自定义文本', () => {
  assert.deepEqual(resolvePhrase(1, undefined), { phraseId: 1, text: QUICK_PHRASES[1] });
  assert.deepEqual(resolvePhrase(0, QUICK_PHRASES[3]), { phraseId: 3, text: QUICK_PHRASES[3] });
  assert.equal(resolvePhrase(99, 'hi'), null);
  assert.equal(resolvePhrase(-1, '<img src=x onerror=alert(1)>'), null);
  assert.deepEqual(resolvePhrase(0, '任意伪造文本'), { phraseId: 0, text: QUICK_PHRASES[0] });
});

test('表情只接受白名单', () => {
  assert.equal(isQuickEmoji('🔥'), true);
  assert.equal(isQuickEmoji('x'.repeat(64)), false);
  assert.equal(isQuickEmoji(1), false);
});

test('滑动窗口限流', () => {
  const limiter = new SlidingWindowLimiter(2, 1000);
  assert.equal(limiter.tryConsume('a', 0), true);
  assert.equal(limiter.tryConsume('a', 10), true);
  assert.equal(limiter.tryConsume('a', 20), false);
  assert.equal(limiter.retryAfterMs('a', 20), 980);
  assert.equal(limiter.tryConsume('b', 20), true, '不同键互不影响');
  assert.equal(limiter.tryConsume('a', 1001), true, '窗口滑过后恢复');
  limiter.reset('a');
  assert.equal(limiter.retryAfterMs('a', 1001), 0);
});

test('限流器 sweep 清除过期键', () => {
  const limiter = new SlidingWindowLimiter(1, 100);
  limiter.tryConsume('x', 0);
  limiter.tryConsume('y', 50);
  limiter.sweep(120);
  assert.equal(limiter.size, 1);
  limiter.sweep(200);
  assert.equal(limiter.size, 0);
});
