import { Card, DeckKind, EvaluatedHand, HandRankType, RandomSource, cardKey, createDeck, evaluateHand, shuffle } from './poker.js';

export const ALGORITHM_VERSION = '2.0.0';
export const GUARANTEE_TYPES = ['pair', 'straight', 'flush', 'straight_flush', 'leopard'] as const;
export type GuaranteeType = typeof GUARANTEE_TYPES[number];
export type GuaranteeCounts = Record<GuaranteeType, number>;
export type RivalCombo = 'big_pair' | 'straight' | 'flush' | 'premium';
export type DealMode = 'random' | 'rival' | 'guarantee';
export interface AlgorithmConfig {
  version: 1;
  deckProbabilities: Record<DeckKind, number>;
  standardModes: Record<DealMode, number>;
  shortModes: Record<'random' | 'rival', number>;
  rivalWeights: Record<RivalCombo, number>;
  guarantees: Record<string, GuaranteeCounts>;
}

export function defaultAlgorithmConfig(): AlgorithmConfig {
  return {
    version: 1,
    deckProbabilities: { standard: 20, short: 80 },
    standardModes: { random: 30, rival: 40, guarantee: 30 },
    shortModes: { random: 70, rival: 30 },
    rivalWeights: { big_pair: 35, straight: 35, flush: 20, premium: 10 },
    guarantees: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i + 2), { pair: 2, straight: 0, flush: 0, straight_flush: 0, leopard: 0 }])),
  };
}

