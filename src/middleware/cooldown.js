/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  COOLDOWN MIDDLEWARE - Prevent command spam               ║
 * ║  In-memory rate limiting per command per user             ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

// Map<commandName, Map<userId, timestamp>>
const cooldowns = new Map();
const commandCooldownMs = new Map();

// Default cooldowns per command category (in seconds)
const DEFAULT_COOLDOWNS = {
  economy: 5,      // Balance, transfer
  games: 10,       // Game commands
  admin: 0,        // No cooldown for admins
  default: 3       // Fallback
};

const CLEANUP_INTERVAL_MS = 60 * 1000;
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [commandName, commandCooldowns] of cooldowns) {
    const cooldownMs = commandCooldownMs.get(commandName);
    if (!cooldownMs) continue;

    for (const [userId, timestamp] of commandCooldowns) {
      if (now - timestamp > cooldownMs) {
        commandCooldowns.delete(userId);
      }
    }

    if (commandCooldowns.size === 0) {
      cooldowns.delete(commandName);
      commandCooldownMs.delete(commandName);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupInterval.unref?.();

/**
 * Check if user is on cooldown for a command
 * @param {string} commandName - Name of the command
 * @param {string} userId - Discord user ID
 * @param {number} cooldownSeconds - Cooldown duration in seconds
 * @returns {Object} { onCooldown: boolean, remainingTime: number }
 */
export function checkCooldown(commandName, userId, cooldownSeconds = 5) {
  // Get or create command cooldown map
  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Map());
  }

  const commandCooldowns = cooldowns.get(commandName);
  const now = Date.now();
  const cooldownMs = cooldownSeconds * 1000;
  const existingCooldownMs = commandCooldownMs.get(commandName) || 0;
  if (cooldownMs > existingCooldownMs) {
    commandCooldownMs.set(commandName, cooldownMs);
  }

  // Check if user has an existing cooldown
  if (commandCooldowns.has(userId)) {
    const lastUsed = commandCooldowns.get(userId);
    const timePassed = now - lastUsed;

    if (timePassed < cooldownMs) {
      const remainingMs = cooldownMs - timePassed;
      return {
        onCooldown: true,
        remainingTime: Math.ceil(remainingMs / 1000)
      };
    }
  }

  // Set new timestamp
  commandCooldowns.set(userId, now);

  // Cleanup old entries periodically (every 100 commands)
  if (commandCooldowns.size % 100 === 0) {
    cleanupExpiredCooldowns(commandName, cooldownMs);
  }

  return {
    onCooldown: false,
    remainingTime: 0
  };
}

/**
 * Set cooldown for a user without checking (for manual triggers)
 * @param {string} commandName
 * @param {string} userId
 */
export function setCooldown(commandName, userId) {
  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Map());
  }
  cooldowns.get(commandName).set(userId, Date.now());
  const fallbackCooldownMs = DEFAULT_COOLDOWNS.default * 1000;
  const existingCooldownMs = commandCooldownMs.get(commandName) || 0;
  if (fallbackCooldownMs > existingCooldownMs) {
    commandCooldownMs.set(commandName, fallbackCooldownMs);
  }
}

/**
 * Clear cooldown for a user (admin override)
 * @param {string} commandName
 * @param {string} userId
 */
export function clearCooldown(commandName, userId) {
  if (cooldowns.has(commandName)) {
    cooldowns.get(commandName).delete(userId);
  }
}

/**
 * Clear all cooldowns for a command
 * @param {string} commandName
 */
export function clearCommandCooldowns(commandName) {
  cooldowns.delete(commandName);
  commandCooldownMs.delete(commandName);
}

/**
 * Clear all cooldowns for a user across all commands
 * @param {string} userId
 */
export function clearUserCooldowns(userId) {
  for (const commandMap of cooldowns.values()) {
    commandMap.delete(userId);
  }
}

/**
 * Get the default cooldown for a command category
 * @param {string} category - 'economy', 'games', 'admin', etc.
 * @returns {number} Cooldown in seconds
 */
export function getDefaultCooldown(category) {
  return DEFAULT_COOLDOWNS[category] || DEFAULT_COOLDOWNS.default;
}

/**
 * Cleanup expired cooldowns to prevent memory leaks
 * @param {string} commandName
 * @param {number} cooldownMs
 */
function cleanupExpiredCooldowns(commandName, cooldownMs) {
  const commandCooldowns = cooldowns.get(commandName);
  if (!commandCooldowns) return;

  const now = Date.now();
  for (const [userId, timestamp] of commandCooldowns) {
    if (now - timestamp > cooldownMs) {
      commandCooldowns.delete(userId);
    }
  }
  if (commandCooldowns.size === 0) {
    cooldowns.delete(commandName);
    commandCooldownMs.delete(commandName);
  }
}

/**
 * Get cooldown stats (for debugging/admin)
 * @returns {Object} Stats about current cooldowns
 */
export function getCooldownStats() {
  const stats = {};
  for (const [command, users] of cooldowns) {
    stats[command] = users.size;
  }
  return stats;
}
