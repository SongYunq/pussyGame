import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/index.js';
import { createPlayer } from './helpers.js';
import { UserModel } from '../src/models/userModel.js';

let server: http.Server;
let base: string;
before(async () => {
  server = http.createServer(createApp());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));

const login = (username: string, password: string) => fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
});

test('正确密码登录成功', async () => {
  const id = createPlayer();
  const { username } = UserModel.findById(id)!;
  const res = await login(username, 'secret123');
  assert.equal(res.status, 200);
  assert.ok(((await res.json()) as any).data.token);
});

test('连续失败超过上限后返回 429，且不存在的用户名同样计数', async () => {
  const id = createPlayer();
  const { username } = UserModel.findById(id)!;
  for (let i = 0; i < 10; i++) assert.equal((await login(username, 'wrong-pass')).status, 400);
  const blocked = await login(username, 'secret123');
  assert.equal(blocked.status, 429, '锁定期间正确密码也被拒绝');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  for (let i = 0; i < 10; i++) assert.equal((await login('ghost-user', 'whatever1')).status, 400);
  assert.equal((await login('ghost-user', 'whatever1')).status, 429);
});

test('响应带安全头且不暴露 X-Powered-By，超大请求体被拒绝', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('x-powered-by'), null);
  const big = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'a', password: 'x'.repeat(64 * 1024) }),
  });
  assert.equal(big.status, 413);
});
