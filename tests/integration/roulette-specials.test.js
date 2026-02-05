import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockCurrencyService = {
  spendCoins: jest.fn(),
  getBalance: jest.fn(),
};

const mockCodec = {
  forSession: jest.fn((session, action, details) => {
    const sid = session?.id || 'no-session';
    return `cid:${sid}:${action}:${details ?? ''}`;
  }),
};

jest.unstable_mockModule('../../src/services/economy/currency.service.js', () => mockCurrencyService);
jest.unstable_mockModule('../../src/services/economy/transaction.service.js', () => ({
  TransactionType: {
    PERK_PURCHASE: 'PERK_PURCHASE',
  },
}));
jest.unstable_mockModule('../../src/framework/index.js', () => ({
  codec: mockCodec,
}));
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const Perks = await import('../../src/games/roulette/roulette.perks.js');
const Buttons = await import('../../src/games/roulette/roulette.buttons.js');
const { PERKS } = await import('../../src/games/roulette/roulette.constants.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrencyService.spendCoins.mockResolvedValue({ newBalance: 500 });
  mockCurrencyService.getBalance.mockResolvedValue(999);
});

function makePlayers() {
  return [
    { userId: 'kicker', displayName: 'Kicker', slot: 1, perks: [] },
    { userId: 'target', displayName: 'Target', slot: 2, perks: [] },
    { userId: 'other', displayName: 'Other', slot: 3, perks: [] },
  ];
}

describe('Roulette perk interactions', () => {
  test('purchasePerk succeeds and charges exact perk cost/type metadata', async () => {
    const result = await Perks.purchasePerk('u1', 'EXTRA_LIFE', 'sess-1');
    expect(result.success).toBe(true);
    expect(result.perk.id).toBe('EXTRA_LIFE');
    expect(mockCurrencyService.spendCoins).toHaveBeenCalledWith(
      'u1',
      PERKS.EXTRA_LIFE.cost,
      'PERK_PURCHASE',
      'ROULETTE',
      expect.objectContaining({
        perkId: 'EXTRA_LIFE',
        sessionId: 'sess-1',
      })
    );
  });

  test('purchasePerk returns INSUFFICIENT_BALANCE on typed error', async () => {
    const err = new Error('low balance');
    err.name = 'InsufficientBalanceError';
    mockCurrencyService.spendCoins.mockRejectedValue(err);

    const result = await Perks.purchasePerk('u1', 'SHIELD', 'sess-2');
    expect(result).toEqual({ success: false, error: 'INSUFFICIENT_BALANCE' });
  });

  test('purchasePerk rejects invalid perk id safely', async () => {
    const result = await Perks.purchasePerk('u1', 'NOT_A_PERK', 'sess-3');
    expect(result).toEqual({ success: false, error: 'INVALID_PERK' });
    expect(mockCurrencyService.spendCoins).not.toHaveBeenCalled();
  });

  test('processKick: shield reflects and eliminates kicker when no extra life', () => {
    const players = makePlayers();
    players[1].perks = ['SHIELD'];

    const result = Perks.processKick(players, 'kicker', 'target');
    expect(result).toEqual({
      eliminated: 'kicker',
      reason: 'shield_reflect',
      extraLifeUsed: false,
      shieldUsed: true,
    });
    expect(players[1].perks).toEqual([]);
  });

  test('processKick: shield reflect is survived when kicker has extra life', () => {
    const players = makePlayers();
    players[0].perks = ['EXTRA_LIFE'];
    players[1].perks = ['SHIELD'];

    const result = Perks.processKick(players, 'kicker', 'target');
    expect(result).toEqual({
      eliminated: null,
      reason: 'extra_life_saved',
      extraLifeUsed: true,
      shieldUsed: true,
    });
    expect(players[0].perks).toEqual([]);
    expect(players[1].perks).toEqual([]);
  });

  test('processKick: target extra life is consumed and survives', () => {
    const players = makePlayers();
    players[1].perks = ['EXTRA_LIFE'];

    const result = Perks.processKick(players, 'kicker', 'target');
    expect(result).toEqual({
      eliminated: null,
      reason: 'extra_life_saved',
      extraLifeUsed: true,
      shieldUsed: false,
    });
    expect(players[1].perks).toEqual([]);
  });

  test('processKick: plain kick eliminates target', () => {
    const players = makePlayers();
    const result = Perks.processKick(players, 'kicker', 'target');
    expect(result.eliminated).toBe('target');
    expect(result.reason).toBe('kicked');
  });

  test('canBuyDoubleKick returns safe default when balance lookup fails', async () => {
    mockCurrencyService.getBalance.mockRejectedValue(new Error('redis down'));
    const result = await Perks.canBuyDoubleKick('u1');
    expect(result.canBuy).toBe(false);
    expect(result.balance).toBe(0);
    expect(result.error).toBeDefined();
  });
});

describe('Roulette special button invariants', () => {
  test('kick controls include self-kick + random-kick and optional double-kick', () => {
    const session = { id: 'sess-a' };
    const targetPlayers = [
      { userId: 'u2', slot: 2, displayName: 'Player Two' },
      { userId: 'u3', slot: 3, displayName: 'Player Three' },
    ];

    const rows = Buttons.createKickButtons(session, targetPlayers, true, 150);
    const actionRowJson = rows[rows.length - 1].toJSON();
    const actionIds = actionRowJson.components.map((c) => c.custom_id);

    expect(actionIds.some((id) => id.includes(':selfkick:'))).toBe(true);
    expect(actionIds.some((id) => id.includes(':randomkick:'))).toBe(true);
    expect(actionIds.some((id) => id.includes(':doublekick:'))).toBe(true);
  });

  test('kick buttons switch to select menu when targets exceed threshold', () => {
    const session = { id: 'sess-b' };
    const targetPlayers = Array.from({ length: 13 }, (_, i) => ({
      userId: `u${i + 1}`,
      slot: i + 1,
      displayName: `Player ${i + 1}`,
    }));

    const rows = Buttons.createKickButtons(session, targetPlayers, false);
    const firstRowJson = rows[0].toJSON();
    expect(firstRowJson.components[0].type).toBe(3);
    expect(firstRowJson.components[0].custom_id).toContain(':kick_select:');

    const actionRowJson = rows[rows.length - 1].toJSON();
    const actionIds = actionRowJson.components.map((c) => c.custom_id);
    expect(actionIds.some((id) => id.includes(':randomkick:'))).toBe(true);
  });

  test('double kick controls include skip action and select fallback', () => {
    const session = { id: 'sess-c' };
    const remainingPlayers = Array.from({ length: 14 }, (_, i) => ({
      userId: `u${i + 1}`,
      slot: i + 1,
      displayName: `Player ${i + 1}`,
    }));

    const rows = Buttons.createDoubleKickButtons(session, remainingPlayers);
    const firstRowJson = rows[0].toJSON();
    expect(firstRowJson.components[0].custom_id).toContain(':kick2_select:');

    const lastRowJson = rows[rows.length - 1].toJSON();
    expect(lastRowJson.components[0].custom_id).toContain(':skip_double:');
  });
});
