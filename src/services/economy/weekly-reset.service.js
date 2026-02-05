import cron from 'node-cron';
import prisma from '../../db/prisma.js';
import { WEEKLY_REWARDS } from '../../config/games.config.js';
import logger from '../../utils/logger.js';

let weeklyResetTask = null;
let lastRunAt = null;
let lastResetCount = 0;
let lastPayoutCount = 0;
let lastPeriodKey = null;

const DEFAULT_CRON = process.env.WEEKLY_RESET_CRON || '0 0 * * 5';
const DEFAULT_TZ = process.env.WEEKLY_RESET_TZ || 'UTC';
const WEEKLY_REWARD_TYPE = 'WEEKLY_REWARD';

function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function payoutWeeklyWinners(periodKey, reason) {
  const groups = await prisma.gameStat.groupBy({
    by: ['gameType'],
    where: { weeklyWins: { gt: 0 } },
  });

  let payouts = 0;

  for (const group of groups) {
    const gameType = group.gameType;
    const leaderboard = await prisma.gameStat.findMany({
      where: {
        gameType,
        weeklyWins: { gt: 0 },
      },
      orderBy: [
        { weeklyWins: 'desc' },
        { weeklyGames: 'desc' },
        { lastPlayed: 'asc' },
      ],
      take: 3,
    });

    for (let i = 0; i < leaderboard.length; i++) {
      const placement = i + 1;
      const reward = WEEKLY_REWARDS[placement] || 0;
      if (reward <= 0) continue;

      const stat = leaderboard[i];
      const source = `WEEKLY_${gameType}`;
      const payoutGranted = await prisma.$transaction(async (tx) => {
        const lockKey = `weekly_reward:${periodKey}:${source}:${stat.userId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const existing = await tx.transaction.findFirst({
          where: {
            userId: stat.userId,
            type: WEEKLY_REWARD_TYPE,
            source,
            metadata: {
              path: ['periodKey'],
              equals: periodKey,
            },
          },
          select: { id: true },
        });

        if (existing) {
          return false;
        }

        await tx.user.upsert({
          where: { id: stat.userId },
          update: {
            ashyCoins: { increment: reward },
            lastActive: new Date(),
          },
          create: {
            id: stat.userId,
            ashyCoins: reward,
          },
        });

        await tx.transaction.create({
          data: {
            userId: stat.userId,
            amount: reward,
            type: WEEKLY_REWARD_TYPE,
            source,
            metadata: {
              periodKey,
              gameType,
              placement,
              weeklyWins: stat.weeklyWins,
              weeklyGames: stat.weeklyGames,
              reason,
            },
          },
        });

        return true;
      });

      if (payoutGranted) payouts++;
    }
  }

  return payouts;
}

export async function runWeeklyReset(reason = 'scheduled') {
  const periodKey = getIsoWeekKey();
  const payoutCount = await payoutWeeklyWinners(periodKey, reason);

  const result = await prisma.gameStat.updateMany({
    data: {
      weeklyWins: 0,
      weeklyGames: 0,
    },
  });

  lastRunAt = new Date().toISOString();
  lastResetCount = result.count || 0;
  lastPayoutCount = payoutCount;
  lastPeriodKey = periodKey;

  logger.info(`[WeeklyReset] Completed (${reason}) - payouts=${payoutCount} reset=${lastResetCount} period=${periodKey}`);
  return {
    payoutCount,
    resetCount: lastResetCount,
    periodKey,
  };
}

export function startWeeklyResetJob() {
  if (weeklyResetTask) return;

  weeklyResetTask = cron.schedule(
    DEFAULT_CRON,
    async () => {
      try {
        await runWeeklyReset('scheduled');
      } catch (error) {
        logger.error('[WeeklyReset] Job failed:', error);
      }
    },
    {
      timezone: DEFAULT_TZ,
    }
  );

  logger.info(`[WeeklyReset] Scheduled with cron "${DEFAULT_CRON}" (${DEFAULT_TZ})`);
}

export function getWeeklyResetStatus() {
  return {
    scheduled: Boolean(weeklyResetTask),
    cron: DEFAULT_CRON,
    timezone: DEFAULT_TZ,
    lastRunAt,
    lastResetCount,
    lastPayoutCount,
    lastPeriodKey,
  };
}

export default {
  runWeeklyReset,
  startWeeklyResetJob,
  getWeeklyResetStatus,
};
