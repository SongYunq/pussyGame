import { compareHands, evaluateHand, rankToString, showdownMultiple } from '../shared/poker.js';

/** 联机裁判与本地演示共用同一套牌型及比较规则。 */
export class GameReferee {
  static rankToString = rankToString;
  static evaluateHand = evaluateHand;
  static compareHands = compareHands;
  static showdownMultiple = showdownMultiple;
}
