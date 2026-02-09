/**
 * Redis service - OPTIMIZED with auto-pipelining
 * + Index set management for session tracking
 */

import { Redis } from '@upstash/redis';
import logger from '../utils/logger.js';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  enableAutoPipelining: true,
});

// ============ BASIC OPERATIONS ============

export async function testConnection({ retries = 5, baseDelayMs = 1000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;
      logger.info(`✅ Redis connected - Latency: ${latency}ms`);
      return latency;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s, 16s
      if (isLastAttempt) {
        logger.error(`❌ Redis connection failed after ${retries} attempts:`, error);
        return -1;
      }
      logger.warn(`⚠️ Redis connection attempt ${attempt}/${retries} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return -1;
}

export async function get(key) {
  try {
    const value = await redis.get(key);
    if (value === null) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  } catch (error) {
    logger.error(`Redis GET error (${key}):`, error);
    return null;
  }
}

export async function set(key, value, ttlSeconds = null) {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch (error) {
    logger.error(`Redis SET error (${key}):`, error);
    return false;
  }
}

export async function del(key) {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error(`Redis DEL error (${key}):`, error);
    return false;
  }
}

// ============ BATCH OPERATIONS (OPTIMIZED) ============

export async function delMany(keys) {
  if (keys.length === 0) return true;
  try {
    const pipeline = redis.pipeline();
    keys.forEach(key => pipeline.del(key));
    await pipeline.exec();
    return true;
  } catch (error) {
    logger.error('Redis DEL MANY error:', error);
    return false;
  }
}

export async function setMany(items, ttlSeconds = null) {
  if (items.length === 0) return true;
  try {
    const pipeline = redis.pipeline();
    items.forEach(({ key, value }) => {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        pipeline.setex(key, ttlSeconds, serialized);
      } else {
        pipeline.set(key, serialized);
      }
    });
    await pipeline.exec();
    return true;
  } catch (error) {
    logger.error('Redis SET MANY error:', error);
    return false;
  }
}

export async function getMany(keys) {
  if (keys.length === 0) return [];
  try {
    const pipeline = redis.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();
    return results.map(value => {
      if (value === null) return null;
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return value; }
      }
      return value;
    });
  } catch (error) {
    logger.error('Redis GET MANY error:', error);
    return keys.map(() => null);
  }
}

// ============ LOCK OPERATIONS ============

/**
 * Acquire a lock (SET NX with TTL)
 * Returns true if lock acquired, false if already locked
 */
export async function acquireLock(lockKey, ttlSeconds = 2) {
  try {
    const result = await redis.set(lockKey, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (error) {
    logger.error(`Redis LOCK error (${lockKey}):`, error);
    return false;
  }
}

/**
 * Release lock - fire and forget (no await needed by caller)
 * Lock will auto-expire anyway via TTL
 */
export function releaseLock(lockKey) {
  redis.del(lockKey).catch(() => {});
}

// ============ SET OPERATIONS (for session index) ============

/**
 * Add member to a set
 */
export async function sadd(setKey, member) {
  try {
    await redis.sadd(setKey, member);
    return true;
  } catch (error) {
    logger.error('Redis SADD error:', error);
    return false;
  }
}

/**
 * Remove member from a set
 */
export async function srem(setKey, member) {
  try {
    await redis.srem(setKey, member);
    return true;
  } catch (error) {
    logger.error('Redis SREM error:', error);
    return false;
  }
}

/**
 * Get all members of a set
 */
export async function smembers(setKey) {
  try {
    return await redis.smembers(setKey);
  } catch (error) {
    logger.error('Redis SMEMBERS error:', error);
    return [];
  }
}

export { redis };
