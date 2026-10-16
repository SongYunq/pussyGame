import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockGameController, MOCK_ME } from '../../client/src/store/mock/mockGameService';
import { useGameStore } from '../../client/src/store/useGameStore';
import { ActionPanel } from '../../client/src/components/table/ActionPanel';

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

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function startMock() {
  const onBet = vi.fn();
  const controller = new MockGameController(() => {}, 3, onBet);
  controller.startDeal();
  return { controller, onBet };
}

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
