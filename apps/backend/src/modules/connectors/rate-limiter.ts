/**
 * Token-bucket rate limiter backed by Redis.
 *
 * Each connector gets its own bucket identified by `connectorSlug`.
 * Tokens refill continuously at `requestsPerMinute / 60` tokens per second.
 *
 * Redis keys used (per connector):
 *   rate_limit:{slug}:tokens   – current token count (float)
 *   rate_limit:{slug}:ts       – last refill timestamp in ms
 *
 * All reads + writes happen inside a Redis MULTI/EXEC pipeline so the
 * bucket state is updated atomically.
 */

import { getRedisClient } from '../../lib/redis';
import { logger } from '../../lib/logger';

const KEY_PREFIX = 'rate_limit';
const POLL_INTERVAL_MS = 200; // how often acquire() re-checks when waiting

export class RateLimiter {
  private readonly tokensKey: string;
  private readonly tsKey: string;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number; // tokens added per millisecond

  constructor(
    private readonly connectorSlug: string,
    private readonly requestsPerMinute: number,
  ) {
    this.tokensKey = `${KEY_PREFIX}:${connectorSlug}:tokens`;
    this.tsKey = `${KEY_PREFIX}:${connectorSlug}:ts`;
    this.maxTokens = requestsPerMinute;
    this.refillRatePerMs = requestsPerMinute / 60_000; // per ms
  }

  /**
   * Blocking acquire — waits (polls) until a token is available.
   */
  async acquire(): Promise<void> {
    while (!(await this.tryAcquire())) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * Non-blocking acquire — returns `true` if a token was consumed,
   * `false` if the bucket is empty.
   */
  async tryAcquire(): Promise<boolean> {
    const redis = getRedisClient();
    const now = Date.now();

    // Watch the keys so the MULTI/EXEC fails if another client modifies them
    // between our GET and EXEC.  We retry on conflict.
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await redis.watch(this.tokensKey, this.tsKey);

        const [rawTokens, rawTs] = await redis.mget(this.tokensKey, this.tsKey);

        let tokens: number;
        let lastRefill: number;

        if (rawTokens === null || rawTs === null) {
          // First request — initialise the bucket full
          tokens = this.maxTokens;
          lastRefill = now;
        } else {
          lastRefill = Number(rawTs);
          const elapsed = now - lastRefill;
          tokens = Math.min(
            this.maxTokens,
            Number(rawTokens) + elapsed * this.refillRatePerMs,
          );
          lastRefill = now;
        }

        if (tokens < 1) {
          // Not enough tokens — unwatch and return false
          await redis.unwatch();
          return false;
        }

        // Consume one token
        tokens -= 1;

        const pipeline = redis.multi();
        pipeline.set(this.tokensKey, tokens.toString());
        pipeline.set(this.tsKey, lastRefill.toString());
        const results = await pipeline.exec();

        if (results === null) {
          // WATCH conflict — another client modified the keys, retry
          logger.debug(`RateLimiter(${this.connectorSlug}): WATCH conflict, retrying`);
          continue;
        }

        return true;
      } catch (err) {
        await redis.unwatch().catch(() => {});
        throw err;
      }
    }

    // Exhausted retries — treat as "no token available" to be safe
    logger.warn(`RateLimiter(${this.connectorSlug}): exhausted WATCH retries`);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
