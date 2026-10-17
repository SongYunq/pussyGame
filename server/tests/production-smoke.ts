import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the actual production artifact without loading the repository's .env or database.
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const entry = path.join(serverDir, 'dist/index.js');
const clientDist = path.resolve(serverDir, '../client/dist');
assert(existsSync(entry) && existsSync(path.join(clientDist, 'index.html')), '先执行 npm run build');
const directory = await mkdtemp(path.join(tmpdir(), 'zjh-production-smoke-'));
const databasePath = path.join(directory, 'game.db');
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
let child: ChildProcess | undefined;
let childClosed: Promise<[number | null, NodeJS.Signals | null]> | undefined;
let output = '';
let checks = 0;
let receivedSignal = false;
let cleanupPromise: Promise<void> | undefined;

function passed(label: string) {
  checks++;
  console.log(`✓ ${label}`);
}

async function stop() {
  if (!child || !childClosed) return;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const force = setTimeout(() => child?.kill('SIGKILL'), 3000);
  try { await childClosed; } finally { clearTimeout(force); }
}

function cleanup(): Promise<void> {
  cleanupPromise ??= (async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  })();
  return cleanupPromise;
}

const onInterrupt = () => {
  receivedSignal = true;
  void cleanup().finally(() => process.exit(130));
};
const onTerminate = () => {
  receivedSignal = true;
  void cleanup().finally(() => process.exit(143));
};
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function launch(port: number, adminPassword = password, jwtSecret = secret) {
  assert(!receivedSignal, '检查已被中断');
  output = '';
  child = spawn(process.execPath, [entry], {
    // An empty temporary cwd prevents dotenv from loading a real environment file.
    cwd: directory,
    env: {
      NODE_ENV: 'production', PORT: String(port), ADMIN_USER: 'smoke_admin',
      ADMIN_PASS: adminPassword, JWT_SECRET: jwtSecret,
      DB_PATH: databasePath, CLIENT_DIST_PATH: clientDist,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const launched = child;
  childClosed = new Promise(resolve => launched.once('close', (code, signal) => resolve([code, signal])));
  child.stdout!.on('data', data => { output += data.toString(); });
  child.stderr!.on('data', data => { output += data.toString(); });
  await once(child, 'spawn');
}

async function waitForStartup(baseUrl: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert(child?.exitCode === null && child?.signalCode === null, `生产进程提前退出：${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/auth/me`, { signal: AbortSignal.timeout(300) });
      if (response.status === 401) return;
    } catch { /* Wait until the real server has bound its port. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`生产服务未就绪：${output}`);
}

async function api(baseUrl: string, route: string, token?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  return { status: response.status, body: await response.json() as any };
}

try {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  await launch(port, password, '');
  let rejectTimer: ReturnType<typeof setTimeout> | undefined;
  const rejected = await Promise.race([
    childClosed!,
    new Promise<never>((_resolve, reject) => {
      rejectTimer = setTimeout(() => reject(new Error('不安全配置未在5秒内拒绝启动')), 5000);
    }),
  ]).finally(() => clearTimeout(rejectTimer));
  assert.notEqual(rejected[0], 0);
  assert.match(output, /JWT_SECRET/);
  assert.equal(existsSync(databasePath), false);
  passed('生产环境缺少安全密钥时拒绝启动，且不创建数据库');

  await launch(port);
  await waitForStartup(baseUrl);
  const index = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') ?? '', /text\/html/);
  const html = await index.text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert(asset, '前端入口必须引用构建的脚本');
  const script = await fetch(new URL(asset, baseUrl), { signal: AbortSignal.timeout(3000) });
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') ?? '', /javascript/);
  assert((await script.text()).length > 1000);
  passed('生产进程托管真实前端页面与脚本');

  const fallback = await fetch(`${baseUrl}/table/smoke`, { signal: AbortSignal.timeout(3000) });
  assert.equal(fallback.status, 200);
  assert.equal(await fallback.text(), html);
  const missing = await api(baseUrl, '/missing-smoke-endpoint');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 404);
  passed('页面路由正确回退，未知 API 返回 JSON 404');

  const login = await api(baseUrl, '/auth/login', undefined, { username: 'smoke_admin', password });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.role, 'admin');
  const token = login.body.data.token as string;
  const created = await api(baseUrl, '/admin/users', token, {
    username: 'smoke_player', password: 'smoke-player-password', nickname: '上线验证', initialChips: 100,
  });
  assert.equal(created.status, 200);
  const playerId = created.body.data.id as number;
  assert.equal((await api(baseUrl, `/admin/users/${playerId}/chips`, token, { amount: -12.5, reason: '生产产物测试' })).status, 200);
  const audit = await api(baseUrl, '/admin/audit-logs', token);
  assert.equal(audit.status, 200);
  const deduction = audit.body.data.list.find((row: any) => row.userId === playerId && row.type === 'deduct');
  assert.equal(deduction?.amount, -12.5);
  assert.equal(deduction?.balanceAfter, 87.5);
  assert.equal(deduction?.operatorId, login.body.data.user.id);
  const openingAdminLedger = audit.body.data.list.filter((row: any) => row.userId === login.body.data.user.id);
  assert.equal(openingAdminLedger.length, 1);
  assert.equal(openingAdminLedger[0].amount, login.body.data.user.balance);
  passed('编译后服务完成生产登录、开号、扣款与经办人审计');
  assert(!output.includes(password) && !output.includes(secret), '启动日志不得输出管理员密码或密钥');
  passed('启动日志未泄漏密码或密钥');

  await stop();
  await launch(port, randomBytes(24).toString('hex'));
  await waitForStartup(baseUrl);
  const relogin = await api(baseUrl, '/auth/login', undefined, { username: 'smoke_admin', password });
  assert.equal(relogin.status, 200, '环境密码只用于首次初始化，不能覆盖既有管理员');
  assert.equal(relogin.body.data.user.balance, login.body.data.user.balance);
  const players = await api(baseUrl, '/admin/users', relogin.body.data.token);
  assert.equal(players.status, 200);
  assert.equal(players.body.data.find((user: any) => user.id === playerId)?.balance, 87.5);
  const persisted = await api(baseUrl, '/admin/audit-logs', relogin.body.data.token);
  assert.equal(persisted.status, 200);
  assert.equal(persisted.body.data.list.filter((row: any) => row.userId === playerId).length, 2);
  assert.equal(persisted.body.data.total, audit.body.data.total);
  assert.deepEqual(persisted.body.data.list.filter((row: any) => row.userId === login.body.data.user.id), openingAdminLedger);
  passed('进程重启后账号、余额及两笔流水保留，启动不重复赠送');
  console.log(`生产产物冒烟检查：${checks}/${checks} 通过`);
} finally {
  await cleanup();
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onTerminate);
}
