import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockGameController, MOCK_ME } from '../../client/src/store/mock/mockGameService';
import { useGameStore } from '../../client/src/store/useGameStore';
import * as gameStoreModule from '../../client/src/store/useGameStore';
import { ActionPanel } from '../../client/src/components/table/ActionPanel';
import { SettlementModal } from '../../client/src/components/animations/SettlementModal';
import { TableView } from '../../client/src/views/TableView';
import { PrivateLoserHand } from '../../client/src/components/animations/PKClashModal';
import { TableSeat } from '../../client/src/components/table/TableSeat';
import type { Card, CompareResultEvent } from '../../client/src/types/game';

vi.mock('../../client/src/audio/SoundManager', () => ({
  sound: {
    getMuted: () => true,
    playDealCard: vi.fn(),
    playFlipCard: vi.fn(),
    playPKClash: vi.fn(),
    playChipStack: vi.fn(),
    playAllIn: vi.fn(),
    playWin: vi.fn(),
  },
}));

// 前端没有独立测试运行器，复用服务端 Vitest，并从客户端解析其现有 React 依赖。
const requireClient = createRequire(new URL('../../client/package.json', import.meta.url));
const { createElement } = requireClient('react');
const { renderToStaticMarkup } = requireClient('react-dom/server');

const strongHand: Card[] = [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }, { rank: 12, suit: 'clubs' }];
const weakHand: Card[] = [{ rank: 10, suit: 'diamonds' }, { rank: 11, suit: 'spades' }, { rank: 13, suit: 'hearts' }];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Private loser hand frontend', () => {
  it.each([true, false])('reveals the loser hand only when the local player wins=%s', (wins) => {
    useGameStore.getState().setMockSeatCount(3);
    useGameStore.getState().dealCards();
    const controller = useGameStore.getState().mockController!;
    controller.getSecretHand(1)!.splice(0, 3, ...(wins ? strongHand : weakHand));
    controller.getSecretHand(2)!.splice(0, 3, ...(wins ? weakHand : strongHand));
    useGameStore.getState().compareWithPlayer(2);
    const state = useGameStore.getState();
    const event = state.activePKClash!;
    expect(state.roomState.seats[0]!.hasLooked).toBe(false);
    if (wins) {
      expect(event.loserCards).toEqual(weakHand);
      expect(state.roomState.seats[1]!.cards).toEqual(weakHand);
    } else {
      expect(event).not.toHaveProperty('loserCards');
      expect(state.roomState.seats[1]!.cards).toBeNull();
    }
    const handMarkup = renderToStaticMarkup(createElement(PrivateLoserHand, { clashEvent: event, viewerId: 1 }));
    expect(handMarkup.includes('败者底牌 · 仅你可见')).toBe(wins);

    const seatMarkup = renderToStaticMarkup(createElement(TableSeat, {
      seat: state.roomState.seats[1], deckKind: state.roomState.deckKind,
      isMe: false, isCurrentTurn: false, turnDeadline: null, isPKSelecting: false,
      onSelectPKTarget: vi.fn(), xPercent: 50, yPercent: 20,
      cardXPercent: 50, cardYPercent: 30, cardAngleDeg: 180,
    }));
    expect(seatMarkup).not.toContain('仅你可见');

    useGameStore.getState().dealCards();
    expect(useGameStore.getState().activePKClash).toBeNull();
    expect(useGameStore.getState().roomState.seats[1]!.cards).toBeNull();
  });

  it('lets the local defending winner see the initiating loser without revealing the local hand', () => {
    const { controller } = startMock();
    controller.getSecretHand(1)!.splice(0, 3, ...strongHand);
    controller.getSecretHand(2)!.splice(0, 3, ...weakHand);
    expect(controller.compare(2, 1).loserCards).toEqual(weakHand);
    expect(controller.getState().seats[1]!.cards).toEqual(weakHand);
    expect(controller.getState().seats[0]!.hasLooked).toBe(false);
  });

  it.each([2, 3, 999])('renders no private hand for a losing or unrelated viewer %i', (viewerId) => {
    const event: CompareResultEvent = { initiatorId: 1, targetId: 2, winnerId: 1, loserId: 2, cost: 10, totalPot: 40, loserCards: weakHand };
    expect(renderToStaticMarkup(createElement(PrivateLoserHand, { clashEvent: event, viewerId }))).toBe('');
  });

  it('shows the comparison before settlement in a two-player game', () => {
    useGameStore.getState().setMockSeatCount(2);
    useGameStore.getState().dealCards();
    const controller = useGameStore.getState().mockController!;
    controller.getSecretHand(1)!.splice(0, 3, ...strongHand);
    controller.getSecretHand(2)!.splice(0, 3, ...weakHand);
    useGameStore.getState().compareWithPlayer(2);
    const state = useGameStore.getState();
    expect(state.activeSettlement).not.toBeNull();
    const hook = vi.spyOn(gameStoreModule, 'useGameStore').mockReturnValue(state);
    try {
      const markup = renderToStaticMarkup(createElement(TableView));
      expect(markup).toContain('绝 密 对 决');
      expect(markup).not.toContain('终 局 大 捷');
    } finally {
      hook.mockRestore();
    }
    useGameStore.getState().closePKClash();
    const afterClose = useGameStore.getState();
    const nextHook = vi.spyOn(gameStoreModule, 'useGameStore').mockReturnValue(afterClose);
    try {
      expect(renderToStaticMarkup(createElement(TableView))).toContain('终 局 大 捷');
    } finally {
      nextHook.mockRestore();
    }
  });
});

