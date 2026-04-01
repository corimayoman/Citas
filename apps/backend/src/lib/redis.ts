import Redis from 'ioredis';
import { logger } from './logger';

let redisClient: Redis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  return redisClient;
}

/**
 * Returns a BullMQ-compatible connection config.
 * Uses the Redis URL directly so BullMQ creates its own ioredis instance,
 * avoiding type mismatches between different ioredis versions.
 */
export function getBullMQConnection(): { connection: { url: string; maxRetriesPerRequest: null; enableReadyCheck: false } } {
  return {
    connection: {
      url: getRedisUrl(),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  };
}

/** Disconnect the shared Redis client (useful for graceful shutdown / tests). */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
