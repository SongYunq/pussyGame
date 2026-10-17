export type CardSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export interface Card { suit: CardSuit; rank: number }
export type DeckKind = 'standard' | 'short';
export type HandRankType = 'leopard' | 'straight_flush' | 'flush' | 'straight' | 'pair' | 'high_card' | 'special_235';
export type RandomSource = () => number;

export const CARD_SUITS: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
export const SUIT_STRENGTH: Record<CardSuit, number> = { spades: 4, hearts: 3, clubs: 2, diamonds: 1 };
export const HAND_NAMES: Record<HandRankType, string> = {
  leopard: '豹子', straight_flush: '顺金', flush: '金花', straight: '顺子', pair: '对子', high_card: '散牌', special_235: '特殊 235',
};
export interface EvaluatedHand {
  type: HandRankType;
  typeName: string;
  weight: number;
  ranks: number[];
  cards: Card[];
  suitRank: number;
}

export function rankToString(rank: number): string {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
}

export function createDeck(kind: DeckKind = 'standard'): Card[] {
  return CARD_SUITS.flatMap(suit => Array.from({ length: kind === 'short' ? 7 : 13 }, (_, i) => ({ suit, rank: i + (kind === 'short' ? 8 : 2) })));
}

export function shuffle<T>(values: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardKey(card: Card): string { return `${card.suit}_${card.rank}`; }

export function evaluateHand(cards: Card[], kind: DeckKind = 'standard'): EvaluatedHand {
  if (!cards || cards.length !== 3) throw new Error('每手牌必须恰好为 3 张扑克牌');
  if (cards.some(c => !c || !CARD_SUITS.includes(c.suit) || !Number.isInteger(c.rank) || c.rank < (kind === 'short' ? 8 : 2) || c.rank > 14)
    || new Set(cards.map(cardKey)).size !== 3) throw new Error('手牌包含无效或重复的扑克牌');
  const sorted = [...cards].sort((a, b) => b.rank - a.rank || SUIT_STRENGTH[b.suit] - SUIT_STRENGTH[a.suit]);
  const [a, b, c] = sorted.map(card => card.rank);
  const sameSuit = sorted.every(card => card.suit === sorted[0].suit);
  const lowAce = a === 14 && b === (kind === 'short' ? 9 : 3) && c === (kind === 'short' ? 8 : 2);
  const straight = (a - b === 1 && b - c === 1) || lowAce;
  let type: HandRankType;
  let weight: number;
  let ranks = [a, b, c];
  let suitCardRank = a;
  if (a === b && b === c) { type = 'leopard'; weight = 6; }
  else if (sameSuit && straight) { type = 'straight_flush'; weight = 5; }
  else if (sameSuit) { type = 'flush'; weight = 4; }
  else if (straight) { type = 'straight'; weight = 3; }
  else if (a === b || b === c) {
    type = 'pair'; weight = 2;
    const pair = a === b ? a : b;
    ranks = [pair, pair, a === b ? c : a];
    suitCardRank = pair;
  } else if (kind === 'standard' && a === 5 && b === 3 && c === 2) { type = 'special_235'; weight = 1; }
  else { type = 'high_card'; weight = 1; }
  if (straight && (type === 'straight' || type === 'straight_flush') && lowAce) {
    ranks = kind === 'short' ? [9, 8, 7] : [3, 2, 1];
    suitCardRank = ranks[0];
  }
  const suitRank = Math.max(...sorted.filter(card => card.rank === suitCardRank).map(card => SUIT_STRENGTH[card.suit]));
  const detail = type === 'leopard' ? rankToString(a).repeat(3)
    : type === 'pair' ? `${rankToString(ranks[0])} (单牌 ${rankToString(ranks[2])})`
    : type === 'straight' || type === 'straight_flush' ? (lowAce ? (kind === 'short' ? 'A-8-9' : 'A-2-3') : `${rankToString(c)}-${rankToString(b)}-${rankToString(a)}`)
    : type === 'special_235' ? '' : `${rankToString(a)}最大`;
  return { type, typeName: `${HAND_NAMES[type]}${detail ? ` ${detail}` : ''}`, weight, ranks, cards: sorted, suitRank };
}

export function compareEvaluations(a: EvaluatedHand, b: EvaluatedHand): -1 | 0 | 1 {
  if (a.type === 'special_235' && b.type === 'leopard') return 1;
  if (b.type === 'special_235' && a.type === 'leopard') return -1;
  const differences = [a.weight - b.weight, ...a.ranks.map((rank, i) => rank - b.ranks[i]), a.suitRank - b.suitRank];
  const difference = differences.find(value => value !== 0) ?? 0;
  return difference > 0 ? 1 : difference < 0 ? -1 : 0;
}

export function compareHands(a: Card[], b: Card[], initiator: 'A' | 'B' = 'A', kind: DeckKind = 'standard'): 1 | -1 {
  return compareEvaluations(evaluateHand(a, kind), evaluateHand(b, kind)) || (initiator === 'A' ? -1 : 1);
}

export function showdownMultiple<T extends { id: number; cards: Card[] }>(players: T[], kind: DeckKind = 'standard') {
  if (!players.length) throw new Error('没有可参与比牌的存活玩家');
  const evaluations = players.map(player => evaluateHand(player.cards, kind));
  const hasCycle = evaluations.some(e => e.type === 'leopard') && evaluations.some(e => e.type === 'special_235')
    && evaluations.some(e => e.type !== 'leopard' && e.type !== 'special_235');
  if (hasCycle) return { winnerId: null, winnerIds: players.map(p => p.id), evaluation: evaluations[0], split: true };
  let winner = players[0];
  for (const challenger of players.slice(1)) {
    if (compareHands(winner.cards, challenger.cards, 'B', kind) < 0) winner = challenger;
  }
  return { winnerId: winner.id, winnerIds: [winner.id], evaluation: evaluateHand(winner.cards, kind), split: false };
}

export function splitPot(total: number, winnerIds: number[]): Array<{ playerId: number; amount: number }> {
  if (!winnerIds.length || new Set(winnerIds).size !== winnerIds.length || !Number.isFinite(total) || total < 0) throw new Error('奖池分配参数无效');
  const share = total / winnerIds.length;
  let allocated = 0;
  return winnerIds.map((playerId, index) => {
    const amount = index === winnerIds.length - 1 ? total - allocated : share;
    allocated += amount;
    return { playerId, amount };
  });
}
