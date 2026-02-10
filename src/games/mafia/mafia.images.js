/**
 * Mafia Image Generation (v1: placeholder stubs)
 *
 * Full canvas-based image generation will be added when assets are ready.
 * For now, all functions return null and the game uses text-only UI.
 *
 * Future targets:
 * - generateTeamsBanner({ mafiaCount, doctorCount, detectiveEnabled, citizenCount }) -> Buffer(PNG)
 * - generateWinBanner({ winningTeam, winners, losers, rounds }) -> Buffer(PNG)
 * - generateRoleCard({ role, mafiaTeammates }) -> Buffer(PNG)
 */

import logger from '../../utils/logger.js';

/**
 * Prewarm assets (no-op for v1)
 */
export async function prewarmMafiaAssets() {
  logger.debug('[Mafia] Image assets: using text-only mode (v1)');
}

/**
 * Generate team distribution banner (stub)
 * @returns {null}
 */
export function generateTeamsBanner() {
  return null;
}

/**
 * Generate win banner (stub)
 * @returns {null}
 */
export function generateWinBanner() {
  return null;
}

/**
 * Generate role card (stub)
 * @returns {null}
 */
export function generateRoleCard() {
  return null;
}
