import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockSessionService = {
  endSession: jest.fn(),
  cleanupSession: jest.fn(),
  getSessionByChannel: jest.fn(),
};

const mockGameRunner = {
  cancelGameRuntime: jest.fn(),
  cancelGameRuntimeByChannel: jest.fn(),
};

const mockAudit = {
  auditGameEvent: jest.fn(),
};

jest.unstable_mockModule('../../src/services/games/session.service.js', () => mockSessionService);
jest.unstable_mockModule('../../src/services/games/game-runner.service.js', () => mockGameRunner);
jest.unstable_mockModule('../../src/services/games/audit.service.js', () => mockAudit);
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const CancellationService = await import('../../src/services/games/cancellation.service.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionService.endSession.mockResolvedValue({ session: { id: 's1' } });
  mockSessionService.cleanupSession.mockResolvedValue(true);
  mockSessionService.getSessionByChannel.mockResolvedValue(null);
  mockGameRunner.cancelGameRuntime.mockResolvedValue(false);
  mockGameRunner.cancelGameRuntimeByChannel.mockResolvedValue(false);
});

describe('Unified cancellation service', () => {
  test('hard cleanup always removes redis state even after successful endSession', async () => {
    mockGameRunner.cancelGameRuntime.mockResolvedValue(true);

    const result = await CancellationService.cancelSessionEverywhere(
      { id: 's1', gameType: 'DICE', channelId: 'c1' },
      'STOP_COMMAND',
      { hardCleanup: true }
    );

    expect(mockGameRunner.cancelGameRuntime).toHaveBeenCalledWith(
      { id: 's1', gameType: 'DICE', channelId: 'c1' },
      'STOP_COMMAND'
    );
    expect(mockSessionService.endSession).toHaveBeenCalledWith('s1', null, 'STOP_COMMAND');
    expect(mockSessionService.cleanupSession).toHaveBeenCalledWith('s1');
    expect(result.redisCleaned).toBe(true);
    expect(result.runtimeCancelled).toBe(true);
    expect(result.transition).toBe('HARD_CLEANED');
    expect(result.cancelled).toBe(true);
  });

  test('SESSION_NOT_FOUND from endSession is treated as already cleaned', async () => {
    mockSessionService.endSession.mockResolvedValue({ error: 'SESSION_NOT_FOUND' });

    const result = await CancellationService.cancelSessionEverywhere(
      { id: 's404', gameType: 'DICE', channelId: 'c1' },
      'STOP_COMMAND'
    );

    expect(mockSessionService.cleanupSession).not.toHaveBeenCalled();
    expect(result.redisCleaned).toBe(true);
    expect(result.transition).toBe('SESSION_NOT_FOUND');
    expect(result.cancelled).toBe(true);
  });

  test('falls back to cleanup when endSession throws', async () => {
    mockSessionService.endSession.mockRejectedValue(new Error('end failed'));

    const result = await CancellationService.cancelSessionEverywhere(
      { id: 's2', gameType: 'ROULETTE', channelId: 'c2' },
      'ERROR'
    );

    expect(mockSessionService.cleanupSession).toHaveBeenCalledWith('s2');
    expect(result.redisCleaned).toBe(true);
    expect(result.transition).toBe('CLEANED_FALLBACK');
    expect(result.cancelled).toBe(true);
  });

  test('channel cancellation can clean runtime-only stale state', async () => {
    mockGameRunner.cancelGameRuntimeByChannel.mockResolvedValue(true);

    const result = await CancellationService.cancelChannelEverywhere('chan-x', 'STOP_COMMAND');

    expect(mockSessionService.getSessionByChannel).toHaveBeenCalledWith('chan-x');
    expect(mockGameRunner.cancelGameRuntimeByChannel).toHaveBeenCalledWith('chan-x', 'STOP_COMMAND');
    expect(result.via).toBe('RUNTIME');
    expect(result.runtimeCancelled).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.transition).toBe('RUNTIME_ONLY');
  });
});
