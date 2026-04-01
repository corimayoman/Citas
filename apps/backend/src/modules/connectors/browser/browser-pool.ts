/**
 * BrowserPool — Pool of headless Chromium instances managed by Playwright.
 *
 * Creates isolated BrowserContexts per operation so sessions never share
 * cookies or state.  Instances are reused across operations to avoid the
 * ~2 s cold-start cost of launching a new Chromium process.
 *
 * Config is read from env vars with sensible defaults for Docker/Railway.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { logger } from '../../../lib/logger';

// ── Interfaces ────────────────────────────────────────────────────────

export interface BrowserPoolConfig {
  minInstances: number;
  maxInstances: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
  chromiumArgs: string[];
}

export interface BrowserPoolMetrics {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  queuedRequests: number;
}

export interface AcquiredContext {
  context: BrowserContext;
  page: Page;
  release: () => Promise<void>;
}

// ── Internal helpers ──────────────────────────────────────────────────

interface PooledBrowser {
  browser: Browser;
  activeContexts: number;
  lastUsedAt: number;
}

interface QueuedRequest {
  resolve: (instance: PooledBrowser) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── Realistic User-Agents (rotated) ──────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];


// ── Default config from env ───────────────────────────────────────────

function defaultConfig(): BrowserPoolConfig {
  return {
    minInstances: parseInt(process.env.BROWSER_POOL_MIN ?? '1', 10),
    maxInstances: parseInt(process.env.BROWSER_POOL_MAX ?? '3', 10),
    idleTimeoutMs: parseInt(process.env.BROWSER_POOL_IDLE_TIMEOUT_MS ?? '1800000', 10), // 30 min
    acquireTimeoutMs: 30_000,
    chromiumArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
}

// ── BrowserPool ───────────────────────────────────────────────────────

export class BrowserPool {
  private readonly config: BrowserPoolConfig;
  private readonly instances: PooledBrowser[] = [];
  private readonly waitQueue: QueuedRequest[] = [];
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;
  private uaIndex = 0;

  // Signal handlers stored so we can remove them on shutdown
  private readonly onSigterm: () => void;
  private readonly onSigint: () => void;

  constructor(config?: Partial<BrowserPoolConfig>) {
    this.config = { ...defaultConfig(), ...config };

    this.onSigterm = () => { void this.shutdown(); };
    this.onSigint = () => { void this.shutdown(); };
    process.on('SIGTERM', this.onSigterm);
    process.on('SIGINT', this.onSigint);

    // Periodic idle check every 60 s
    this.idleCheckInterval = setInterval(() => {
      void this.evictIdleInstances();
    }, 60_000);
    // Allow the process to exit even if the interval is still running
    if (this.idleCheckInterval.unref) {
      this.idleCheckInterval.unref();
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Acquire an isolated BrowserContext (and a blank page inside it).
   * If no instance is available and the pool is at max capacity the call
   * waits up to `acquireTimeoutMs` before throwing.
   */
  async acquireContext(): Promise<AcquiredContext> {
    if (this.shuttingDown) {
      throw new Error('BrowserPool is shutting down');
    }

    const instance = await this.getOrCreateInstance();
    instance.activeContexts += 1;
    instance.lastUsedAt = Date.now();

    const userAgent = this.nextUserAgent();

    const context = await instance.browser.newContext({
      userAgent,
      viewport: { width: 1280, height: 720 },
      locale: 'es-ES',
    });

    const page = await context.newPage();

    const released = { done: false };

    const release = async (): Promise<void> => {
      if (released.done) return;
      released.done = true;
      await this.releaseContext(context, instance);
    };

    return { context, page, release };
  }

  /**
   * Release a context — closes it without killing the browser process.
   * Prefer calling `release()` on the AcquiredContext instead of this
   * method directly.
   */
  async releaseContext(context: BrowserContext, instance?: PooledBrowser): Promise<void> {
    try {
      await context.close();
    } catch {
      // Context may already be closed (e.g. after a crash)
    }

    if (instance) {
      instance.activeContexts = Math.max(0, instance.activeContexts - 1);
      instance.lastUsedAt = Date.now();
    }

    // Drain wait queue
    this.drainQueue();
  }

  /** Current pool metrics. */
  getMetrics(): BrowserPoolMetrics {
    const total = this.instances.length;
    const active = this.instances.filter((i) => i.activeContexts > 0).length;
    return {
      totalInstances: total,
      activeInstances: active,
      idleInstances: total - active,
      queuedRequests: this.waitQueue.length,
    };
  }

  /** Orderly shutdown — close every browser and clear timers. */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    logger.info('BrowserPool: shutting down…');

    // Remove signal listeners
    process.removeListener('SIGTERM', this.onSigterm);
    process.removeListener('SIGINT', this.onSigint);

    // Stop idle checker
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    // Reject all queued requests
    for (const req of this.waitQueue) {
      clearTimeout(req.timer);
      req.reject(new Error('BrowserPool is shutting down'));
    }
    this.waitQueue.length = 0;

    // Close all browser instances
    const closePromises = this.instances.map(async (inst) => {
      try {
        await inst.browser.close();
      } catch {
        // already closed / crashed
      }
    });
    await Promise.allSettled(closePromises);
    this.instances.length = 0;

    logger.info('BrowserPool: shutdown complete');
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async getOrCreateInstance(): Promise<PooledBrowser> {
    // 1. Try to find an idle instance (no active contexts)
    const idle = this.instances.find((i) => i.activeContexts === 0);
    if (idle) {
      logger.debug('BrowserPool: reusing idle instance');
      return idle;
    }

    // 2. Try to find any instance below a reasonable concurrency cap
    //    (allow multiple contexts per browser — Playwright supports this)
    const available = this.instances.find((i) => i.activeContexts < 10);
    if (available) {
      return available;
    }

    // 3. Launch a new instance if under max
    if (this.instances.length < this.config.maxInstances) {
      return this.launchInstance();
    }

    // 4. Pool is full — wait in queue
    return this.enqueue();
  }

  private async launchInstance(): Promise<PooledBrowser> {
    logger.info('BrowserPool: launching new Chromium instance');

    const browser = await chromium.launch({
      headless: true,
      args: this.config.chromiumArgs,
    });

    const pooled: PooledBrowser = {
      browser,
      activeContexts: 0,
      lastUsedAt: Date.now(),
    };

    // Detect crash / unexpected disconnect
    browser.on('disconnected', () => {
      logger.warn('BrowserPool: Chromium instance disconnected (crash?)');
      const idx = this.instances.indexOf(pooled);
      if (idx !== -1) {
        this.instances.splice(idx, 1);
      }
      // Try to serve queued requests with a new instance
      this.drainQueue();
    });

    this.instances.push(pooled);
    logger.info(`BrowserPool: instance launched (total: ${this.instances.length})`);
    return pooled;
  }

  private enqueue(): Promise<PooledBrowser> {
    return new Promise<PooledBrowser>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((r) => r.resolve === resolve);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        reject(new Error(`BrowserPool: acquire timeout after ${this.config.acquireTimeoutMs}ms`));
      }, this.config.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  private drainQueue(): void {
    if (this.waitQueue.length === 0) return;

    // Find an instance that can accept work
    const available = this.instances.find((i) => i.activeContexts === 0)
      ?? this.instances.find((i) => i.activeContexts < 10);

    if (available) {
      const req = this.waitQueue.shift();
      if (req) {
        clearTimeout(req.timer);
        req.resolve(available);
      }
      return;
    }

    // If under max, launch a new instance for the next queued request
    if (this.instances.length < this.config.maxInstances) {
      const req = this.waitQueue.shift();
      if (req) {
        clearTimeout(req.timer);
        this.launchInstance()
          .then((inst) => req.resolve(inst))
          .catch((err) => req.reject(err));
      }
    }
  }

  private async evictIdleInstances(): Promise<void> {
    const now = Date.now();
    const toEvict: PooledBrowser[] = [];

    for (const inst of this.instances) {
      if (
        inst.activeContexts === 0 &&
        now - inst.lastUsedAt > this.config.idleTimeoutMs &&
        this.instances.length > this.config.minInstances
      ) {
        toEvict.push(inst);
      }
    }

    for (const inst of toEvict) {
      const idx = this.instances.indexOf(inst);
      if (idx !== -1) {
        this.instances.splice(idx, 1);
        logger.info('BrowserPool: closing idle instance');
        try {
          await inst.browser.close();
        } catch {
          // already closed
        }
      }
    }
  }

  private nextUserAgent(): string {
    const ua = USER_AGENTS[this.uaIndex % USER_AGENTS.length];
    this.uaIndex += 1;
    return ua;
  }
}
