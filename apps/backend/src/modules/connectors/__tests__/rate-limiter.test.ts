// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPipeline = {
  set: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

const mockRedis = {
  watch: jest.fn(),
  mget: jest.fn(),
  unwatch: jest.fn(),
  multi: jest.fn(() => mockPipeline),
};

jest.mock('../../../lib/redis', () => ({
  getRedisClient: jest.fn(() => mockRedis),
}));

jest.mock('../../../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { RateLimiter } from '../rate-limiter';
import { logger } from '../../../lib/logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SLUG = 'test-connector';
const REQUESTS_PER_MINUTE = 60;
const TOKENS_KEY = `rate_limit:${SLUG}:tokens`;
const TS_KEY = `rate_limit:${SLUG}:ts`;

function makeLimiter(rpm = REQUESTS_PER_MINUTE): RateLimiter {
  return new RateLimiter(SLUG, rpm);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: pipeline.exec succeeds
  mockPipeline.exec.mockResolvedValue(['OK', 'OK']);
  mockRedis.watch.mockResolvedValue('OK');
  mockRedis.unwatch.mockResolvedValue('OK');
});

// ─────────────────────────────────────────────────────────────────────────────
// tryAcquire()
// ─────────────────────────────────────────────────────────────────────────────

describe('tryAcquire()', () => {
  it('initialises the bucket on first request (rawTokens null) and returns true', async () => {
    mockRedis.mget.mockResolvedValue([null, null]);

    const limiter = makeLimiter();
    const result = await limiter.tryAcquire();

    expect(result).toBe(true);
    // Should set both tokens key and ts key via the pipeline
    expect(mockPipeline.set).toHaveBeenCalledTimes(2);
    const setCalls = mockPipeline.set.mock.calls;
    expect(setCalls[0][0]).toBe(TOKENS_KEY);
    expect(setCalls[1][0]).toBe(TS_KEY);
  });

  it('returns true and consumes one token when tokens are available', async () => {
    // Simulate a full bucket: 60 tokens, timestamp = now
    const now = Date.now();
    mockRedis.mget.mockResolvedValue(['60', String(now)]);

    const limiter = makeLimiter();
    const result = await limiter.tryAcquire();

    expect(result).toBe(true);
    // The stored tokens value should be 59 (60 - 1), possibly plus a tiny refill
    const storedTokens = parseFloat(mockPipeline.set.mock.calls[0][1]);
    expect(storedTokens).toBeGreaterThanOrEqual(58); // some refill may happen
    expect(storedTokens).toBeLessThan(60);
  });

  it('returns false when bucket is empty (tokens < 1)', async () => {
    // Bucket has 0 tokens, timestamp = now (no time has passed to refill)
    const now = Date.now();
    mockRedis.mget.mockResolvedValue(['0', String(now)]);

    const limiter = makeLimiter();
    const result = await limiter.tryAcquire();

    expect(result).toBe(false);
    expect(mockRedis.unwatch).toHaveBeenCalled();
    // Pipeline should NOT have been executed
    expect(mockPipeline.exec).not.toHaveBeenCalled();
  });

  it('retries on WATCH conflict (exec returns null) and succeeds on second attempt', async () => {
    const now = Date.now();
    mockRedis.mget.mockResolvedValue(['60', String(now)]);
    // First exec returns null (WATCH conflict), second exec succeeds
    mockPipeline.exec
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(['OK', 'OK']);

    const limiter = makeLimiter();
    const result = await limiter.tryAcquire();

    expect(result).toBe(true);
    expect(mockPipeline.exec).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('WATCH conflict'),
    );
  });

  it('throws when redis.watch throws an unexpected error', async () => {
    mockRedis.watch.mockRejectedValue(new Error('Redis connection lost'));

    const limiter = makeLimiter();

    await expect(limiter.tryAcquire()).rejects.toThrow('Redis connection lost');
    // unwatch should be attempted as cleanup
    expect(mockRedis.unwatch).toHaveBeenCalled();
  });

  it('returns false and logs a warning after exhausting all WATCH retries', async () => {
    const now = Date.now();
    mockRedis.mget.mockResolvedValue(['60', String(now)]);
    // All 5 exec calls return null (persistent WATCH conflicts)
    mockPipeline.exec.mockResolvedValue(null);

    const limiter = makeLimiter();
    const result = await limiter.tryAcquire();

    expect(result).toBe(false);
    expect(mockPipeline.exec).toHaveBeenCalledTimes(5);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('exhausted WATCH retries'),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// acquire()
// ─────────────────────────────────────────────────────────────────────────────

describe('acquire()', () => {
  it('resolves immediately when tryAcquire returns true', async () => {
    mockRedis.mget.mockResolvedValue([null, null]);

    const limiter = makeLimiter();
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });

  it('throws a timeout error when maxWaitMs=0 and tryAcquire always returns false', async () => {
    // Empty bucket — tryAcquire will always return false
    const now = Date.now();
    mockRedis.mget.mockResolvedValue(['0', String(now)]);

    const limiter = makeLimiter();
    // maxWaitMs=0 means deadline = Date.now(), so the loop immediately times out
    await expect(limiter.acquire(0)).rejects.toThrow(
      /timed out waiting for token/,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('timed out waiting for token'),
    );
  });
});
