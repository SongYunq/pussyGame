import { Card, HandEvaluation } from '../types/game';
import { DeckKind, evaluateHand as evaluate, compareHands as compare } from '../../../server/src/shared/poker';

export function evaluateHand(cards: Card[], deckKind: DeckKind = 'standard'): HandEvaluation {
  if (!cards || cards.length !== 3) return { type: 'high_card', name: '无手牌', score: 0 };
  const result = evaluate(cards, deckKind);
  const score = result.weight * 1_000_000 + result.ranks[0] * 10000 + result.ranks[1] * 100 + result.ranks[2];
  return { type: result.type, name: result.typeName, score };
}

export function compareHands(a: Card[], b: Card[], isAInitiator = true, deckKind: DeckKind = 'standard'): number {
  return compare(a, b, isAInitiator ? 'A' : 'B', deckKind);
}
