import bcrypt from 'bcryptjs';
import { getDb } from '../db/database.js';
import { UserRecord } from '../types/index.js';

export class UserModel {
  static findById(id: number): UserRecord | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
    return row || null;
  }

  static findByUsername(username: string): UserRecord | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRecord | undefined;
    return row || null;
  }

  static createUser(
    username: string,
    passwordPlain: string,
    nickname: string,
    avatar: string = 'avatar_1.png',
    initialChips: number = 0,
    role: 'player' | 'admin' = 'player'
  ): { id: number; username: string; balance: number } {
    const db = getDb();
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(passwordPlain, salt);

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, nickname, avatar, balance, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(username, passwordHash, nickname, avatar, initialChips, role);

      const userId = Number(result.lastInsertRowid);

      if (initialChips > 0) {
        db.prepare(`
          INSERT INTO ledgers (user_id, type, amount, balance_after, description)
          VALUES (?, 'recharge', ?, ?, '管理员开号赠送初始筹码')
        `).run(userId, initialChips, initialChips);
      }

      return { id: userId, username, balance: initialChips };
    });

    return transaction();
  }

  static updateProfile(userId: number, nickname?: string, avatar?: string): { nickname: string; avatar: string } {
    const db = getDb();
    const user = this.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    const newNickname = nickname || user.nickname;
    const newAvatar = avatar || user.avatar;

    db.prepare(`
      UPDATE users 
      SET nickname = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newNickname, newAvatar, userId);

    return { nickname: newNickname, avatar: newAvatar };
  }

  static resetPassword(userId: number, newPasswordPlain: string): void {
    const db = getDb();
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPasswordPlain, salt);

    const result = db.prepare(`
      UPDATE users 
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(passwordHash, userId);

    if (result.changes === 0) {
      throw new Error('用户不存在');
    }
  }

  static getAllUsers(): Array<Omit<UserRecord, 'password_hash'>> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, username, nickname, avatar, balance, role, created_at, updated_at
      FROM users
      ORDER BY id ASC
    `).all() as Array<Omit<UserRecord, 'password_hash'>>;
    return rows;
  }

  /**
   * 严格原子变动筹码流水
   * @param userId 用户 ID
   * @param amount 变动数值（正数为充值/获胜，负数为下注/底注/扣减）
   * @param type 流水类型
   * @param description 描述
   */
  static changeBalance(
    userId: number,
    amount: number,
    type: 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win',
    description: string
  ): { balance: number } {
    const db = getDb();

    const transaction = db.transaction(() => {
      const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId) as
        | { id: number; balance: number }
        | undefined;

      if (!user) {
        throw new Error('用户不存在');
      }

      const newBalance = user.balance + amount;
      if (newBalance < 0) {
        throw new Error('筹码余额不足');
      }

      db.prepare(`
        UPDATE users 
        SET balance = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newBalance, userId);

      db.prepare(`
        INSERT INTO ledgers (user_id, type, amount, balance_after, description)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, type, amount, newBalance, description);

      return { balance: newBalance };
    });

    return transaction();
  }
}
