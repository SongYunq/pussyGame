import { Card, HandEvaluation, HandRankType } from '../types/index.js';

export class GameReferee {
  static rankToString(rank: number): string {
    switch (rank) {
      case 14: return 'A';
      case 13: return 'K';
      case 12: return 'Q';
      case 11: return 'J';
      case 10: return '10';
      default: return rank.toString();
    }
  }

  /**
   * 评估一手三张牌的牌型与权重
   */
  static evaluateHand(cards: Card[]): HandEvaluation {
    if (!cards || cards.length !== 3) {
      throw new Error('每手牌必须恰好为 3 张扑克牌');
    }

    // 按点数从大到小排序
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    const [c1, c2, c3] = sorted;
    const r1 = c1.rank;
    const r2 = c2.rank;
    const r3 = c3.rank;

    const isSameSuit = c1.suit === c2.suit && c2.suit === c3.suit;

    // 顺子判定：常规连续 (如 14-13-12 或 8-7-6) 或 特殊最小顺子 A-2-3 (14, 3, 2)
    const isNormalStraight = r1 - 1 === r2 && r2 - 1 === r3;
    const isA23Straight = r1 === 14 && r2 === 3 && r3 === 2;
    const isStraight = isNormalStraight || isA23Straight;

    // A-2-3 顺子序列在比大小权重时作为最小顺子，有效点数序列对应为 [3, 2, 1] (小于 2-3-4 的 [4, 3, 2])
    const straightRanks = isA23Straight ? [3, 2, 1] : [r1, r2, r3];

    // 1. 豹子 (Leopard): 三张点数相同
    if (r1 === r2 && r2 === r3) {
      return {
        type: 'leopard',
        typeName: `豹子 ${this.rankToString(r1)}${this.rankToString(r2)}${this.rankToString(r3)}`,
        weight: 6,
        ranks: [r1, r2, r3],
        cards: sorted,
      };
    }

    // 2. 同花顺 (Straight Flush / 顺金): 同花且点数连续
    if (isSameSuit && isStraight) {
      const typeDesc = isA23Straight ? 'A-2-3' : `${this.rankToString(r3)}-${this.rankToString(r2)}-${this.rankToString(r1)}`;
      return {
        type: 'straight_flush',
        typeName: `同花顺 ${typeDesc}`,
        weight: 5,
        ranks: straightRanks,
        cards: sorted,
      };
    }

    // 3. 金花 (Flush / 同花): 同花但不连续
    if (isSameSuit) {
      return {
        type: 'flush',
        typeName: `金花 ${this.rankToString(r1)}最大`,
        weight: 4,
        ranks: [r1, r2, r3],
        cards: sorted,
      };
    }

    // 4. 顺子 (Straight): 不同花色且点数连续
    if (isStraight) {
      const typeDesc = isA23Straight ? 'A-2-3' : `${this.rankToString(r3)}-${this.rankToString(r2)}-${this.rankToString(r1)}`;
      return {
        type: 'straight',
        typeName: `顺子 ${typeDesc}`,
        weight: 3,
        ranks: straightRanks,
        cards: sorted,
      };
    }

    // 5. 对子 (Pair): 两张相同 + 一张散牌
    if (r1 === r2) {
      return {
        type: 'pair',
        typeName: `对子 ${this.rankToString(r1)} (单牌 ${this.rankToString(r3)})`,
        weight: 2,
        ranks: [r1, r1, r3],
        cards: sorted,
      };
    }
    if (r2 === r3) {
      return {
        type: 'pair',
        typeName: `对子 ${this.rankToString(r2)} (单牌 ${this.rankToString(r1)})`,
        weight: 2,
        ranks: [r2, r2, r1],
        cards: sorted,
      };
    }

    // 6. 特殊 235: 不同花色的 2-3-5
    const isSpecial235 = r1 === 5 && r2 === 3 && r3 === 2 && !isSameSuit;
    if (isSpecial235) {
      return {
        type: 'special_235',
        typeName: '特殊 235',
        weight: 1, // 基础权重为散牌，但在比牌遇豹子时触发逆袭
        ranks: [5, 3, 2],
        cards: sorted,
      };
    }

    // 7. 单张 (High Card / 散牌)
    return {
      type: 'high_card',
      typeName: `单张 ${this.rankToString(r1)}最大`,
      weight: 1,
      ranks: [r1, r2, r3],
      cards: sorted,
    };
  }

  /**
   * 双人比牌裁决
   * @param cardsA A的手牌
   * @param cardsB B的手牌
   * @param initiator 主动发起方 ('A' 或 'B')
   * @returns 1 表示 A 赢，-1 表示 B 赢
   */
  static compareHands(cardsA: Card[], cardsB: Card[], initiator: 'A' | 'B' = 'A'): 1 | -1 {
    const evalA = this.evaluateHand(cardsA);
    const evalB = this.evaluateHand(cardsB);

    // 1. 特殊 235 逆袭规则：
    // 当且仅当一方为豹子，另一方为特殊 235 时，235 胜出豹子！
    if (evalA.type === 'special_235' && evalB.type === 'leopard') {
      return 1; // 235 逆袭获胜
    }
    if (evalA.type === 'leopard' && evalB.type === 'special_235') {
      return -1; // 235 逆袭获胜
    }

    // 2. 正常比较牌型等级权重
    // 注意：若无豹子，special_235 视为普通单张 (weight 1)
    const weightA = evalA.weight;
    const weightB = evalB.weight;

    if (weightA > weightB) {
      return 1;
    }
    if (weightA < weightB) {
      return -1;
    }

    // 3. 牌型权重相同，逐个比较序列大小
    for (let i = 0; i < evalA.ranks.length; i++) {
      if (evalA.ranks[i] > evalB.ranks[i]) {
        return 1;
      }
      if (evalA.ranks[i] < evalB.ranks[i]) {
        return -1;
      }
    }

    // 4. 同牌型与所有点数完全相同：主动发起比牌者判负（保护防守方）
    return initiator === 'A' ? -1 : 1;
  }

  /**
   * 多人终局亮牌裁决（如打满20轮全员开牌比大小）
   * @param players 存活玩家及其手牌数组
   * @returns 胜者玩家ID及获胜牌型
   */
  static showdownMultiple(
    players: Array<{ id: number; cards: Card[]; seatIndex: number }>
  ): { winnerId: number; evaluation: HandEvaluation } {
    if (players.length === 0) {
      throw new Error('没有可参与比牌的存活玩家');
    }
    if (players.length === 1) {
      const evalResult = this.evaluateHand(players[0].cards);
      return { winnerId: players[0].id, evaluation: evalResult };
    }

    // 检查场上是否存在豹子
    const hasLeopard = players.some((p) => this.evaluateHand(p.cards).type === 'leopard');
    const has235 = players.some((p) => this.evaluateHand(p.cards).type === 'special_235');

    // 如果场上有豹子且有 235：235 压制豹子
    // 如果存在多个 235 或多个其它牌型，我们通过标准比牌依次两两决胜出最终王者
    let currentBest = players[0];

    for (let i = 1; i < players.length; i++) {
      const challenger = players[i];
      // 两两比较，挑战者作为 initiator ('B')
      const result = this.compareHands(currentBest.cards, challenger.cards, 'B');
      if (result === -1) {
        // challenger 击败了 currentBest
        currentBest = challenger;
      }
    }

    return {
      winnerId: currentBest.id,
      evaluation: this.evaluateHand(currentBest.cards),
    };
  }
}
