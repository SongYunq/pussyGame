import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';
import { UserModel } from '../src/models/userModel.js';
import { config } from '../src/config/index.js';

let app: any;
let adminToken: string;
let playerToken: string;
let testPlayerId: number;

beforeAll(async () => {
  app = createApp();
});

describe('RESTful API & Economic System', () => {
  it('should login as default admin successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: config.defaultAdmin.username,
        password: config.defaultAdmin.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('admin');
    adminToken = res.body.data.token;
  });

  it('admin should create a new player account with initial chips', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'test_player_1',
        password: 'password123',
        nickname: '测试牌王',
        avatar: 'avatar_2.png',
        initialChips: 5000,
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.balance).toBe(5000);
    testPlayerId = res.body.data.id;
  });

  it('new player should login successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'test_player_1',
        password: 'password123',
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.user.nickname).toBe('测试牌王');
    expect(res.body.data.user.balance).toBe(5000);
    playerToken = res.body.data.token;
  });

  it('player can update profile (nickname and avatar)', async () => {
    const res = await request(app)
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        nickname: '修改后的昵称',
        avatar: 'avatar_6.png',
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.nickname).toBe('修改后的昵称');
    expect(res.body.data.avatar).toBe('avatar_6.png');
  });

  it('player can query personal ledger', async () => {
    const res = await request(app)
      .get('/api/user/ledger')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.list.length).toBeGreaterThan(0);
    expect(res.body.data.list[0].type).toBe('recharge');
    expect(res.body.data.list[0].amount).toBe(5000);
  });

  it('admin should modify chips (+2000 and -1000)', async () => {
    // Recharge 2000
    const rechargeRes = await request(app)
      .post(`/api/admin/users/${testPlayerId}/chips`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 2000,
        reason: '线下充值 2000',
      });

    expect(rechargeRes.status).toBe(200);
    expect(rechargeRes.body.data.balance).toBe(7000);

    // Deduct 1000
    const deductRes = await request(app)
      .post(`/api/admin/users/${testPlayerId}/chips`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: -1000,
        reason: '线下结算提现 1000',
      });

    expect(deductRes.status).toBe(200);
    expect(deductRes.body.data.balance).toBe(6000);
  });

  it('admin should prevent deducting more chips than player has', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${testPlayerId}/chips`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: -999999,
        reason: '超出余额扣除',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('筹码余额不足');
  });

  it('admin should view audit logs', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.list.length).toBeGreaterThan(0);
  });

  it('regular player cannot access admin endpoints (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe(403);
  });
});

describe('Dealing configuration endpoints', () => {
  it('returns the new defaults to administrators only', async () => {
    const result = await request(app).get('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`);
    expect(result.body.data.deckProbabilities).toEqual({ standard: 20, short: 80 });
    expect(result.body.data.guarantees['8'].pair).toBe(2);
    expect((await request(app).get('/api/admin/algorithm/config')).status).toBe(401);
    for (const endpoint of ['/api/admin/algorithm/config', '/api/admin/algorithm/simulate']) {
      expect((await request(app).post(endpoint).set('Authorization', `Bearer ${playerToken}`).send({})).status).toBe(403);
    }
  });

  it('persists a valid configuration and rejects invalid totals or overflowing plans', async () => {
    const current = await request(app).get('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`);
    const config = current.body.data;
    config.deckProbabilities = { standard: 0, short: 100 };
    const saved = await request(app).post('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`).send(config);
    expect(saved.status).toBe(200);
    expect(saved.body.message).toContain('下一局');
    const loaded = await request(app).get('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`);
    expect(loaded.body.data).toEqual(config);
    const invalid = structuredClone(config); invalid.guarantees['2'].straight = 1;
    expect((await request(app).post('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`).send(invalid)).status).toBe(400);
    invalid.guarantees['2'].straight = 0; invalid.deckProbabilities.short = 99;
    expect((await request(app).post('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`).send(invalid)).status).toBe(400);
    const unchanged = await request(app).get('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`);
    expect(unchanged.body.data).toEqual(config);
  });

  it('runs actual preview deals without saving the draft, and bounds the work', async () => {
    const { defaultAlgorithmConfig } = await import('../src/shared/dealing.js');
    const config = defaultAlgorithmConfig();
    config.deckProbabilities = { standard: 100, short: 0 }; config.standardModes = { random: 0, rival: 0, guarantee: 100 };
    const result = await request(app).post('/api/admin/algorithm/simulate').set('Authorization', `Bearer ${adminToken}`).send({ rounds: 10, playerCount: 3, config });
    expect(result.status).toBe(200); expect(result.body.data.totalHands).toBe(30);
    expect(result.body.data.branches.standard_guarantee).toBe(10);
    expect(result.body.data.stats.pair.count).toBeGreaterThanOrEqual(20);
    const unchanged = await request(app).get('/api/admin/algorithm/config').set('Authorization', `Bearer ${adminToken}`);
    expect(unchanged.body.data.deckProbabilities).toEqual({ standard: 0, short: 100 });
    expect((await request(app).post('/api/admin/algorithm/simulate').set('Authorization', `Bearer ${adminToken}`).send({ rounds: 5001, playerCount: 3, config })).status).toBe(400);
  });
});
