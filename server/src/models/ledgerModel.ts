import { getDb } from '../db/database.js';

export interface LedgerItem {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface AuditLogItem extends LedgerItem {
  userId: number;
  username: string;
  nickname: string;
}

export class LedgerModel {
  static getUserLedger(userId: number, page: number = 1, pageSize: number = 20): { list: LedgerItem[]; total: number } {
    const db = getDb();
    const offset = Math.max(0, (page - 1) * pageSize);

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM ledgers WHERE user_id = ?').get(userId) as { count: number };
    const total = totalRow ? totalRow.count : 0;

    const rows = db.prepare(`
      SELECT id, type, amount, balance_after as balanceAfter, description, created_at as createdAt
      FROM ledgers
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(userId, pageSize, offset) as LedgerItem[];

    return { list: rows, total };
  }

  static getAuditLogs(page: number = 1, pageSize: number = 50): { list: AuditLogItem[]; total: number } {
    const db = getDb();
    const offset = Math.max(0, (page - 1) * pageSize);

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM ledgers').get() as { count: number };
    const total = totalRow ? totalRow.count : 0;

    const rows = db.prepare(`
      SELECT 
        l.id,
        l.user_id as userId,
        u.username,
        u.nickname,
        l.type,
        l.amount,
        l.balance_after as balanceAfter,
        l.description,
        l.created_at as createdAt
      FROM ledgers l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset) as AuditLogItem[];

    return { list: rows, total };
  }
}
