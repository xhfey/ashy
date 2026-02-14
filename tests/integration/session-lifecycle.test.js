import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const kv = new Map();
const sets = new Map();
const locks = new Set();

function decode(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getSet(key) {
  if (!sets.has(key)) sets.set(key, new Set());
  return sets.get(key);
}

function makePipeline() {
  const ops = [];
  return {
    setex(key, _ttl, value) {
      ops.push(() => kv.set(key, value));
      return this;
    },
    del(key) {
      ops.push(() => kv.delete(key));
      return this;
    },
    sadd(key, member) {
      ops.push(() => getSet(key).add(String(member)));
      return this;
    },
    srem(key, member) {
      ops.push(() => getSet(key).delete(String(member)));
      return this;
    },
    async exec() {
      ops.forEach((op) => op());
      return true;
    },
  };
}

const mockRedisService = {
  redis: {
    pipeline: jest.fn(() => makePipeline()),
    del: jest.fn(async (key) => {
      kv.delete(key);
      return 1;
    }),
  },
  get: jest.fn(async (key) => (kv.has(key) ? decode(kv.get(key)) : null)),
  set: jest.fn(async (key, value) => {
    kv.set(key, JSON.stringify(value));
    return true;
  }),
  setMany: jest.fn(async (items) => {
    items.forEach(({ key, value }) => kv.set(key, JSON.stringify(value)));
    return true;
  }),
  getMany: jest.fn(async (keys) => keys.map((key) => (kv.has(key) ? decode(kv.get(key)) : null))),
  smembers: jest.fn(async (setKey) => Array.from(getSet(setKey))),
  acquireLock: jest.fn(async (lockKey) => {
    if (locks.has(lockKey)) return false;
    locks.add(lockKey);
    return true;
  }),
  releaseLock: jest.fn((lockKey) => {
    locks.delete(lockKey);
  }),
};

let idCounter = 0;
const mockGenerateId = jest.fn(() => {
  idCounter += 1;
  return `sess${idCounter}`;
});

jest.unstable_mockModule('../../src/services/redis.service.js', () => mockRedisService);
jest.unstable_mockModule('../../src/utils/helpers.js', () => ({ generateId: mockGenerateId }));
jest.unstable_mockModule('../../src/config/games.config.js', () => ({
  GAMES: {
    DICE: { minPlayers: 2, maxPlayers: 10, lobbyType: 'SIMPLE', countdownSeconds: 30 },
    ROULETTE: { minPlayers: 4, maxPlayers: 20, lobbyType: 'SLOTS', countdownSeconds: 30 },
  },
}));
jest.unstable_mockModule('../../src/services/games/audit.service.js', () => ({
  auditGameEvent: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const SessionService = await import('../../src/services/games/session.service.js');

function makeUser(id) {
  return {
    id,
    username: `user_${id}`,
    globalName: null,
    displayAvatarURL: () => `https://example.com/${id}.png`,
  };
}

beforeEach(() => {
  kv.clear();
  sets.clear();
  locks.clear();
  idCounter = 0;
  jest.clearAllMocks();
});

describe('Session lifecycle safety', () => {
  test('transitions WAITING -> ACTIVE -> COMPLETED and blocks invalid terminal transition', async () => {
    const created = await SessionService.createSession({
      gameType: 'DICE',
      guildId: 'g1',
      channelId: 'c1',
      user: makeUser('host'),
    });

    const join1 = await SessionService.joinSession({ session: created, user: makeUser('p1') });
    expect(join1.error).toBeUndefined();

    const join2 = await SessionService.joinSession({ session: join1.session, user: makeUser('p2') });
    expect(join2.error).toBeUndefined();

    const started = await SessionService.startGame(join2.session);
    expect(started.error).toBeUndefined();
    expect(started.session.status).toBe('ACTIVE');
    expect(started.session.phase).toBe('ACTIVE');
    expect(started.session.players.every((p) => p.status === 'playing')).toBe(true);

    const active = await SessionService.getAllActiveSessions();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(created.id);

    const waiting = await SessionService.getAllWaitingSessions();
    expect(waiting).toHaveLength(0);

    const ended = await SessionService.endSession(created.id, 'p1', 'COMPLETED');
    expect(ended.error).toBeUndefined();
    expect(ended.session.status).toBe('COMPLETED');
    expect(ended.session.winnerId).toBe('p1');

    const invalidEnd = await SessionService.endSession(created.id, null, 'STOP_COMMAND');
    expect(invalidEnd.error).toBe('INVALID_TRANSITION');
    expect(invalidEnd.from).toBe('COMPLETED');
  });

  test('auto-cleans session when starting with not enough players', async () => {
    const created = await SessionService.createSession({
      gameType: 'DICE',
      guildId: 'g1',
      channelId: 'c2',
      user: makeUser('host'),
    });

    const join1 = await SessionService.joinSession({ session: created, user: makeUser('solo') });
    expect(join1.error).toBeUndefined();

    const started = await SessionService.startGame(join1.session);
    expect(started.error).toBe('NOT_ENOUGH_PLAYERS');

    const sessionAfter = await SessionService.getSession(created.id);
    expect(sessionAfter).toBeNull();

    const byChannel = await SessionService.getSessionByChannel('c2');
    expect(byChannel).toBeNull();

    const waiting = await SessionService.getAllWaitingSessions();
    expect(waiting).toHaveLength(0);

    const active = await SessionService.getAllActiveSessions();
    expect(active).toHaveLength(0);
  });

  test('slot lobby join picks the only empty slot deterministically', async () => {
    const created = await SessionService.createSession({
      gameType: 'ROULETTE',
      guildId: 'g1',
      channelId: 'c3',
      user: makeUser('host'),
    });

    const p1 = await SessionService.joinSession({
      session: created,
      user: makeUser('p1'),
      preferredSlot: 1,
    });
    const p2 = await SessionService.joinSession({
      session: p1.session,
      user: makeUser('p2'),
      preferredSlot: 2,
    });
    const p3 = await SessionService.joinSession({
      session: p2.session,
      user: makeUser('p3'),
      preferredSlot: 3,
    });
    const p4 = await SessionService.joinSession({
      session: p3.session,
      user: makeUser('p4'),
      preferredSlot: 4,
    });

    expect(p4.error).toBeUndefined();
    expect(p4.slotNumber).toBe(4);

    const slots = p4.session.players.map((p) => p.slotNumber).sort((a, b) => a - b);
    expect(slots).toEqual([1, 2, 3, 4]);
  });

  test('roulette 4-player minimum validation - fails with 3, succeeds with 4', async () => {
    // Test with 3 players (should fail)
    const session3 = await SessionService.createSession({
      gameType: 'ROULETTE',
      guildId: 'g1',
      channelId: 'c4',
      user: makeUser('host'),
    });

    await SessionService.joinSession({ session: session3, user: makeUser('p1') });
    await SessionService.joinSession({ session: session3, user: makeUser('p2') });
    const with3 = await SessionService.joinSession({ session: session3, user: makeUser('p3') });

    const start3 = await SessionService.startGame(with3.session);
    expect(start3.error).toBe('NOT_ENOUGH_PLAYERS');
    expect(start3.required).toBe(4);
    expect(start3.current).toBe(3);

    // Session should be auto-cleaned
    const cleaned = await SessionService.getSession(session3.id);
    expect(cleaned).toBeNull();

    // Test with 4 players (should succeed)
    const session4 = await SessionService.createSession({
      gameType: 'ROULETTE',
      guildId: 'g1',
      channelId: 'c5',
      user: makeUser('host2'),
    });

    await SessionService.joinSession({ session: session4, user: makeUser('p1') });
    await SessionService.joinSession({ session: session4, user: makeUser('p2') });
    await SessionService.joinSession({ session: session4, user: makeUser('p3') });
    const with4 = await SessionService.joinSession({ session: session4, user: makeUser('p4') });

    const start4 = await SessionService.startGame(with4.session);
    expect(start4.error).toBeUndefined();
    expect(start4.session.status).toBe('ACTIVE');
    expect(start4.session.players).toHaveLength(4);
  });
});
