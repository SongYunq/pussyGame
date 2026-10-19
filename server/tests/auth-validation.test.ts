import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createApp } from '../src/index.js';
import { config } from '../src/config/index.js';
import { getDb } from '../src/db/database.js';
import { UserModel } from '../src/models/userModel.js';
import { signToken } from '../src/utils/jwt.js';

// Production configuration imports below must also avoid reading a developer's .env.
vi.mock('dotenv', () => ({ default: { config: vi.fn(() => ({ parsed: {} })) } }));

let app: ReturnType<typeof createApp>;
let adminId: number;
let adminToken: string;
let alice: { id: number; username: string; balance: number };
let bob: { id: number; username: string; balance: number };
let aliceToken: string;
let bobToken: string;
let nextFixture = 0;

function fixture(balance = 100) {
  const user = UserModel.createUser(`auth_fixture_${++nextFixture}`, 'fixture-password', '测试玩家', '👤', balance);
  return { ...user, token: signToken({ userId: user.id, username: user.username, role: 'player' }) };
}

function ledgerCount(userId: number): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM ledgers WHERE user_id = ?').get(userId) as { count: number }).count;
}

beforeAll(() => {
  expect(config.dbPath).toBe(':memory:');
  app = createApp();
  const admin = UserModel.findByUsername(config.defaultAdmin.username)!;
  adminId = admin.id;
  adminToken = signToken({ userId: admin.id, username: admin.username, role: 'admin' });
  const first = fixture(100);
  const second = fixture(200);
  alice = first;
  bob = second;
  aliceToken = first.token;
  bobToken = second.token;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(() => {
  getDb().close();
});

describe('HTTP authentication and account validation', () => {
  it.each([
    ['object username', { username: {}, password: 'fixture-password' }],
    ['numeric username', { username: 12, password: 'fixture-password' }],
    ['blank username', { username: '  ', password: 'fixture-password' }],
    ['oversized username', { username: 'a'.repeat(65), password: 'fixture-password' }],
    ['array password', { username: 'alice', password: ['password'] }],
    ['blank password', { username: 'alice', password: '  ' }],
    ['NUL password', { username: 'alice', password: 'abc\0def' }],
    ['over 72 UTF-8 bytes', { username: 'alice', password: '密'.repeat(25) }],
    ['array body', []],
  ])('rejects invalid login input: %s', async (_name, body) => {
    const result = await request(app).post('/api/auth/login').send(body);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 400, data: null });
  });

  it('uses the same error for a missing account and an incorrect password', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ username: 'does-not-exist', password: 'wrong-password' });
    const incorrect = await request(app).post('/api/auth/login').send({ username: alice.username, password: 'wrong-password' });
    expect(unknown.status).toBe(400);
    expect(incorrect.body).toEqual(unknown.body);
  });

  it.each([
    ['blank username', { username: ' ' }],
    ['short password', { password: '12345' }],
    ['UTF-8 password truncation', { password: '密'.repeat(25) }],
    ['non-string nickname', { nickname: {} }],
    ['blank nickname', { nickname: ' ' }],
    ['oversized nickname', { nickname: '名'.repeat(41) }],
    ['non-string avatar', { avatar: [] }],
    ['negative chips', { initialChips: -1 }],
    ['string chips', { initialChips: '10' }],
    ['null chips', { initialChips: null }],
    ['overflow chips', { initialChips: Number.MAX_SAFE_INTEGER + 1 }],
  ])('does not create an account for invalid input: %s', async (_name, change) => {
    const username = `bad_account_${++nextFixture}`;
    const result = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({
      username, password: 'valid-password', nickname: '新玩家', avatar: '👤', initialChips: 10, ...change,
    });
    expect(result.status).toBe(400);
    expect(UserModel.findByUsername(username)).toBeNull();
  });

  it('accepts an exact 72-byte password, trims profile text and rejects duplicate usernames', async () => {
    const username = `new_account_${++nextFixture}`;
    const password = '密'.repeat(24);
    const body = { username: ` ${username} `, password, nickname: ' 新玩家 ', avatar: ' 👤 ', initialChips: 12.5 };
    const result = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ id: expect.any(Number), username, balance: 12.5 });
    const login = await request(app).post('/api/auth/login').send({ username, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ nickname: '新玩家', avatar: '👤', role: 'player' });
    const duplicate = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(duplicate.status).toBe(400);
    expect(ledgerCount(result.body.data.id)).toBe(1);
  });

  it.each([
    {}, { nickname: '' }, { nickname: '   ' }, { nickname: 'x'.repeat(41) },
    { nickname: 123 }, { avatar: null }, { avatar: [] }, { avatar: 'a'.repeat(257) },
    { nickname: 'valid\nforged log' },
  ])('rejects invalid profile input without changing stored data: %j', async body => {
    const before = UserModel.findById(alice.id)!;
    const result = await request(app).put('/api/user/profile').set('Authorization', `Bearer ${aliceToken}`).send(body);
    expect(result.status).toBe(400);
    expect(UserModel.findById(alice.id)).toMatchObject({ nickname: before.nickname, avatar: before.avatar });
  });

  it('updates only the authenticated user and ignores supplied account, balance and role fields', async () => {
    const beforeBob = UserModel.findById(bob.id)!;
    const result = await request(app).put('/api/user/profile').set('Authorization', `Bearer ${aliceToken}`).send({
      userId: bob.id, nickname: ' 本人新昵称 ', role: 'admin', balance: 999999,
    });
    expect(result.status).toBe(200);
    expect(result.body.data.nickname).toBe('本人新昵称');
    expect(UserModel.findById(alice.id)).toMatchObject({ nickname: '本人新昵称', balance: 100, role: 'player' });
    expect(UserModel.findById(bob.id)).toEqual(beforeBob);
  });

  it.each(['?page=0', '?page=-1', '?page=1x', '?page=1.5', '?pageSize=0', '?pageSize=101', '?pageSize=-1', '?page[]=1', '?page=9007199254740991&pageSize=100'])('bounds personal and global pagination: %s', async query => {
    const personal = await request(app).get(`/api/user/ledger${query}`).set('Authorization', `Bearer ${aliceToken}`);
    const global = await request(app).get(`/api/admin/audit-logs${query}`).set('Authorization', `Bearer ${adminToken}`);
    expect(personal.status).toBe(400);
    expect(global.status).toBe(400);
  });

  it('isolates the personal ledger even when another userId is supplied', async () => {
    const result = await request(app).get(`/api/user/ledger?userId=${bob.id}`).set('Authorization', `Bearer ${aliceToken}`);
    expect(result.status).toBe(200);
    expect(result.body.data.total).toBe(1);
    expect(result.body.data.list).toHaveLength(1);
    expect(result.body.data.list[0]).toMatchObject({ type: 'recharge', amount: 100 });
    const other = await request(app).get('/api/user/ledger').set('Authorization', `Bearer ${bobToken}`);
    expect(other.body.data.list[0].amount).toBe(200);
    expect(other.body.data.list[0].id).not.toBe(result.body.data.list[0].id);
  });
});

