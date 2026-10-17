import fs from 'fs';
import path from 'path';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';

let dbInstance: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(config.dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version > 1) throw new Error('数据库版本高于当前服务支持的版本');
    db.transaction(() => {
      initTables(db);
      migrateTables(db);
      initDefaultAdmin(db);
      db.pragma('user_version = 1');
    }).immediate();
    // 初始化全部成功后才发布连接，失败的连接不能被后续请求复用。
    dbInstance = db;
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function initTables(db: DatabaseType) {
  // 1. 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT DEFAULT 'avatar_1.png',
      balance NUMERIC NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'player',
      auth_version INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. 筹码流水账本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      balance_after NUMERIC NOT NULL,
      operator_id INTEGER REFERENCES users(id),
      room_id TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 索引优化
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_ledgers_user_id ON ledgers(user_id);
    CREATE INDEX IF NOT EXISTS idx_ledgers_user_id_id ON ledgers(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ledgers_created_at ON ledgers(created_at);
  `);
}

function migrateTables(db: DatabaseType): void {
  // ALTER 保留旧库及全部历史流水；未知的历史经办人保持 NULL，不凭描述猜测。
  const userColumns = db.pragma('table_info(users)') as Array<{ name: string }>;
  if (!userColumns.some(column => column.name === 'auth_version')) {
    db.exec('ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0');
  }
  const ledgerColumns = db.pragma('table_info(ledgers)') as Array<{ name: string }>;
  if (!ledgerColumns.some(column => column.name === 'operator_id')) {
    db.exec('ALTER TABLE ledgers ADD COLUMN operator_id INTEGER REFERENCES users(id)');
  }
  if (!ledgerColumns.some(column => column.name === 'room_id')) {
    db.exec('ALTER TABLE ledgers ADD COLUMN room_id TEXT');
  }

  // 触发器同时覆盖新库和旧库，避免 CREATE TABLE IF NOT EXISTS 令旧库缺少约束。
  for (const operation of ['INSERT', 'UPDATE']) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS users_validate_${operation.toLowerCase()}
      BEFORE ${operation} ON users
      WHEN NEW.balance IS NULL OR typeof(NEW.balance) NOT IN ('integer', 'real')
        OR NEW.balance < 0 OR NEW.balance > 9007199254740991
        OR NEW.role IS NULL OR NEW.role NOT IN ('player', 'admin')
        OR typeof(NEW.auth_version) != 'integer' OR NEW.auth_version < 0
      BEGIN SELECT RAISE(ABORT, '用户余额、角色或凭据版本无效'); END;
    `);
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ledgers_validate_insert BEFORE INSERT ON ledgers
    WHEN typeof(NEW.amount) NOT IN ('integer', 'real') OR NEW.amount = 0
      OR NEW.amount < -9007199254740991 OR NEW.amount > 9007199254740991
      OR typeof(NEW.balance_after) NOT IN ('integer', 'real')
      OR NEW.balance_after < 0 OR NEW.balance_after > 9007199254740991
      OR NEW.type IS NULL OR NEW.type NOT IN ('recharge', 'deduct', 'ante', 'bet', 'game_win')
      OR (NEW.type IN ('recharge', 'game_win') AND NEW.amount <= 0)
      OR (NEW.type IN ('deduct', 'ante', 'bet') AND NEW.amount >= 0)
    BEGIN SELECT RAISE(ABORT, '流水金额或类型无效'); END;
    CREATE TRIGGER IF NOT EXISTS ledgers_no_update BEFORE UPDATE ON ledgers
    BEGIN SELECT RAISE(ABORT, '历史流水只允许追加'); END;
    CREATE TRIGGER IF NOT EXISTS ledgers_no_delete BEFORE DELETE ON ledgers
    BEGIN SELECT RAISE(ABORT, '历史流水只允许追加'); END;
  `);
}

function initDefaultAdmin(db: DatabaseType) {
  const adminRow = db.prepare('SELECT id, role FROM users WHERE username = ?').get(config.defaultAdmin.username) as
    | { id: number; role: string }
    | undefined;
  if (adminRow && adminRow.role !== 'admin') {
    throw new Error('默认管理员账号已被非管理员用户占用，请更换 ADMIN_USER');
  }
  if (!adminRow) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(config.defaultAdmin.password, salt);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, nickname, avatar, balance, role)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `).run(
      config.defaultAdmin.username,
      hash,
      config.defaultAdmin.nickname,
      config.defaultAdmin.avatar,
      config.defaultAdmin.initialChips
    );

    const adminId = Number(result.lastInsertRowid);
    db.prepare(`
      INSERT INTO ledgers (user_id, type, amount, balance_after, description, operator_id)
      VALUES (?, 'recharge', ?, ?, '系统初始化默认管理员筹码', NULL)
    `).run(adminId, config.defaultAdmin.initialChips, config.defaultAdmin.initialChips);

    console.log(`[Database] 默认管理员已初始化: ${config.defaultAdmin.username} (初始筹码: ${config.defaultAdmin.initialChips})`);
  }
}
