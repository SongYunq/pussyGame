import { Card, HandEvaluation } from '../types/game';

const RANK_NAMES: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

/**
 * 校验是否为 A-2-3 顺子 (特殊最小顺子)
 */
function isA23(sortedRanks: number[]): boolean {
  return sortedRanks[0] === 14 && sortedRanks[1] === 3 && sortedRanks[2] === 2;
}

/**
 * 评估三张手牌的牌型与权重
 */
export function evaluateHand(cards: Card[]): HandEvaluation {
  if (!cards || cards.length !== 3) {
    return { type: 'high_card', name: '无手牌', score: 0 };
  }

  // 按点数降序排列
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const r0 = sorted[0].rank;
  const r1 = sorted[1].rank;
  const r2 = sorted[2].rank;

  const isFlush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const isStraight = (r0 - r1 === 1 && r1 - r2 === 1) || isA23([r0, r1, r2]);

  // 1. 豹子 (Leopard)
  if (r0 === r1 && r1 === r2) {
    return {
      type: 'leopard',
      name: `豹子 ${RANK_NAMES[r0]}${RANK_NAMES[r0]}${RANK_NAMES[r0]}`,
      score: 6000000 + r0,
    };
  }

  // 2. 特殊 235 (不同花色 2, 3, 5)
  if (!isFlush && r0 === 5 && r1 === 3 && r2 === 2) {
    return {
      type: 'special_235',
      name: '特殊 235',
      score: 50, // 默认散牌极小，遇到豹子时特殊比较
    };
  }

  // 3. 同花顺 (Straight Flush / 顺金)
  if (isFlush && isStraight) {
    const topRank = isA23([r0, r1, r2]) ? 3 : r0;
    return {
      type: 'straight_flush',
      name: `顺金 ${RANK_NAMES[topRank]}最大`,
      score: 5000000 + topRank,
    };
  }

  // 4. 金花 (Flush)
  if (isFlush) {
    return {
      type: 'flush',
      name: `金花 ${RANK_NAMES[r0]}最大`,
      score: 4000000 + r0 * 10000 + r1 * 100 + r2,
    };
  }

  // 5. 顺子 (Straight)
  if (isStraight) {
    const topRank = isA23([r0, r1, r2]) ? 3 : r0;
    return {
      type: 'straight',
      name: `顺子 ${RANK_NAMES[topRank]}最大`,
      score: 3000000 + topRank,
    };
  }

  // 6. 对子 (Pair)
  if (r0 === r1 || r1 === r2 || r0 === r2) {
    let pairRank = r1;
    let singleRank = r0 === r1 ? r2 : (r1 === r2 ? r0 : r1);
    if (r0 === r2) {
      pairRank = r0;
      singleRank = r1;
    }
    return {
      type: 'pair',
      name: `对子 ${RANK_NAMES[pairRank]}`,
      score: 2000000 + pairRank * 100 + singleRank,
    };
  }

  // 7. 单张 (散牌)
  return {
    type: 'high_card',
    name: `散牌 ${RANK_NAMES[r0]}最大`,
    score: 1000000 + r0 * 10000 + r1 * 100 + r2,
  };
}

/**
 * 比较两名玩家手牌
 * @returns 1: a 胜, -1: b 胜, 0: 平局 (若平局主动发起者负)
 */
export function compareHands(cardsA: Card[], cardsB: Card[], isAInitiator: boolean = true): number {
  const evalA = evaluateHand(cardsA);
  const evalB = evaluateHand(cardsB);

  // 特殊 235 逆袭规则：当一方为 235，另一方为豹子时，235 逆袭获胜
  if (evalA.type === 'special_235' && evalB.type === 'leopard') return 1;
  if (evalB.type === 'special_235' && evalA.type === 'leopard') return -1;

  if (evalA.score > evalB.score) return 1;
  if (evalA.score < evalB.score) return -1;

  // 点数牌型完全相同时，主动发起方判负
  return isAInitiator ? -1 : 1;
}