describe('Frontend cyclic settlement', () => {
  it('keeps the mock payout and each displayed winner hand consistent', () => {
    const { controller } = startMock();
    const state = controller.getState();
    state.deckKind = 'standard';
    state.currentRound = 20;
    state.currentTurnPlayerId = 3;
    const hands = [
      [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }, { rank: 14, suit: 'clubs' }],
      [{ rank: 2, suit: 'spades' }, { rank: 3, suit: 'clubs' }, { rank: 5, suit: 'hearts' }],
      [{ rank: 6, suit: 'diamonds' }, { rank: 9, suit: 'diamonds' }, { rank: 13, suit: 'diamonds' }],
    ] as import('../../client/src/types/game').Card[][];
    hands.forEach((hand, index) => controller.getSecretHand(index + 1)!.splice(0, 3, ...hand));
    const before = state.seats.slice(0, 3).map(seat => seat!.user!.balance);
    controller.bet(3, 'call', 10);
    const event = controller.getLastSettlement()!;
    expect(event.winnerId).toBeNull();
    expect(event.winnerIds).toEqual([1, 2, 3]);
    expect(event.payouts.reduce((sum, payout) => sum + payout.amount, 0)).toBe(35);
    controller.getState().seats.slice(0, 3).forEach((seat, index) => expect(seat!.user!.balance).toBeCloseTo(before[index] - (index === 2 ? 5 : 0) + 35 / 3, 8));
    const markup = renderToStaticMarkup(createElement(SettlementModal, { settlementEvent: event, seats: controller.getState().seats, onClose: vi.fn() }));
    expect(markup).toContain('平 分 奖 池');
    expect(markup).toContain('豹子 AAA');
    expect(markup).toContain('特殊 235');
    expect(markup).toContain('K最大');
  });
});

function startMock() {
  const onBet = vi.fn();
  const controller = new MockGameController(() => {}, 3, onBet);
  controller.startDeal();
  return { controller, onBet };
}

describe('Frontend room thinking time', () => {
  it.each([0, 15, 20, 30, 60])('keeps the selected %i-second setting through creation and play', (seconds) => {
    useGameStore.getState().setMockSeatCount(3);
    const roomId = useGameStore.getState().createMockRoom({ roomName: '朋友私局', baseAnte: 20, turnSeconds: seconds });
    useGameStore.getState().dealCards();
    useGameStore.getState().lookCards();
    useGameStore.getState().bet('call', 20);
    const controller = useGameStore.getState().mockController!;
    controller.bet(2, 'call', 20);
    controller.bet(3, 'call', 20);

    const state = useGameStore.getState().roomState;
    expect(state.roomId).toBe(roomId);
    expect(state.roomName).toBe('朋友私局');
    expect(state.baseAnte).toBe(20);
    expect(state.turnSeconds).toBe(seconds);
    expect(state.turnDeadline).toBe(seconds === 0 ? null : Date.now() + seconds * 1000);
    expect(controller.getState()).toBe(state);
    expect(state.currentTurnPlayerId).toBe(MOCK_ME.id);
    if (seconds === 0) {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(useGameStore.getState().roomState.currentTurnPlayerId).toBe(MOCK_ME.id);
      expect(useGameStore.getState().roomState.turnDeadline).toBeNull();
    }
  });

  it.each([{ seconds: 0, label: '无限制' }, { seconds: 20, label: '20s' }])('shows $label as the room thinking time', ({ seconds, label }) => {
    useGameStore.getState().createMockRoom({ roomName: '显示测试', baseAnte: 10, turnSeconds: seconds });
    useGameStore.setState({ activePKClash: null, isGoldStreamTriggered: false, isAllInTriggered: false });
    // 服务端静态渲染默认读取 Zustand 初始快照，界面断言显式传入当前房间状态。
    const currentState = useGameStore.getState();
    const hook = vi.spyOn(gameStoreModule, 'useGameStore').mockReturnValue(currentState);
    try {
      const markup = renderToStaticMarkup(createElement(TableView));
      expect(markup).toContain(`思考: ${label}`);
      expect(markup).not.toContain('思考: 0s');
    } finally {
      hook.mockRestore();
    }
  });
});

