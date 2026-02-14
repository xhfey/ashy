import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.useFakeTimers();

const handlers = new Map();
const randomQueue = [];

const mockRandomInt = jest.fn((max) => {
  if (randomQueue.length > 0) return randomQueue.shift();
  return 0;
});

const mockButtonRouter = {
  register: jest.fn((gameType, handler) => {
    handlers.set(gameType, handler);
  }),
};

const sessionStore = new Map();
const mockSessionManager = {
  save: jest.fn(async (session) => {
    sessionStore.set(session.id, structuredClone(session));
  }),
  commit: jest.fn(async (session) => {
    session.uiVersion = (session.uiVersion || 0) + 1;
    sessionStore.set(session.id, structuredClone(session));
  }),
};

const mockSessionService = {
  endSession: jest.fn(async () => ({ session: { id: 'ended' } })),
};

const mockRewards = {
  awardGameWinners: jest.fn(async ({ winnerIds }) => ({
    reward: 22,
    results: [{ userId: winnerIds[0], newBalance: 777 }],
    partial: false,
  })),
};

const mockCurrencyService = {
  getBalance: jest.fn(async () => 777),
};

const mockPerks = {
  canBuyDoubleKick: jest.fn(async () => ({ canBuy: true })),
  purchaseDoubleKick: jest.fn(async () => ({ success: true, newBalance: 500 })),
  processKick: jest.fn((_players, _kickerId, targetId) => ({
    eliminated: targetId,
    reason: 'kicked',
    extraLifeUsed: false,
    shieldUsed: false,
  })),
  getOwnedPerks: jest.fn(() => []),
  hasActivePerk: jest.fn(() => false),
  purchasePerk: jest.fn(async () => ({ success: false, error: 'DISABLED' })),
  addPerk: jest.fn(() => true),
};

jest.unstable_mockModule('crypto', () => ({
  randomInt: mockRandomInt,
}));

jest.unstable_mockModule('../../src/framework/index.js', () => ({
  buttonRouter: mockButtonRouter,
  sessionManager: mockSessionManager,
}));

jest.unstable_mockModule('../../src/services/games/session.service.js', () => mockSessionService);
jest.unstable_mockModule('../../src/services/economy/rewards.service.js', () => mockRewards);
jest.unstable_mockModule('../../src/services/economy/currency.service.js', () => mockCurrencyService);
jest.unstable_mockModule('../../src/services/economy/transaction.service.js', () => ({
  recordGameResult: jest.fn(async () => ({})),
  TransactionType: { GAME_LOSS: 'GAME_LOSS', GAME_TIE: 'GAME_TIE' },
}));
jest.unstable_mockModule('../../src/games/roulette/roulette.perks.js', () => mockPerks);
jest.unstable_mockModule('../../src/games/roulette/WheelGenerator.js', () => ({
  generateWheelGif: jest.fn(async () => Buffer.from('gif')),
  WHEEL_GIF_DURATION_MS: 1,
}));
jest.unstable_mockModule('../../src/games/roulette/roulette.constants.js', () => ({
  MESSAGES: {
    NOT_YOUR_TURN: 'ليس دورك!',
    ALREADY_ELIMINATED: 'تم إقصاء هذا اللاعب!',
    TURN_TIMEOUT: 'timeout',
    DOUBLE_KICK_ACTIVATED: 'double kick on',
    INSUFFICIENT_BALANCE: () => 'low',
    PURCHASE_SUCCESS: () => 'ok',
    ALREADY_OWNED: 'owned',
  },
  TURN_TIMEOUT_MS: 5000,
  RESULT_DELAY_MS: 1,
  GAME_SETTINGS: { kickTimeout: 15 },
  PERKS: {
    DOUBLE_KICK: { id: 'DOUBLE_KICK', cost: 150 },
  },
}));
jest.unstable_mockModule('../../src/games/roulette/roulette.embeds.js', () => ({
  createGameStartEmbed: jest.fn(() => ({ type: 'start' })),
  createRoundEmbed: jest.fn(() => ({ type: 'round' })),
  createChosenEmbed: jest.fn(() => ({ type: 'chosen' })),
  createKickSelectionEmbed: jest.fn(() => ({ type: 'kick_select' })),
  createDoubleKickPromptEmbed: jest.fn(() => ({ type: 'double_prompt' })),
  createEliminationEmbed: jest.fn(() => ({ type: 'elim' })),
  createWinnerEmbed: jest.fn(() => ({ type: 'winner' })),
  createFinalRoundEmbed: jest.fn(() => ({ type: 'final' })),
  createShieldReflectEmbed: jest.fn(() => ({ type: 'shield' })),
  createExtraLifeEmbed: jest.fn(() => ({ type: 'life' })),
  createShopEmbed: jest.fn(() => ({ type: 'shop' })),
}));
jest.unstable_mockModule('../../src/games/roulette/roulette.buttons.js', () => ({
  createKickButtons: jest.fn(() => []),
  createDoubleKickButtons: jest.fn(() => []),
  createWinnerButtons: jest.fn(() => []),
  createShopButtons: jest.fn(() => []),
}));
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const RouletteGame = await import('../../src/games/roulette/roulette.game.js');

