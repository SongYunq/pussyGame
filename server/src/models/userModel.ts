import bcrypt from 'bcryptjs';
import { getDb } from '../db/database.js';
import { UserRecord } from '../types/index.js';
import { isPassword, isTrimmedText } from '../utils/inputValidation.js';

type BalanceChangeType = 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win';

interface BalanceContext {
  operatorId?: number;
  roomId?: string;
}

function validateOperator(operatorId?: number): void {
  if (operatorId !== undefined && (!Number.isSafeInteger(operatorId) || operatorId <= 0)) {
    throw new Error('经办用户ID无效');
  }
}

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
    role: 'player' | 'admin' = 'player',
    operatorId?: number
  ): { id: number; username: string; balance: number } {
    if (!isTrimmedText(username, 64) || !isPassword(passwordPlain) ||
        !isTrimmedText(nickname, 40) || !isTrimmedText(avatar, 256) ||
        !Number.isFinite(initialChips) || initialChips < 0 || initialChips > Number.MAX_SAFE_INTEGER ||
        !['player', 'admin'].includes(role)) {
      throw new Error('账号资料或初始筹码无效');
    }
    validateOperator(operatorId);
    const db = getDb();
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(passwordPlain, salt);

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, nickname, avatar, balance, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(username.trim(), passwordHash, nickname.trim(), avatar.trim(), initialChips, role);

      const userId = Number(result.lastInsertRowid);

      if (initialChips > 0) {
        db.prepare(`
          INSERT INTO ledgers (user_id, type, amount, balance_after, description, operator_id)
          VALUES (?, 'recharge', ?, ?, '管理员开号赠送初始筹码', ?)
        `).run(userId, initialChips, initialChips, operatorId ?? null);
      }

      return { id: userId, username: username.trim(), balance: initialChips };
    });

    return transaction();
  }

  static updateProfile(userId: number, nickname?: string, avatar?: string): { nickname: string; avatar: string } {
    if ((nickname !== undefined && !isTrimmedText(nickname, 40)) ||
        (avatar !== undefined && !isTrimmedText(avatar, 256))) {
      throw new Error('昵称或头像无效');
    }
    const db = getDb();
    const user = this.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    const newNickname = nickname === undefined ? user.nickname : nickname.trim();
    const newAvatar = avatar === undefined ? user.avatar : avatar.trim();

    db.prepare(`
      UPDATE users
      SET nickname = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newNickname, newAvatar, userId);

    return { nickname: newNickname, avatar: newAvatar };
  }

  static resetPassword(userId: number, newPasswordPlain: string): void {
    if (!isPassword(newPasswordPlain)) throw new Error('新密码格式无效');
    const db = getDb();
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPasswordPlain, salt);

    const result = db.prepare(`
      UPDATE users
      SET password_hash = ?, auth_version = auth_version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, userId);

    if (result.changes === 0) {
      throw new Error('用户不存在');
    }
  }

  static getAllUsers(): Array<Omit<UserRecord, 'password_hash' | 'auth_version'>> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, username, nickname, avatar, balance, role, created_at, updated_at
      FROM users
      ORDER BY id ASC
    `).all() as Array<Omit<UserRecord, 'password_hash' | 'auth_version'>>;
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
    type: BalanceChangeType,
    description: string,
    context: BalanceContext = {}
  ): { balance: number } {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isFinite(amount) ||
        amount === 0 || Math.abs(amount) > Number.MAX_SAFE_INTEGER ||
        !isTrimmedText(description, 500)) {
      throw new Error('余额变动参数无效');
    }
    const credit = type === 'recharge' || type === 'game_win';
    const debit = type === 'deduct' || type === 'ante' || type === 'bet';
    if ((!credit && !debit) || (credit && amount < 0) || (debit && amount > 0)) {
      throw new Error('流水类型与金额方向不一致');
    }
    validateOperator(context.operatorId);
    if (context.roomId !== undefined && !isTrimmedText(context.roomId, 64)) {
      throw new Error('流水房间编号无效');
    }
    const db = getDb();

    const transaction = db.transaction(() => {
      const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId) as
        | { id: number; balance: number }
        | undefined;

      if (!user) {
        throw new Error('用户不存在');
      }

      if (!Number.isFinite(user.balance) || user.balance < 0 || user.balance > Number.MAX_SAFE_INTEGER) {
        throw new Error('账户余额数据无效');
      }
      const newBalance = user.balance + amount;
      if (newBalance < 0) {
        throw new Error('筹码余额不足');
      }
      if (!Number.isFinite(newBalance) || newBalance > Number.MAX_SAFE_INTEGER || newBalance === user.balance) {
        throw new Error('余额超出可支持的数值范围');
      }

      db.prepare(`
        UPDATE users
        SET balance = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newBalance, userId);

      db.prepare(`
        INSERT INTO ledgers (user_id, type, amount, balance_after, description, operator_id, room_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, type, amount, newBalance, description, context.operatorId ?? null, context.roomId ?? null);

      return { balance: newBalance };
    });

    return transaction();
  }
}
