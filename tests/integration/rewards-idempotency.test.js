import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let storedSession = null;

const mockSessionManager = {
  load: jest.fn(async () => (storedSession ? structuredClone(storedSession) : null)),
  save: jest.fn(async (session) => {
    storedSession = structuredClone(session);
    return session;
  }),
};

const mockCurrencyService = {
  awardGameWin: jest.fn(),
};

jest.unstable_mockModule('../../src/framework/index.js', () => ({
  sessionManager: mockSessionManager,
}));
jest.unstable_mockModule('../../src/services/economy/currency.service.js', () => mockCurrencyService);
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const RewardsService = await import('../../src/services/economy/rewards.service.js');

beforeEach(() => {
  jest.clearAllMocks();
  storedSession = null;
});

describe('Reward idempotency and retry safety', () => {
  test('pays winners once and skips duplicate payout calls for same session', async () => {
    storedSession = { id: 's1', payoutDone: false, gameState: {} };
    mockCurrencyService.awardGameWin.mockResolvedValue({ newBalance: 250 });

    const first = await RewardsService.awardGameWinners({
      gameType: 'ROULETTE',
      sessionId: 's1',
      winnerIds: ['u1'],
      playerCount: 4,
      rewardOverride: 25,
    });

    expect(first.reward).toBe(25);
    expect(first.partial).toBe(false);
    expect(mockCurrencyService.awardGameWin).toHaveBeenCalledTimes(1);
    expect(storedSession.payoutDone).toBe(true);
    expect(storedSession.gameState.rewardLedger.paidIds).toEqual(['u1']);

    const second = await RewardsService.awardGameWinners({
      gameType: 'ROULETTE',
      sessionId: 's1',
      winnerIds: ['u1'],
      playerCount: 4,
      rewardOverride: 25,
    });

    expect(second.alreadyPaid).toBe(true);
    expect(mockCurrencyService.awardGameWin).toHaveBeenCalledTimes(1);
  });

  test('retries only failed winners and completes payout ledger on second pass', async () => {
    storedSession = { id: 's2', payoutDone: false, gameState: {} };
    let failedOnce = false;

    mockCurrencyService.awardGameWin.mockImplementation(async (userId) => {
      if (userId === 'u2' && !failedOnce) {
        failedOnce = true;
        throw new Error('temporary failure');
      }
      return { newBalance: 999 };
    });

    const first = await RewardsService.awardGameWinners({
      gameType: 'DICE',
      sessionId: 's2',
      winnerIds: ['u1', 'u2'],
      playerCount: 3,
      rewardOverride: 15,
    });

    expect(first.partial).toBe(true);
    expect(mockCurrencyService.awardGameWin).toHaveBeenCalledTimes(2);
    expect(storedSession.payoutDone).toBe(false);
    expect(storedSession.gameState.rewardLedger.paidIds).toEqual(['u1']);
    expect(storedSession.gameState.rewardLedger.failedIds).toEqual(['u2']);

    const second = await RewardsService.awardGameWinners({
      gameType: 'DICE',
      sessionId: 's2',
      winnerIds: ['u1', 'u2'],
      playerCount: 3,
      rewardOverride: 15,
    });

    expect(second.partial).toBe(false);
    expect(mockCurrencyService.awardGameWin).toHaveBeenCalledTimes(3);
    expect(storedSession.payoutDone).toBe(true);
    expect(new Set(storedSession.gameState.rewardLedger.paidIds)).toEqual(new Set(['u1', 'u2']));
    expect(storedSession.gameState.rewardLedger.failedIds).toEqual([]);
  });

  test('flags corrupted completed ledgers and avoids additional payouts', async () => {
    storedSession = { id: 's3', payoutDone: true, gameState: {} };

    const result = await RewardsService.awardGameWinners({
      gameType: 'DICE',
      sessionId: 's3',
      winnerIds: ['u1'],
      playerCount: 2,
      rewardOverride: 10,
    });

    expect(result.error).toBe('CORRUPTED_LEDGER');
    expect(result.alreadyPaid).toBe(true);
    expect(mockCurrencyService.awardGameWin).not.toHaveBeenCalled();
  });
});
