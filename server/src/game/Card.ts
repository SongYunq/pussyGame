import { Card, DeckKind, CARD_SUITS, createDeck, shuffle } from '../shared/poker.js';
export { CARD_SUITS };
export const CARD_RANKS = Array.from({ length: 13 }, (_, i) => i + 2);

export class Deck {
  static createDeck(kind: DeckKind = 'standard'): Card[] { return createDeck(kind); }
  static shuffle = shuffle;
}
