import { GAMES } from '../config/games.config.js';
import { isGameEnabledForGuild } from '../config/feature-flags.config.js';

/**
 * Lightweight public game metadata used by command registration.
 * Keep this file free of runtime game imports (canvas-heavy modules).
 */
const PUBLIC_GAME_IDS = ['DICE', 'ROULETTE', 'MAFIA'];
const PUBLIC_GAME_ID_SET = new Set(PUBLIC_GAME_IDS);

export function getPublicGameIds() {
  return [...PUBLIC_GAME_IDS];
}

export function getPublicPlayChoices() {
  return PUBLIC_GAME_IDS.map((gameId) => {
    const cfg = GAMES[gameId];
    return {
      name: `${cfg?.emoji || '🎮'} ${cfg?.name || gameId}`,
      value: gameId,
    };
  });
}

export function isPublicGameAvailableInGuild(gameId, guildId) {
  const normalized = String(gameId || '').toUpperCase();
  if (!PUBLIC_GAME_ID_SET.has(normalized)) {
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  const enabled = isGameEnabledForGuild(normalized, guildId, true);
  if (!enabled) {
    return { ok: false, reason: 'ROLLOUT_DISABLED' };
  }

  return { ok: true, reason: null };
}

export default {
  getPublicGameIds,
  getPublicPlayChoices,
  isPublicGameAvailableInGuild,
};