describe('privilege checks and token lifecycle', () => {
  it.each([
    ['get', '/api/admin/users'], ['post', '/api/admin/users'],
    ['post', '/api/admin/users/1/chips'], ['post', '/api/admin/users/1/reset-password'],
    ['get', '/api/admin/audit-logs'], ['get', '/api/admin/algorithm/config'],
    ['post', '/api/admin/algorithm/config'], ['post', '/api/admin/algorithm/simulate'],
  ] as const)('denies anonymous and player access to %s %s', async (method, path) => {
    const beforeBalance = UserModel.findById(adminId)!.balance;
    const beforeLedgers = ledgerCount(adminId);
    const anonymous = await request(app)[method](path).send({ amount: 10 });
    const player = await request(app)[method](path).set('Authorization', `Bearer ${aliceToken}`).send({ amount: 10 });
    expect(anonymous.status).toBe(401);
    expect(player.status).toBe(403);
    expect(UserModel.findById(adminId)!.balance).toBe(beforeBalance);
    expect(ledgerCount(adminId)).toBe(beforeLedgers);
  });

  it('rejects malformed, expired, incorrectly signed or incomplete tokens', async () => {
    const user = UserModel.findById(alice.id)!;
    const base = { userId: user.id, username: user.username, role: user.role, authVersion: user.auth_version };
    const validOptions = { algorithm: 'HS256' as const, expiresIn: 60 };
    const tokens = [
      'not-a-token',
      jwt.sign(base, 'different-signing-secret', validOptions),
      jwt.sign(base, config.jwtSecret, { algorithm: 'HS384', expiresIn: 60 }),
      jwt.sign({ ...base, exp: Math.floor(Date.now() / 1000) - 60 }, config.jwtSecret),
      jwt.sign(base, config.jwtSecret),
      jwt.sign({ userId: user.id, username: user.username, role: user.role }, config.jwtSecret, validOptions),
      jwt.sign({ ...base, userId: String(user.id) }, config.jwtSecret, validOptions),
      jwt.sign({ ...base, username: 'someone-else' }, config.jwtSecret, validOptions),
      jwt.sign({ ...base, role: 'owner' }, config.jwtSecret, validOptions),
      jwt.sign({ ...base, authVersion: -1 }, config.jwtSecret, validOptions),
      jwt.sign({ ...base, authVersion: 0.5 }, config.jwtSecret, validOptions),
    ];
    for (const token of tokens) {
      const result = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(result.status).toBe(401);
    }
  });

  it('uses current database permissions instead of trusting a token role', async () => {
    const user = UserModel.findById(alice.id)!;
    const claimedAdmin = jwt.sign({ userId: user.id, username: user.username, role: 'admin', authVersion: user.auth_version }, config.jwtSecret, { expiresIn: 60 });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${claimedAdmin}`);
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('player');
    expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${claimedAdmin}`)).status).toBe(403);
  });

  it.each(['12345', '密'.repeat(25), { password: 'wrong-type' }, null])('does not revoke a valid session for an invalid password reset: %j', async newPassword => {
    const target = fixture();
    const beforeVersion = UserModel.findById(target.id)!.auth_version;
    const result = await request(app).post(`/api/admin/users/${target.id}/reset-password`).set('Authorization', `Bearer ${adminToken}`).send({ newPassword });
    expect(result.status).toBe(400);
    expect(UserModel.findById(target.id)!.auth_version).toBe(beforeVersion);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${target.token}`)).status).toBe(200);
  });

  it('atomically resets a password, revokes old HTTP sessions and permits login only with the new password', async () => {
    const target = fixture();
    const before = UserModel.findById(target.id)!;
    const reset = await request(app).post(`/api/admin/users/${target.id}/reset-password`).set('Authorization', `Bearer ${adminToken}`).send({ newPassword: 'replacement-password' });
    expect(reset.status).toBe(200);
    const after = UserModel.findById(target.id)!;
    expect(after.auth_version).toBe(before.auth_version + 1);
    expect(after.password_hash).not.toBe(before.password_hash);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${target.token}`)).status).toBe(401);
    expect((await request(app).put('/api/user/profile').set('Authorization', `Bearer ${target.token}`).send({ nickname: 'stale edit' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ username: target.username, password: 'fixture-password' })).status).toBe(400);
    const login = await request(app).post('/api/auth/login').send({ username: target.username, password: 'replacement-password' });
    expect(login.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`)).status).toBe(200);
  });
});

describe('HTTP finance auditing and failure boundaries', () => {
  it.each([
    ['1junk', { amount: 10 }], ['0', { amount: 10 }], ['-1', { amount: 10 }],
    ['9007199254740992', { amount: 10 }], ['target', { amount: 0 }],
    ['target', { amount: '10' }], ['target', { amount: null }],
    ['target', { amount: Number.MAX_SAFE_INTEGER + 1 }],
    ['target', { amount: 10, reason: {} }], ['target', { amount: 10, reason: 'x'.repeat(501) }],
  ])('rejects malformed financial requests without writing ledger data: %s %j', async (id, body) => {
    const before = ledgerCount(alice.id);
    const result = await request(app).post(`/api/admin/users/${id === 'target' ? alice.id : id}/chips`).set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(result.status).toBe(400);
    expect(UserModel.findById(alice.id)!.balance).toBe(100);
    expect(ledgerCount(alice.id)).toBe(before);
  });

  it('records the authenticated operator for account funding, recharge and deduction', async () => {
    const username = `audited_account_${++nextFixture}`;
    const created = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({
      username, password: 'valid-password', nickname: '审计玩家', initialChips: 10.5, operatorId: bob.id,
    });
    expect(created.status).toBe(200);
    const id = created.body.data.id;
    expect((await request(app).post(`/api/admin/users/${id}/chips`).set('Authorization', `Bearer ${adminToken}`).send({ amount: 2.5, reason: '充值', operatorId: bob.id })).body.data.balance).toBe(13);
    expect((await request(app).post(`/api/admin/users/${id}/chips`).set('Authorization', `Bearer ${adminToken}`).send({ amount: -1.25, reason: '扣减' })).body.data.balance).toBe(11.75);
    const logs = await request(app).get('/api/admin/audit-logs?pageSize=100').set('Authorization', `Bearer ${adminToken}`);
    expect(logs.status).toBe(200);
    const rows = logs.body.data.list.filter((row: { userId: number }) => row.userId === id);
    expect(rows).toHaveLength(3);
    expect(rows.map((row: { amount: number }) => row.amount)).toEqual([-1.25, 2.5, 10.5]);
    for (const row of rows) {
      expect(row).toMatchObject({ operatorId: adminId, operatorUsername: config.defaultAdmin.username, roomId: null });
    }
    const beforeCount = ledgerCount(id);
    expect((await request(app).post(`/api/admin/users/${id}/chips`).set('Authorization', `Bearer ${adminToken}`).send({ amount: -100 })).status).toBe(400);
    expect(UserModel.findById(id)!.balance).toBe(11.75);
    expect(ledgerCount(id)).toBe(beforeCount);
  });

  it('does not expose password hashes or internal credential versions in account responses', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: alice.username, password: 'fixture-password' });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${aliceToken}`);
    const users = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(login.status).toBe(200);
    expect(me.status).toBe(200);
    expect(users.status).toBe(200);
    for (const user of [login.body.data.user, me.body.data, ...users.body.data]) {
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('auth_version');
      expect(user).not.toHaveProperty('authVersion');
    }
    expect(users.body.data.find((user: { id: number }) => user.id === adminId).role).toBe('admin');
  });

  it.each([
    ['get', '/api/not-implemented'], ['get', '/api/admin/chips/logs'],
    ['delete', '/api/admin/users/123'], ['put', '/api/admin/users/123'],
  ] as const)('returns a JSON 404 for unavailable endpoints: %s %s', async (method, path) => {
    const result = await request(app)[method](path).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(result.status).toBe(404);
    expect(result.type).toBe('application/json');
    expect(result.body).toEqual({ code: 404, message: '接口不存在', data: null });
  });

  it('handles malformed JSON without echoing credentials into the response or logs', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":"alice","password":"private-secret",');
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 400, message: '请求体必须为有效 JSON', data: null });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private-secret');
    expect(result.text).not.toContain('private-secret');
  });

  it('forwards asynchronous controller failures to the sanitized error handler', async () => {
    vi.spyOn(UserModel, 'findByUsername').mockImplementationOnce(() => { throw new Error('SQLITE_ERROR private-database-details'); });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await request(app).post('/api/auth/login').send({ username: alice.username, password: 'fixture-password' });
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ code: 500, message: '服务器内部错误', data: null });
    expect(result.text).not.toContain('private-database-details');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private-database-details');
  });

  it.each(['profile', 'chips', 'reset'] as const)('does not disclose unexpected storage failures from %s', async endpoint => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fail = () => { throw new Error('SQLITE_ERROR private-storage-path'); };
    let result;
    if (endpoint === 'profile') {
      vi.spyOn(UserModel, 'updateProfile').mockImplementationOnce(fail);
      result = await request(app).put('/api/user/profile').set('Authorization', `Bearer ${aliceToken}`).send({ nickname: 'valid' });
    } else if (endpoint === 'chips') {
      vi.spyOn(UserModel, 'changeBalance').mockImplementationOnce(fail);
      result = await request(app).post(`/api/admin/users/${alice.id}/chips`).set('Authorization', `Bearer ${adminToken}`).send({ amount: 10 });
    } else {
      vi.spyOn(UserModel, 'resetPassword').mockImplementationOnce(fail);
      result = await request(app).post(`/api/admin/users/${alice.id}/reset-password`).set('Authorization', `Bearer ${adminToken}`).send({ newPassword: 'valid-password' });
    }
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ code: 500, message: '服务器内部错误', data: null });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private-storage-path');
  });
});

describe('credential configuration boundaries', () => {
  it('never loads .env in test mode', async () => {
    vi.mocked(dotenv.config).mockClear();
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    await import('../src/config/index.js');
    expect(dotenv.config).not.toHaveBeenCalled();
  });

  it.each([
    ['missing signing secret', 'JWT_SECRET', ''],
    ['short signing secret', 'JWT_SECRET', 'short'],
    ['published signing secret', 'JWT_SECRET', 'zhajinhua-production-super-secret-key-2026'],
    ['default admin password', 'ADMIN_PASS', 'admin123'],
    ['overlong admin password', 'ADMIN_PASS', '密'.repeat(25)],
  ])('refuses unsafe production configuration: %s', async (_name, key, value) => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'production-test-secret-with-32-bytes-minimum');
    vi.stubEnv('ADMIN_PASS', 'production-test-password');
    vi.stubEnv(key, value);
    await expect(import('../src/config/index.js')).rejects.toThrow();
  });
});
