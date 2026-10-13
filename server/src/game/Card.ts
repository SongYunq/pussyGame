import { Card, CardSuit } from '../types/index.js';

export const CARD_SUITS: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
export const CARD_RANKS: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export class Deck {
  static createDeck(): Card[] {
    const cards: Card[] = [];
    for (const suit of CARD_SUITS) {
      for (const rank of CARD_RANKS) {
        cards.push({ suit, rank });
      }
    }
    return cards;
  }

  /**
   * Fisher-Yates 洗牌算法，充分打乱牌序
   */
  static shuffle(cards: Card[]): Card[] {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