export function validateAlgorithmConfig(input: unknown): AlgorithmConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('发牌配置必须是对象');
  const value = input as Record<string, unknown>;
  if (value.version !== 1) throw new Error('发牌配置版本不受支持，请重新载入配置');
  const result = defaultAlgorithmConfig();
  function group(name: string, keys: readonly string[]): Record<string, number> {
    const label = ({ deckProbabilities: '牌库比例', standardModes: '标准牌模式', shortModes: '短牌模式', rivalWeights: '冤家组合' } as Record<string, string>)[name];
    const data = value[name];
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${label}配置缺失`);
    const entries = keys.map(key => {
      const number = (data as Record<string, unknown>)[key];
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 100) throw new Error(`${label}中的概率必须为 0～100 的数值`);
      return [key, number] as const;
    });
    if (Math.abs(entries.reduce((sum, [, n]) => sum + n, 0) - 100) > 1e-8) throw new Error(`${label}的概率之和必须为 100%`);
    return Object.fromEntries(entries);
  }
  result.deckProbabilities = group('deckProbabilities', ['standard', 'short']) as AlgorithmConfig['deckProbabilities'];
  result.standardModes = group('standardModes', ['random', 'rival', 'guarantee']) as AlgorithmConfig['standardModes'];
  result.shortModes = group('shortModes', ['random', 'rival']) as AlgorithmConfig['shortModes'];
  result.rivalWeights = group('rivalWeights', ['big_pair', 'straight', 'flush', 'premium']) as AlgorithmConfig['rivalWeights'];
  if (!value.guarantees || typeof value.guarantees !== 'object' || Array.isArray(value.guarantees)) throw new Error('保底人数方案缺失');
  for (let count = 2; count <= 8; count++) {
    const plan = (value.guarantees as Record<string, unknown>)[String(count)];
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error(`${count} 人保底方案缺失`);
    let total = 0;
    for (const type of GUARANTEE_TYPES) {
      const number = (plan as Record<string, unknown>)[type];
      if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > count) throw new Error(`${count} 人局的保底人数必须为 0～${count} 的整数`);
      result.guarantees[count][type] = number;
      total += number;
    }
    if (total > count) throw new Error(`${count} 人局的指定保底人数不能超过 ${count}`);
  }
  return result;
}

function choose<T>(values: readonly T[], random: RandomSource): T {
  if (!values.length) throw new Error('没有符合要求的可用手牌');
  return values[Math.floor(random() * values.length)];
}
function weighted<T extends string>(weights: Record<T, number>, random: RandomSource): T {
  const sum = (Object.values(weights) as number[]).reduce((total, value) => total + value, 0);
  const target = random() * sum;
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [T, number][]) {
    total += weight;
    if (target < total) return key;
  }
  throw new Error('概率配置无效');
}

interface Candidate { cards: Card[]; evaluation: EvaluatedHand; mask: bigint }
type Catalogue = Record<HandRankType, Candidate[]>;
const catalogues = new Map<DeckKind, Catalogue>();
function cardMask(card: Card): bigint {
  const suit = ['spades', 'hearts', 'clubs', 'diamonds'].indexOf(card.suit);
  return 1n << BigInt(suit * 13 + card.rank - 2);
}
function catalogue(kind: DeckKind): Catalogue {
  const cached = catalogues.get(kind);
  if (cached) return cached;
  const result = Object.fromEntries(['leopard', 'straight_flush', 'flush', 'straight', 'pair', 'high_card', 'special_235'].map(type => [type, []])) as unknown as Catalogue;
  const deck = createDeck(kind);
  for (let i = 0; i < deck.length - 2; i++) for (let j = i + 1; j < deck.length - 1; j++) for (let k = j + 1; k < deck.length; k++) {
    const cards = [deck[i], deck[j], deck[k]];
    const evaluation = evaluateHand(cards, kind);
    result[evaluation.type].push({ cards, evaluation, mask: cards.reduce((mask, card) => mask | cardMask(card), 0n) });
  }
  catalogues.set(kind, result);
  return result;
}

function guaranteeHands(counts: GuaranteeCounts, random: RandomSource): Candidate[] {
  const pools = catalogue('standard');
  const targets = GUARANTEE_TYPES.flatMap(type => Array.from({ length: counts[type] }, () => type))
    .sort((a, b) => pools[a].length - pools[b].length);
  let visited = 0;
  function search(index: number, used: bigint): Candidate[] | null {
    if (index === targets.length) return [];
    const available = shuffle(pools[targets[index]].filter(c => (c.mask & used) === 0n), random);
    for (const candidate of available) {
      if (++visited > 100_000) throw new Error('保底牌型组合搜索超出上限，请调整方案后重试');
      const rest = search(index + 1, used | candidate.mask);
      if (rest) return [candidate, ...rest];
    }
    return null;
  }
  const result = search(0, 0n);
  if (!result) throw new Error('无法同时满足指定的保底牌型组合');
  return result;
}

function rivalHands(kind: DeckKind, combo: RivalCombo, random: RandomSource): Candidate[] {
  const pools = catalogue(kind);
  let lower: Candidate[];
  let stronger: (hand: Candidate) => Candidate[];
  if (combo === 'big_pair') {
    const pairAbove = random() < 0.5;
    lower = pools.pair.filter(c => c.evaluation.ranks[0] >= 10 && c.evaluation.ranks[0] <= 13);
    stronger = hand => pairAbove ? pools.pair.filter(c => c.evaluation.ranks[0] > hand.evaluation.ranks[0]) : pools.straight;
  } else if (combo === 'straight') {
    const flushAbove = random() < 0.5;
    lower = pools.straight.filter(c => flushAbove || c.evaluation.ranks[0] < 14);
    stronger = hand => flushAbove ? pools.flush : pools.straight.filter(c => c.evaluation.ranks[0] > hand.evaluation.ranks[0]);
  } else if (combo === 'flush') {
    lower = pools.flush.filter(c => c.evaluation.ranks[0] === 12 || c.evaluation.ranks[0] === 13);
    stronger = () => pools.flush.filter(c => c.evaluation.ranks[0] === 14);
  } else {
    const variant = Math.floor(random() * 3);
    lower = variant === 2 ? pools.leopard.filter(c => c.evaluation.ranks[0] < 14)
      : pools.straight_flush.filter(c => variant !== 0 || c.evaluation.ranks[0] < 14);
    stronger = hand => variant === 0 ? pools.straight_flush.filter(c => c.evaluation.ranks[0] > hand.evaluation.ranks[0])
      : variant === 1 ? pools.leopard : pools.leopard.filter(c => c.evaluation.ranks[0] > hand.evaluation.ranks[0]);
  }
  const weak = choose(lower, random);
  const strong = choose(stronger(weak).filter(c => (c.mask & weak.mask) === 0n), random);
  return [weak, strong];
}

export interface DealtHand { cards: Card[]; source: 'random' | 'guarantee' | 'rival_weak' | 'rival_strong' }
export interface DealResult { deckKind: DeckKind; mode: DealMode; rivalCombo?: RivalCombo; hands: DealtHand[]; algorithmVersion: string }

export function dealHands(playerCount: number, config: AlgorithmConfig = defaultAlgorithmConfig(), random: RandomSource = Math.random): DealResult {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) throw new Error('发牌人数必须为 2～8 人');
  config = validateAlgorithmConfig(config);
  const deckKind = weighted(config.deckProbabilities, random);
  const mode: DealMode = deckKind === 'standard' ? weighted(config.standardModes, random) : weighted(config.shortModes, random);
  let selected: Candidate[] = [];
  let rivalCombo: RivalCombo | undefined;
  if (mode === 'rival') { rivalCombo = weighted(config.rivalWeights, random); selected = rivalHands(deckKind, rivalCombo, random); }
  if (mode === 'guarantee') selected = guaranteeHands(config.guarantees[playerCount], random);
  const used = selected.reduce((mask, hand) => mask | hand.mask, 0n);
  const remaining = shuffle(createDeck(deckKind).filter(card => (cardMask(card) & used) === 0n), random);
  const hands: DealtHand[] = selected.map((hand, i) => ({ cards: hand.cards, source: mode === 'rival' ? (i === 0 ? 'rival_weak' : 'rival_strong') : 'guarantee' }));
  for (let i = 0; hands.length < playerCount; i += 3) hands.push({ cards: remaining.slice(i, i + 3), source: 'random' });
  const assigned = shuffle(hands, random).map(hand => ({ ...hand, cards: hand.cards.map(card => ({ ...card })) }));
  if (assigned.some(hand => hand.cards.length !== 3) || new Set(assigned.flatMap(hand => hand.cards.map(cardKey))).size !== playerCount * 3) throw new Error('发牌校验失败');
  return { deckKind, mode, rivalCombo, hands: assigned, algorithmVersion: ALGORITHM_VERSION };
}

export interface SimulationResult {
  algorithmVersion: string;
  totalRounds: number;
  playerCount: number;
  totalHands: number;
  branches: Record<string, number>;
  stats: Record<HandRankType, { count: number; percentage: number }>;
}
export async function simulateDeals(rounds: number, playerCount: number, input: unknown, random: RandomSource = Math.random): Promise<SimulationResult> {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5000) throw new Error('模拟局数必须为 1～5000 的整数');
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) throw new Error('模拟人数必须为 2～8 人');
  const config = validateAlgorithmConfig(input);
  const stats = Object.fromEntries(Object.keys(catalogue('standard')).map(type => [type, { count: 0, percentage: 0 }])) as SimulationResult['stats'];
  const branches: Record<string, number> = { standard_random: 0, standard_rival: 0, standard_guarantee: 0, short_random: 0, short_rival: 0 };
  for (let i = 0; i < rounds; i++) {
    const deal = dealHands(playerCount, config, random);
    branches[`${deal.deckKind}_${deal.mode}`]++;
    for (const hand of deal.hands) stats[evaluateHand(hand.cards, deal.deckKind).type].count++;
    if (i % 25 === 24) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  for (const stat of Object.values(stats)) stat.percentage = Number((stat.count / (rounds * playerCount) * 100).toFixed(4));
  return { algorithmVersion: ALGORITHM_VERSION, totalRounds: rounds, playerCount, totalHands: rounds * playerCount, branches, stats };
}
