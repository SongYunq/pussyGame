import { UserModel } from '../src/models/userModel.js';
import { getDb } from '../src/db/database.js';
import type { Card, CardSuit } from '../src/shared/poker.js';

let counter = 0;

/** 创建一个带初始筹码的测试玩家，返回其用户 ID。 */
export function createPlayer(chips = 10_000): number {
  counter += 1;
  const name = `t_${process.pid}_${counter}_${Date.now()}`;
  return UserModel.createUser(name, 'secret123', `玩家${counter}`, 'avatar_1.png', chips).id;
}

export function balanceOf(userId: number): number {
  return UserModel.findById(userId)!.balance;
}

/** 某个用户全部流水金额之和，应与当前余额一致。 */
export function ledgerSum(userId: number): number {
  const row = getDb().prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM ledgers WHERE user_id = ?').get(userId) as { total: number };
  return row.total;
}

const SUITS: Record<string, CardSuit> = { s: 'spades', h: 'hearts', c: 'clubs', d: 'diamonds' };
const RANKS: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14, T: 10 };

/** 用 "As Kh 10d" 形式的简写构造手牌。 */
export function hand(text: string): Card[] {
  return text.trim().split(/\s+/).map(token => {
    const suit = SUITS[token.slice(-1)];
    const rankText = token.slice(0, -1);
    const rank = RANKS[rankText] ?? Number(rankText);
    if (!suit || !Number.isInteger(rank)) throw new Error(`无效牌面: ${token}`);
    return { suit, rank };
  });
}
