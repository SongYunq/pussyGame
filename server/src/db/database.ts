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

  dbInstance = new Database(config.dbPath);

  // 性能与外键配置
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initTables(dbInstance);
  initDefaultAdmin(dbInstance);

  return dbInstance;
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
      balance INTEGER DEFAULT 0,
      role TEXT DEFAULT 'player',
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
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_ledgers_created_at ON ledgers(created_at);
  `);
}

function initDefaultAdmin(db: DatabaseType) {
  const adminRow = db.prepare('SELECT id FROM users WHERE username = ?').get(config.defaultAdmin.username);
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
      INSERT INTO ledgers (user_id, type, amount, balance_after, description)
      VALUES (?, 'recharge', ?, ?, '系统初始化默认管理员筹码')
    `).run(adminId, config.defaultAdmin.initialChips, config.defaultAdmin.initialChips);

    console.log(`[Database] 默认管理员已初始化: ${config.defaultAdmin.username} (初始筹码: ${config.defaultAdmin.initialChips})`);
  }
}