describe('Frontend betting amounts', () => {
  it.each([
    { seen: false, call: 5, raise: 25, allinBase: 19980, compare: 10 },
    { seen: true, call: 10, raise: 50, allinBase: 9990, compare: 20 },
  ])('keeps mock deductions, notifications and all-in consistent with seen=$seen', ({ seen, call, raise, allinBase, compare }) => {
    const { controller, onBet } = startMock();
    expect(controller.getState().totalPot).toBe(30);
    expect(controller.getState().seats[0]!.user!.balance).toBe(9990);
    if (seen) controller.lookCards(MOCK_ME.id);

    controller.bet(MOCK_ME.id, 'call', 10);
    expect(controller.getState().seats[0]!.user!.balance).toBe(9990 - call);
    expect(controller.getState().totalPot).toBe(30 + call);
    expect(onBet.mock.lastCall![0].actualAmount).toBe(call);

    controller.startDeal();
    if (seen) controller.lookCards(MOCK_ME.id);
    const beforeRaise = controller.getState().seats[0]!.user!.balance;
    controller.bet(MOCK_ME.id, 'raise', 50);
    expect(controller.getState().currentBet).toBe(50);
    expect(controller.getState().seats[0]!.user!.balance).toBe(beforeRaise - raise);
    expect(onBet.mock.lastCall![0].actualAmount).toBe(raise);

    const allIn = startMock().controller;
    if (seen) allIn.lookCards(MOCK_ME.id);
    allIn.bet(MOCK_ME.id, 'allin', 9990);
    expect(allIn.getState().currentBet).toBe(allinBase);
    expect(allIn.getState().seats[0]!.user!.balance).toBe(0);
    expect(allIn.getState().totalPot).toBe(10020);

    const pk = startMock().controller;
    if (seen) pk.lookCards(MOCK_ME.id);
    pk.compare(MOCK_ME.id, 2);
    expect(pk.getState().seats[0]!.user!.balance).toBe(9990 - compare);
    expect(pk.getState().totalPot).toBe(30 + compare);
  });

  it.each([
    { seen: false, cost: 10 },
    { seen: true, cost: 20 },
  ])('shows the actual comparison cost in store events with seen=$seen', ({ seen, cost }) => {
    useGameStore.getState().setMockSeatCount(3);
    useGameStore.getState().dealCards();
    if (seen) useGameStore.getState().lookCards();
    useGameStore.getState().compareWithPlayer(2);
    const state = useGameStore.getState();
    expect(state.activePKClash!.cost).toBe(cost);
    expect(state.activePKClash!.totalPot).toBe(30 + cost);
    expect(state.roomState.totalPot).toBe(30 + cost);
  });

  it('uses the paid amount for high-bet effects after blind discounting', () => {
    useGameStore.getState().setMockSeatCount(3);
    useGameStore.getState().dealCards();
    useGameStore.setState({ isGoldStreamTriggered: false });
    useGameStore.getState().bet('raise', 5000);
    expect(useGameStore.getState().flyingChips.at(-1)!.actualAmount).toBe(2500);
    expect(useGameStore.getState().isGoldStreamTriggered).toBe(false);
  });

  it.each([
    { seen: false, base: 10, balance: 5, call: 5, pk: 10, disabled: false },
    { seen: true, base: 10, balance: 5, call: 10, pk: 20, disabled: true },
    { seen: false, base: 50, balance: 25, call: 25, pk: 50, disabled: false },
    { seen: true, base: 50, balance: 50, call: 50, pk: 100, disabled: false },
  ])('renders call $call and compare $pk with correct affordability', ({ seen, base, balance, call, pk, disabled }) => {
    const { controller } = startMock();
    const seat = controller.getState().seats[0]!;
    seat.hasLooked = seen;
    seat.user!.balance = balance;
    const markup = renderToStaticMarkup(createElement(ActionPanel, {
      mySeat: seat,
      isMyTurn: true,
      currentBet: base,
      currentRound: 2,
      gameStatus: 'playing',
      onLook: vi.fn(), onBet: vi.fn(), onFold: vi.fn(), onStartPK: vi.fn(),
      onSendEmoji: vi.fn(), onSendPhrase: vi.fn(),
    }));
    const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!;
    const callButton = buttons.find((button: string) => button.includes(`跟注 (${call})`))!;
    expect(callButton).toBeDefined();
    expect(callButton.includes('disabled')).toBe(disabled);
    expect(buttons.some((button: string) => button.includes(`比牌 (${pk})`))).toBe(true);
    expect(markup).toContain(`当前注额 ${base}`);
    expect(markup).toContain(`闷注 ${base / 2}`);
  });
});
