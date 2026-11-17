import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onAction, SocketActionError, asPayload } from '../src/socket/ack.js';

class FakeSocket {
  handlers = new Map<string, (...args: unknown[]) => void>();
  emitted: Array<[string, unknown]> = [];
  on(event: string, handler: (...args: unknown[]) => void) { this.handlers.set(event, handler); return this; }
  emit(event: string, payload: unknown) { this.emitted.push([event, payload]); return true; }
  fire(event: string, ...args: unknown[]) { this.handlers.get(event)!(...args); }
}

test('asPayload 只接受普通对象', () => {
  assert.deepEqual(asPayload(null), {});
  assert.deepEqual(asPayload([1]), {});
  assert.deepEqual(asPayload('x'), {});
  assert.deepEqual(asPayload({ a: 1 }), { a: 1 });
});

test('onAction 兼容仅回调参数与数据+回调参数', () => {
  const socket = new FakeSocket();
  const seen: unknown[] = [];
  onAction(socket as any, 'x', '失败', data => { seen.push(data); return { code: 200, ok: true }; });
  const replies: unknown[] = [];
  socket.fire('x', (r: unknown) => replies.push(r));
  socket.fire('x', { a: 1 }, (r: unknown) => replies.push(r));
  assert.deepEqual(seen, [{}, { a: 1 }]);
  assert.deepEqual(replies, [{ code: 200, ok: true }, { code: 200, ok: true }]);
});

test('业务错误透传文案，运行时异常隐藏细节', () => {
  const socket = new FakeSocket();
  onAction(socket as any, 'biz', '兜底', () => { throw new Error('筹码不足'); });
  onAction(socket as any, 'nf', '兜底', () => { throw new SocketActionError('房间不存在', 404); });
  onAction(socket as any, 'bug', '兜底', () => { (null as any).x; });
  const replies: any[] = [];
  const original = console.error; console.error = () => {};
  try {
    socket.fire('biz', {}, (r: unknown) => replies.push(r));
    socket.fire('nf', {}, (r: unknown) => replies.push(r));
    socket.fire('bug', {}, (r: unknown) => replies.push(r));
  } finally { console.error = original; }
  assert.deepEqual(replies, [
    { code: 400, message: '筹码不足' },
    { code: 404, message: '房间不存在' },
    { code: 400, message: '兜底' },
  ]);
});

test('无回调时通过 error 事件返回失败；afterAck 在回调之后执行', () => {
  const socket = new FakeSocket();
  onAction(socket as any, 'fail', '兜底', () => { throw new Error('不行'); });
  socket.fire('fail', {});
  assert.deepEqual(socket.emitted, [['error', { code: 400, message: '不行' }]]);

  const order: string[] = [];
  onAction(socket as any, 'ok', '兜底', (_d, after) => { after(() => order.push('after')); return { code: 200 }; });
  socket.fire('ok', {}, () => order.push('ack'));
  assert.deepEqual(order, ['ack', 'after']);
});

test('单连接动作超限返回 429', () => {
  const socket = new FakeSocket() as FakeSocket & { id: string };
  socket.id = 'flood-socket';
  onAction(socket as any, 'spam', '兜底', () => ({ code: 200 }));
  const codes: number[] = [];
  for (let i = 0; i < 45; i++) socket.fire('spam', {}, (r: any) => codes.push(r.code));
  assert.equal(codes.filter(code => code === 200).length, 40);
  assert.equal(codes.filter(code => code === 429).length, 5);
});
