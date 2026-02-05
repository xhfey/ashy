/**
 * Command loading policy.
 *
 * /play is the only public game launcher. Keep unfinished per-game commands hidden.
 */

const ALLOWED_GAME_COMMAND_FILES = new Set([
  'games/play.js',
  'games/stop.js',
  'games/test-session.js',
]);

function normalize(pathLike) {
  return String(pathLike || '').replace(/\\/g, '/');
}

/**
 * Controls recursive directory traversal for command loading/deploy.
 */
export function shouldDescendIntoCommandDir(relativeDir) {
  const rel = normalize(relativeDir);
  if (!rel) return true;

  // Do not recurse into games/* subdirectories.
  if (rel.startsWith('games/') && rel !== 'games') {
    return false;
  }

  return true;
}

/**
 * Controls which command files are allowed to be imported/deployed.
 */
export function isCommandPathAllowed(relativeFilePath) {
  const rel = normalize(relativeFilePath);
  if (!rel.startsWith('games/')) {
    return true;
  }
  return ALLOWED_GAME_COMMAND_FILES.has(rel);
}

export function getAllowedGameCommandFiles() {
  return Array.from(ALLOWED_GAME_COMMAND_FILES);
}

export default {
  shouldDescendIntoCommandDir,
  isCommandPathAllowed,
  getAllowedGameCommandFiles,
};
