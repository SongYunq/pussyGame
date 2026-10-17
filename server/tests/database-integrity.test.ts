import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database, { type Database as DatabaseConnection } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Never import the real configuration: it loads .env at module initialization.
const testAdmin = {
  username: 'integrity_admin', password: 'integrity-password', nickname: '审计测试管理员',
  avatar: 'avatar_1.png', initialChips: 1000,
};
const connections: DatabaseConnection[] = [];
const temporaryDirectories: string[] = [];

async function loadModules(dbPath = ':memory:') {
  vi.resetModules();
  vi.doMock('../src/config/index.js', () => ({ config: { dbPath, defaultAdmin: { ...testAdmin } } }));
  const [database, users, ledgers] = await Promise.all([
    import('../src/db/database.js'),
    import('../src/models/userModel.js'),
    import('../src/models/ledgerModel.js'),
  ]);
  return { getDb: database.getDb, UserModel: users.UserModel, LedgerModel: ledgers.LedgerModel };
}

async function openStore(dbPath = ':memory:') {
  const modules = await loadModules(dbPath);
  const db = modules.getDb();
  connections.push(db);
  return { ...modules, db };
}

function temporaryDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zjh-database-integrity-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'legacy.db');
}

function createLegacyDatabase(filename: string): void {
  const db = new Database(filename);
  try {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nickname TEXT NOT NULL,
        avatar TEXT DEFAULT 'avatar_1.png',
        balance INTEGER DEFAULT 0,
        role TEXT DEFAULT 'player',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE ledgers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE game_settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users (id, username, password_hash, nickname, balance)
        VALUES (101, 'legacy_player', 'historical-hash', '历史玩家', 12.5);
      INSERT INTO ledgers (id, user_id, type, amount, balance_after, description, created_at)
        VALUES (201, 101, 'recharge', 12.5, 12.5, '原始历史流水', '2026-01-02 03:04:05');
      INSERT INTO game_settings (key, value) VALUES ('historical_setting', '{"preserved":true}');
    `);
  } finally {
    db.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of connections.splice(0)) if (db.open) db.close();
  vi.doUnmock('../src/config/index.js');
  vi.resetModules();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Database initialization and legacy migrations', () => {
  it('initializes one administrator and one matching opening ledger with foreign keys enabled', async () => {
    const { db, getDb } = await openStore();
    expect(getDb()).toBe(db);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('database_list')).toEqual([expect.objectContaining({ name: 'main', file: '' })]);
    const admin = db.prepare('SELECT id, balance, role, auth_version FROM users').get() as Record<string, unknown>;
    expect(admin).toMatchObject({ balance: 1000, role: 'admin', auth_version: 0 });
    expect(db.prepare('SELECT user_id, type, amount, balance_after, operator_id, room_id FROM ledgers').all()).toEqual([
      { user_id: admin.id, type: 'recharge', amount: 1000, balance_after: 1000, operator_id: null, room_id: null },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 1 });
  });

  it('migrates old tables without changing historical balances, descriptions, timestamps or settings', async () => {
    const filename = temporaryDatabasePath();
    createLegacyDatabase(filename);
    const { db, UserModel, LedgerModel } = await openStore(filename);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(UserModel.findById(101)).toMatchObject({ balance: 12.5, auth_version: 0, password_hash: 'historical-hash' });
    expect(db.prepare('SELECT * FROM ledgers WHERE id = 201').get()).toMatchObject({
      amount: 12.5, balance_after: 12.5, description: '原始历史流水', created_at: '2026-01-02 03:04:05',
      operator_id: null, room_id: null,
    });
    expect(db.prepare('SELECT value FROM game_settings WHERE key = ?').get('historical_setting')).toEqual({ value: '{"preserved":true}' });
    expect(LedgerModel.getAuditLogs().list.find(item => item.id === 201)).toMatchObject({
      username: 'legacy_player', operatorId: null, operatorUsername: null, roomId: null,
    });
    expect(() => db.prepare('UPDATE users SET balance = -1 WHERE id = 101').run()).toThrow();
    expect(() => db.prepare('DELETE FROM ledgers WHERE id = 201').run()).toThrow('历史流水只允许追加');
    const adminId = UserModel.findByUsername(testAdmin.username)!.id;
    UserModel.changeBalance(101, -0.5, 'bet', '迁移后半注', { operatorId: adminId, roomId: '1234' });
    expect(UserModel.findById(101)!.balance).toBe(12);
    expect(LedgerModel.getAuditLogs().list[0]).toMatchObject({ amount: -0.5, operatorId: adminId, roomId: '1234' });
  });

  it('can reopen a migrated database without duplicating accounts or opening ledgers', async () => {
    const filename = temporaryDatabasePath();
    createLegacyDatabase(filename);
    const first = await openStore(filename);
    const usersBefore = first.db.prepare('SELECT * FROM users ORDER BY id').all();
    const ledgersBefore = first.db.prepare('SELECT * FROM ledgers ORDER BY id').all();
    first.db.close();
    const second = await openStore(filename);
    expect(second.db.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(usersBefore);
    expect(second.db.prepare('SELECT * FROM ledgers ORDER BY id').all()).toEqual(ledgersBefore);
    expect(second.db.pragma('foreign_key_check')).toEqual([]);
  });

  it('rejects a newer schema, closes the failed connection, and permits a corrected subsequent initialization', async () => {
    const filename = temporaryDatabasePath();
    const fixture = new Database(filename);
    fixture.exec('CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES (\'untouched\'); PRAGMA user_version = 2;');
    fixture.close();
    const { getDb } = await loadModules(filename);
    const close = vi.spyOn(Database.prototype, 'close');
    expect(() => { connections.push(getDb()); }).toThrow('数据库版本高于当前服务支持的版本');
    expect(close).toHaveBeenCalledOnce();
    close.mockRestore();
    const repair = new Database(filename);
    try {
      expect(repair.pragma('user_version', { simple: true })).toBe(2);
      expect(repair.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: 'sentinel' }]);
      expect(repair.prepare('SELECT value FROM sentinel').get()).toEqual({ value: 'untouched' });
      repair.pragma('user_version = 0');
    } finally { repair.close(); }
    const db = getDb();
    connections.push(db);
    expect(db.open).toBe(true);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('rolls back migrations and administrator insertion together if its opening ledger fails', async () => {
    const filename = temporaryDatabasePath();
    createLegacyDatabase(filename);
    const fixture = new Database(filename);
    fixture.exec(`CREATE TRIGGER reject_bootstrap BEFORE INSERT ON ledgers
      WHEN NEW.description = '系统初始化默认管理员筹码'
      BEGIN SELECT RAISE(ABORT, 'bootstrap ledger failed'); END;`);
    fixture.close();
    const { getDb } = await loadModules(filename);
    expect(() => { connections.push(getDb()); }).toThrow('bootstrap ledger failed');
    const repair = new Database(filename);
    try {
      expect(repair.pragma('user_version', { simple: true })).toBe(0);
      expect((repair.pragma('table_info(users)') as Array<{ name: string }>).map(column => column.name)).not.toContain('auth_version');
      expect((repair.pragma('table_info(ledgers)') as Array<{ name: string }>).map(column => column.name)).not.toContain('operator_id');
      expect(repair.prepare('SELECT username FROM users').all()).toEqual([{ username: 'legacy_player' }]);
      expect(repair.prepare('SELECT COUNT(*) AS count FROM ledgers').get()).toEqual({ count: 1 });
      repair.exec('DROP TRIGGER reject_bootstrap');
    } finally { repair.close(); }
    const db = getDb();
    connections.push(db);
    expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 2 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM ledgers').get()).toEqual({ count: 2 });
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('refuses a configured administrator name occupied by a player without promoting that player', async () => {
    const filename = temporaryDatabasePath();
    createLegacyDatabase(filename);
    const fixture = new Database(filename);
    fixture.prepare('UPDATE users SET username = ? WHERE id = 101').run(testAdmin.username);
    fixture.close();
    const { getDb } = await loadModules(filename);
    expect(() => { connections.push(getDb()); }).toThrow('默认管理员账号已被非管理员用户占用');
    const inspection = new Database(filename);
    try {
      expect(inspection.prepare('SELECT role, balance, password_hash FROM users WHERE id = 101').get())
        .toEqual({ role: 'player', balance: 12.5, password_hash: 'historical-hash' });
      expect(inspection.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 1 });
      expect(inspection.pragma('user_version', { simple: true })).toBe(0);
    } finally { inspection.close(); }
  });
});

describe('Wallet and append-only ledger integrity', () => {
  let store: Awaited<ReturnType<typeof openStore>>;
  let playerId: number;
  let adminId: number;
  const balanceChanges = () => store.db.prepare('SELECT * FROM ledgers WHERE user_id = ? ORDER BY id').all(playerId);

  beforeEach(async () => {
    store = await openStore();
    adminId = store.UserModel.findByUsername(testAdmin.username)!.id;
    playerId = store.UserModel.createUser('integrity_player', 'player-password', '账本玩家', 'avatar', 20.5, 'player', adminId).id;
  });

  it('rolls back the wallet update if the matching ledger insertion fails', () => {
    const before = balanceChanges();
    store.db.exec(`CREATE TEMP TRIGGER reject_ledger BEFORE INSERT ON ledgers
      WHEN NEW.description = 'forced failure'
      BEGIN SELECT RAISE(ABORT, 'ledger write failed'); END;`);
    expect(() => store.UserModel.changeBalance(playerId, -5, 'bet', 'forced failure')).toThrow('ledger write failed');
    expect(store.UserModel.findById(playerId)!.balance).toBe(20.5);
    expect(balanceChanges()).toEqual(before);
    expect(store.UserModel.changeBalance(playerId, -0.5, 'bet', '失败后继续交易').balance).toBe(20);
  });

  it('rolls back account creation when its initial ledger has an invalid operator foreign key', () => {
    const accountsBefore = store.db.prepare('SELECT COUNT(*) AS count FROM users').get();
    const ledgersBefore = store.db.prepare('SELECT COUNT(*) AS count FROM ledgers').get();
    expect(() => store.UserModel.createUser('rolled_back', 'player-password', '回滚玩家', 'avatar', 10, 'player', 999999)).toThrow(/FOREIGN KEY/);
    expect(store.UserModel.findByUsername('rolled_back')).toBeNull();
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual(accountsBefore);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM ledgers').get()).toEqual(ledgersBefore);
  });

  it('rolls back all preceding payments in an outer transaction when a later player cannot pay', () => {
    const secondId = store.UserModel.createUser('second_player', 'player-password', '第二位', 'avatar', 2).id;
    const before = store.db.prepare('SELECT * FROM ledgers ORDER BY id').all();
    expect(() => store.db.transaction(() => {
      store.UserModel.changeBalance(playerId, -5, 'ante', '原子底注', { roomId: '1234' });
      store.UserModel.changeBalance(secondId, -5, 'ante', '原子底注', { roomId: '1234' });
    })()).toThrow('筹码余额不足');
    expect(store.UserModel.findById(playerId)!.balance).toBe(20.5);
    expect(store.UserModel.findById(secondId)!.balance).toBe(2);
    expect(store.db.prepare('SELECT * FROM ledgers ORDER BY id').all()).toEqual(before);
  });

  it('retains an outer transaction after a caught inner failure without leaking the failed update', () => {
    const before = balanceChanges().length;
    store.db.transaction(() => {
      store.UserModel.changeBalance(playerId, -0.5, 'bet', '外层有效扣款');
      expect(() => store.UserModel.changeBalance(playerId, 2, 'recharge', '无效经办人', { operatorId: 999999 })).toThrow(/FOREIGN KEY/);
      store.UserModel.changeBalance(playerId, 1, 'recharge', '外层有效充值');
    })();
    expect(store.UserModel.findById(playerId)!.balance).toBe(21);
    expect(balanceChanges()).toHaveLength(before + 2);
  });

  it('preserves fractional chips and identifies the actor and room on audited movements', () => {
    expect(store.UserModel.changeBalance(playerId, -0.5, 'bet', '半注', { roomId: '1234' }).balance).toBe(20);
    expect(store.UserModel.changeBalance(playerId, 35 / 3, 'game_win', '循环平分', { roomId: '1234' }).balance).toBeCloseTo(20 + 35 / 3, 12);
    const logs = store.LedgerModel.getAuditLogs().list.filter(item => item.userId === playerId);
    expect(logs[0]).toMatchObject({ type: 'game_win', amount: 35 / 3, operatorId: null, operatorUsername: null, roomId: '1234' });
    expect(logs[1]).toMatchObject({ type: 'bet', amount: -0.5, balanceAfter: 20, roomId: '1234' });
    expect(logs[2]).toMatchObject({ type: 'recharge', amount: 20.5, operatorId: adminId, operatorUsername: testAdmin.username, roomId: null });
  });

  it.each([NaN, Infinity, -Infinity, 0, -0, Number.MAX_SAFE_INTEGER + 1])('rejects invalid model amounts (%s) without a wallet or ledger mutation', amount => {
    const before = balanceChanges();
    expect(() => store.UserModel.changeBalance(playerId, amount, 'recharge', '非法金额')).toThrow();
    expect(store.UserModel.findById(playerId)!.balance).toBe(20.5);
    expect(balanceChanges()).toEqual(before);
  });

  it.each([
    ['recharge', -1], ['game_win', -1], ['deduct', 1], ['ante', 1], ['bet', 1], ['unsupported', 1],
  ] as const)('rejects a mismatching movement type and sign (%s, %s)', (type, amount) => {
    const before = balanceChanges();
    expect(() => store.UserModel.changeBalance(playerId, amount, type as 'recharge', '类型方向验证')).toThrow('流水类型与金额方向不一致');
    expect(store.UserModel.findById(playerId)!.balance).toBe(20.5);
    expect(balanceChanges()).toEqual(before);
  });

  it('rejects overdraws, overflowing balances and changes too small to affect the stored balance', () => {
    const before = balanceChanges();
    expect(() => store.UserModel.changeBalance(playerId, -21, 'deduct', '超额扣减')).toThrow('筹码余额不足');
    expect(() => store.UserModel.changeBalance(playerId, Number.MAX_SAFE_INTEGER, 'recharge', '超过余额范围')).toThrow('余额超出可支持的数值范围');
    expect(() => store.UserModel.changeBalance(playerId, Number.MIN_VALUE, 'recharge', '无可表示变化')).toThrow('余额超出可支持的数值范围');
    expect(store.UserModel.findById(playerId)!.balance).toBe(20.5);
    expect(balanceChanges()).toEqual(before);
  });

  it.each([null, 'invalid', -1, Infinity, Number.MAX_SAFE_INTEGER + 1])('enforces wallet bounds even for direct SQL (%s)', balance => {
    expect(() => store.db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, playerId)).toThrow();
    expect(store.UserModel.findById(playerId)!.balance).toBe(20.5);
  });

  it('rejects invalid roles and credential versions at the database boundary', () => {
    expect(() => store.db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?").run(playerId)).toThrow();
    expect(() => store.db.prepare('UPDATE users SET auth_version = -1 WHERE id = ?').run(playerId)).toThrow();
    expect(() => store.db.prepare('UPDATE users SET auth_version = 1.5 WHERE id = ?').run(playerId)).toThrow();
    expect(store.UserModel.findById(playerId)).toMatchObject({ role: 'player', auth_version: 0 });
  });

  it.each([
    ['recharge', 0, 20.5], ['recharge', -1, 20.5], ['deduct', 1, 20.5],
    ['bet', -1, -1], ['bet', -1, Number.MAX_SAFE_INTEGER + 1],
    ['game_win', Infinity, 20.5], ['unknown', 1, 20.5],
  ] as const)('enforces ledger amount, type and balance rules for direct SQL (%s, %s, %s)', (type, amount, balanceAfter) => {
    const before = balanceChanges();
    expect(() => store.db.prepare('INSERT INTO ledgers (user_id, type, amount, balance_after) VALUES (?, ?, ?, ?)')
      .run(playerId, type, amount, balanceAfter)).toThrow();
    expect(balanceChanges()).toEqual(before);
  });

  it('enforces user and operator foreign keys and keeps existing ledgers immutable', () => {
    const before = balanceChanges();
    expect(() => store.db.prepare("INSERT INTO ledgers (user_id, type, amount, balance_after) VALUES (999999, 'recharge', 1, 1)").run()).toThrow(/FOREIGN KEY/);
    expect(() => store.db.prepare("INSERT INTO ledgers (user_id, type, amount, balance_after, operator_id) VALUES (?, 'recharge', 1, 21.5, 999999)").run(playerId)).toThrow(/FOREIGN KEY/);
    expect(() => store.db.prepare('UPDATE ledgers SET amount = 999 WHERE user_id = ?').run(playerId)).toThrow('历史流水只允许追加');
    expect(() => store.db.prepare('DELETE FROM ledgers WHERE user_id = ?').run(playerId)).toThrow('历史流水只允许追加');
    expect(() => store.db.prepare('DELETE FROM users WHERE id = ?').run(playerId)).toThrow(/FOREIGN KEY/);
    expect(balanceChanges()).toEqual(before);
  });

  it('paginates newest first, keeps personal queries isolated, and rejects invalid model pagination', () => {
    for (let index = 0; index < 4; index++) store.UserModel.changeBalance(playerId, 1, 'recharge', `充值 ${index}`);
    const first = store.LedgerModel.getUserLedger(playerId, 1, 2);
    const second = store.LedgerModel.getUserLedger(playerId, 2, 2);
    expect(first.total).toBe(5);
    expect(first.list.map(item => item.description)).toEqual(['充值 3', '充值 2']);
    expect(second.list.map(item => item.description)).toEqual(['充值 1', '充值 0']);
    expect(store.LedgerModel.getUserLedger(playerId, 3, 2).list).toHaveLength(1);
    expect(store.LedgerModel.getUserLedger(playerId, 4, 2)).toEqual({ list: [], total: 5 });
    expect(store.LedgerModel.getUserLedger(999999)).toEqual({ list: [], total: 0 });
    expect(store.LedgerModel.getAuditLogs(1, 2).total).toBe(6);
    for (const [page, pageSize] of [[0, 20], [1.5, 20], [1, 0], [1, 101], [NaN, 20], [Number.MAX_SAFE_INTEGER, 100]]) {
      expect(() => store.LedgerModel.getUserLedger(playerId, page, pageSize)).toThrow('分页参数无效');
      expect(() => store.LedgerModel.getAuditLogs(page, pageSize)).toThrow('分页参数无效');
    }
  });
});
