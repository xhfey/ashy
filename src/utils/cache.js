/**
 * Smart Cache Utility
 * Provides TTL-based caching with automatic cleanup.
 *
 * Features:
 * - Automatic TTL-based expiration
 * - LRU-like eviction when max size reached
 * - Stats tracking for hit/miss rates
 * - Lazy cleanup (on access) + periodic cleanup
 *
 * Usage:
 *   import { cache, createCache } from './cache.js';
 *
 *   // Using default cache
 *   const value = await cache.getOrFetch('user:123', async () => {
 *     return await db.getUser(123);
 *   }, 30000); // 30s TTL
 *
 *   // Creating a dedicated cache
 *   const userCache = createCache({ maxSize: 100, defaultTTL: 60000 });
 */

import logger from './logger.js';

class SmartCache {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.maxSize = options.maxSize || 500;
    this.defaultTTL = options.defaultTTL || 60000; // 1 minute
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute

    this.data = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
    };

    // Periodic cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);

    // Don't let the timer prevent Node from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Get a cached value or fetch it
   * @param {string} key - Cache key
   * @param {Function} fetcher - Async function to fetch value if not cached
   * @param {number} ttl - Time to live in milliseconds (optional)
   * @returns {Promise<any>} - Cached or fetched value
   */
  async getOrFetch(key, fetcher, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;

    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Get a cached value (returns undefined if not found or expired)
   * @param {string} key - Cache key
   * @returns {any} - Cached value or undefined
   */
  get(key) {
    const entry = this.data.get(key);

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (entry.expires && entry.expires < Date.now()) {
      this.data.delete(key);
      this.stats.expirations++;
      return undefined;
    }

    // Update access time for LRU-like behavior
    entry.lastAccess = Date.now();
    return entry.value;
  }

  /**
   * Set a cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = this.defaultTTL) {
    // Evict oldest entries if at max size
    if (this.data.size >= this.maxSize && !this.data.has(key)) {
      this.evictOldest();
    }

    this.data.set(key, {
      value,
      expires: ttl > 0 ? Date.now() + ttl : null,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a cached entry
   * @param {string} key - Cache key
   * @returns {boolean} - True if entry existed
   */
  delete(key) {
    return this.data.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.data.clear();
    logger.debug(`[Cache:${this.name}] Cleared all entries`);
  }

  /**
   * Evict the oldest/least-recently-accessed entry
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.data) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.data.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.data) {
      if (entry.expires && entry.expires < now) {
        this.data.delete(key);
        this.stats.expirations++;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[Cache:${this.name}] Cleaned ${cleaned} expired entries, ${this.data.size} remaining`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.data.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  /**
   * Destroy the cache (cleanup timer)
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.data.clear();
  }
}

/**
 * Image Cache - Specialized for canvas image buffers
 * Has longer TTL and tracks memory usage
 */
class ImageCache extends SmartCache {
  constructor(options = {}) {
    super({
      name: options.name || 'images',
      maxSize: options.maxSize || 50,
      defaultTTL: options.defaultTTL || 3600000, // 1 hour
      cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
      ...options,
    });

    this.memoryLimit = options.memoryLimit || 100 * 1024 * 1024; // 100MB
    this.estimatedMemory = 0;
  }

  set(key, value, ttl = this.defaultTTL) {
    // Estimate memory usage for buffers
    let size = 0;
    if (Buffer.isBuffer(value)) {
      size = value.length;
    } else if (value && typeof value === 'object' && value.width && value.height) {
      // Canvas-like object
      size = value.width * value.height * 4; // RGBA
    }

    // Evict if memory limit would be exceeded
    while (this.estimatedMemory + size > this.memoryLimit && this.data.size > 0) {
      this.evictOldest();
    }

    const existingEntry = this.data.get(key);
    if (existingEntry && existingEntry.size) {
      this.estimatedMemory -= existingEntry.size;
    }

    super.set(key, value, ttl);

    // Store size in the entry
    const entry = this.data.get(key);
    if (entry) {
      entry.size = size;
      this.estimatedMemory += size;
    }
  }

  delete(key) {
    const entry = this.data.get(key);
    if (entry && entry.size) {
      this.estimatedMemory -= entry.size;
    }
    return super.delete(key);
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    let oldestSize = 0;

    for (const [key, entry] of this.data) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
        oldestSize = entry.size || 0;
      }
    }

    if (oldestKey) {
      this.data.delete(oldestKey);
      this.estimatedMemory -= oldestSize;
      this.stats.evictions++;
    }
  }

  clear() {
    super.clear();
    this.estimatedMemory = 0;
  }

  getStats() {
    return {
      ...super.getStats(),
      estimatedMemoryMB: (this.estimatedMemory / (1024 * 1024)).toFixed(2),
      memoryLimitMB: (this.memoryLimit / (1024 * 1024)).toFixed(2),
    };
  }
}

/**
 * Create a new cache instance
 * @param {Object} options - Cache options
 * @returns {SmartCache}
 */
export function createCache(options = {}) {
  return new SmartCache(options);
}

/**
 * Create a new image cache instance
 * @param {Object} options - Cache options
 * @returns {ImageCache}
 */
export function createImageCache(options = {}) {
  return new ImageCache(options);
}

// Default global cache instance
export const cache = new SmartCache({ name: 'global' });

// Specialized caches
export const sessionCache = new SmartCache({
  name: 'sessions',
  maxSize: 200,
  defaultTTL: 30000, // 30s
});

export const balanceCache = new SmartCache({
  name: 'balances',
  maxSize: 500,
  defaultTTL: 30000, // 30s
});

export const leaderboardCache = new SmartCache({
  name: 'leaderboard',
  maxSize: 10,
  defaultTTL: 60000, // 60s
});

export const imageCache = new ImageCache({
  name: 'images',
  maxSize: 50,
  defaultTTL: 3600000, // 1 hour
  memoryLimit: 100 * 1024 * 1024, // 100MB
});

// Cleanup on process exit
process.on('beforeExit', () => {
  cache.destroy();
  sessionCache.destroy();
  balanceCache.destroy();
  leaderboardCache.destroy();
  imageCache.destroy();
});

export default cache;
