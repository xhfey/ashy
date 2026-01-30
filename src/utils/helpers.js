/**
 * Common utility functions
 */

import crypto from 'crypto';

/**
 * Format number with Arabic-friendly formatting
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
  return num.toLocaleString('ar-EG');
}

/**
 * Format coins display
 * @param {number} amount
 * @returns {string}
 */
export function formatCoins(amount) {
  return `${formatNumber(amount)} 🪙`;
}

/**
 * Generate a random ID
 * @param {number} length
 * @returns {string}
 */
export function generateId(length = 8) {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate string with ellipsis
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(str, maxLength = 20) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Parse Discord user mention to ID
 * @param {string} mention
 * @returns {string|null}
 */
export function parseUserId(mention) {
  const match = mention.match(/^<@!?(\d+)>$/);
  return match ? match[1] : null;
}

/**
 * Check if value is positive integer
 * @param {any} value
 * @returns {boolean}
 */
export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Clamp number between min and max
 * @param {number} num
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}