function createChannel(id = 'chan-1') {
  let messageCounter = 0;
  return {
    id,
    send: jest.fn(async (_payload) => {
      messageCounter += 1;
      return {
        id: `m${messageCounter}`,
        edit: jest.fn(async () => true),
      };
    }),
  };
}

function createSession(id, playerIds) {
  return {
    id,
    gameType: 'ROULETTE',
    hostId: playerIds[0],
    phase: 'ACTIVE',
    uiVersion: 0,
    players: playerIds.map((userId, idx) => ({
      userId,
      displayName: userId,
      perks: [],
      slotNumber: idx + 1,
    })),
  };
}

function makeCtx(session, playerId, action, details = null) {
  return {
    session,
    player: { id: playerId },
    action,
    details,
    interaction: {
      followUp: jest.fn(async () => true),
      editReply: jest.fn(async () => true),
    },
    commit: async () => {
      await mockSessionManager.commit(session);
    },
  };
}

async function startGameToKickSelection(session, channel) {
  const startPromise = RouletteGame.startRouletteGame(session, channel);
  await jest.advanceTimersByTimeAsync(2205);
  await startPromise;
}

beforeEach(() => {
  handlers.clear();
  sessionStore.clear();
  randomQueue.length = 0;
  jest.clearAllMocks();
  RouletteGame.registerRouletteHandler();
});

afterEach(() => {
  jest.clearAllTimers();
});

describe('Roulette runtime flow', () => {
  test('double kick flow eliminates two targets and pays winner once', async () => {
    randomQueue.push(0); // initial spin picks p1 as kicker

    const channel = createChannel('chan-double');
    const session = createSession('sess-double', ['p1', 'p2', 'p3']);
    await startGameToKickSelection(session, channel);

    const handler = handlers.get('ROULETTE');
    expect(handler).toBeDefined();
    expect(RouletteGame.hasActiveGame(session.id)).toBe(true);

    await handler.onAction(makeCtx(session, 'p1', 'doublekick'));
    await handler.onAction(makeCtx(session, 'p1', 'kick', 'p2'));
    await handler.onAction(makeCtx(session, 'p1', 'kick2', 'p3'));

    expect(mockPerks.purchaseDoubleKick).toHaveBeenCalledWith('p1', 'sess-double');
    expect(mockPerks.processKick).toHaveBeenNthCalledWith(1, expect.any(Array), 'p1', 'p2');
    expect(mockPerks.processKick).toHaveBeenNthCalledWith(2, expect.any(Array), 'p1', 'p3');
    expect(mockRewards.awardGameWinners).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-double',
        winnerIds: ['p1'],
      })
    );
    expect(mockSessionService.endSession).toHaveBeenCalledWith('sess-double', 'p1', 'COMPLETED');
    expect(RouletteGame.hasActiveGame('sess-double')).toBe(false);
  });

  test('random kick action picks valid target and continues to completion', async () => {
    // start spin -> kicker p1, randomkick target index 1 => p3, final-round kicker index 0 => p1
    randomQueue.push(0, 1, 0);

    const channel = createChannel('chan-random');
    const session = createSession('sess-random', ['p1', 'p2', 'p3']);
    await startGameToKickSelection(session, channel);

    const handler = handlers.get('ROULETTE');
    const actionPromise = handler.onAction(makeCtx(session, 'p1', 'randomkick'));
    await jest.advanceTimersByTimeAsync(2205);
    await actionPromise;

    expect(mockPerks.processKick).toHaveBeenCalled();
    expect(mockPerks.processKick.mock.calls[0][1]).toBe('p1');
    expect(mockPerks.processKick.mock.calls[0][2]).toBe('p3');
    expect(mockRewards.awardGameWinners).toHaveBeenCalledTimes(1);
    expect(RouletteGame.hasActiveGame('sess-random')).toBe(false);
  });
});
