import logger from '../../utils/logger.js';

function baseSessionSnapshot(session) {
  return {
    sessionId: session?.id || null,
    gameType: session?.gameType || null,
    guildId: session?.guildId || null,
    channelId: session?.channelId || null,
    status: session?.status || null,
    phase: session?.phase || null,
    playerCount: Array.isArray(session?.players) ? session.players.length : 0,
    hostId: session?.hostId || null,
  };
}

/**
 * Structured game audit events for lifecycle debugging.
 */
export function auditGameEvent(event, session, details = {}) {
  const snapshot = baseSessionSnapshot(session);
  logger.info(`[GameAudit] ${event}`, {
    event,
    ...snapshot,
    details,
    ts: new Date().toISOString(),
  });
}

export default {
  auditGameEvent,
};
