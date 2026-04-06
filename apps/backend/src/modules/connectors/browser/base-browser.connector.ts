/**
 * BaseBrowserConnector — abstract base class for browser-automated connectors.
 *
 * Replaces BaseRealConnector (axios) for portals that require JavaScript
 * rendering, JSF ViewState management, or CAPTCHA handling.
 *
 * Encapsulates:
 *   • BrowserPool context acquisition / release (always via try/finally)
 *   • Rate limiting via RateLimiter (token-bucket in Redis)
 *   • Anomaly detection (CAPTCHA / structure changes) after each nav step
 *   • Reusable utility methods for form interaction
 *   • Per-step and total-operation logging
 */

import type { Page, BrowserContext } from 'playwright-core';
import {
  IConnector,
  ConnectorMetadata,
  TimeSlot,
  BookingResult,
} from '../connector.interface';
import { CircuitBreakerError } from '../adapters/base-real.connector';
import { RateLimiter } from '../rate-limiter';
import { BrowserPool, AcquiredContext } from './browser-pool';
import type { BrowserConnectorConfig, CaptchaDetection } from './portal-config';
import { logger } from '../../../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? '/tmp/screenshots';

// ── BaseBrowserConnector ─────────────────────────────────────────────────────

export abstract class BaseBrowserConnector implements IConnector {
  abstract readonly metadata: ConnectorMetadata;

  protected readonly rateLimiter: RateLimiter;

  constructor(
    protected readonly config: BrowserConnectorConfig,
    protected readonly browserPool: BrowserPool,
  ) {
    this.rateLimiter = new RateLimiter(
      config.connectorSlug,
      config.rateLimit,
    );
  }

  // ── IConnector concrete methods ──────────────────────────────────────────

  // ── Resilience helpers ───────────────────────────────────────────────────

  /**
   * Navigate to a URL with one automatic retry on timeout.
   * If the first attempt fails with a timeout, retries once before throwing.
   */
  protected async navigateWithRetry(
    page: Page,
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' },
  ): Promise<void> {
    const waitUntil = options?.waitUntil ?? 'domcontentloaded';
    try {
      await page.goto(url, { waitUntil });
    } catch (err) {
      const isTimeout = err instanceof Error && (err.message.includes('Timeout') || err.message.includes('timeout'));
      if (isTimeout) {
        logger.warn(`BaseBrowserConnector(${this.config.connectorSlug}): page load timeout, retrying once — ${url}`);
        await page.goto(url, { waitUntil });
      } else {
        throw err;
      }
    }
  }

  /**
   * Check if the portal returned a generic error page (HTTP 500, "servicio no disponible").
   * These are transient errors that should allow SearchWorker to retry without activating
   * the CircuitBreaker.
   */
  protected async checkForPortalError(page: Page): Promise<void> {
    const bodyText = (await page.textContent('body') ?? '').toLowerCase();
    const errorIndicators = [
      'servicio no disponible',
      'service unavailable',
      'error interno',
      'internal server error',
      'error 500',
      'error 503',
      'mantenimiento',
    ];
    for (const indicator of errorIndicators) {
      if (bodyText.includes(indicator)) {
        throw new Error(`Portal returned transient error: "${indicator}" — will retry`);
      }
    }
  }

  /**
   * Check if the portal redirected to an unexpected URL.
   * If the current URL doesn't start with the expected base URL, abort.
   */
  protected checkRedirect(page: Page, expectedBaseUrl?: string): void {
    const currentUrl = page.url();
    const base = expectedBaseUrl ?? this.config.baseUrl;
    if (base && !currentUrl.startsWith(base) && !currentUrl.startsWith('about:')) {
      logger.error(`BaseBrowserConnector(${this.config.connectorSlug}): unexpected redirect to ${currentUrl} (expected ${base})`);
      throw new Error(`Portal redirected to unexpected URL: ${currentUrl}`);
    }
  }

  async healthCheck(): Promise<boolean> {
      const start = Date.now();
      await this.rateLimiter.acquire();

      let acquired: AcquiredContext | null = null;
      try {
        acquired = await this.browserPool.acquireContext();

        // Simple health check: verify Chromium can launch and make a basic navigation.
        // We use a short timeout and don't require the portal to fully load
        // (gov portals have bot protection that can take 60s+ from some regions).
        acquired.page.setDefaultNavigationTimeout(30_000);

        logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): healthCheck — navigating to ${this.config.baseUrl}`);
        const response = await acquired.page.goto(this.config.baseUrl, { waitUntil: 'commit' });

        // 'commit' fires as soon as the server responds with headers.
        // This is enough to verify: Chromium works + network reaches the portal.
        const status = response?.status() ?? 0;
        const ok = status > 0 && status < 500;

        const elapsed = Date.now() - start;
        logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): healthCheck ${ok ? 'OK' : 'FAIL'} (HTTP ${status}) in ${elapsed}ms`);
        return ok;
      } catch (err: unknown) {
        const elapsed = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`BaseBrowserConnector(${this.config.connectorSlug}): healthCheck failed after ${elapsed}ms ${msg}`);
        if (err instanceof CircuitBreakerError) throw err;
        return false;
      } finally {
        if (acquired) await acquired.release();
      }
    }

  async getAvailability(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<TimeSlot[]> {
    const start = Date.now();
    await this.rateLimiter.acquire();

    let acquired: AcquiredContext | null = null;
    try {
      acquired = await this.browserPool.acquireContext();
      acquired.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

      logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): getAvailability — starting navigation`);

      const slots = await this.navigateAvailability(acquired.page, procedureId, fromDate, toDate);

      await this.checkAnomalies(acquired.page, 'getAvailability');

      const elapsed = Date.now() - start;
      logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): getAvailability completed in ${elapsed}ms — ${slots.length} slot(s) found`);
      return slots;
    } catch (err) {
      const elapsed = Date.now() - start;
      logger.error(`BaseBrowserConnector(${this.config.connectorSlug}): getAvailability failed after ${elapsed}ms`, err);
      throw err;
    } finally {
      if (acquired) await acquired.release();
    }
  }

  async book(bookingData: Record<string, unknown>): Promise<BookingResult> {
    const start = Date.now();
    await this.rateLimiter.acquire();

    let acquired: AcquiredContext | null = null;
    try {
      acquired = await this.browserPool.acquireContext();
      acquired.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

      logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): book — starting navigation`);

      const result = await this.navigateBooking(acquired.page, bookingData);

      await this.checkAnomalies(acquired.page, 'book');

      const elapsed = Date.now() - start;
      logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): book completed in ${elapsed}ms — success=${result.success}`);
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      logger.error(`BaseBrowserConnector(${this.config.connectorSlug}): book failed after ${elapsed}ms`, err);
      throw err;
    } finally {
      if (acquired) await acquired.release();
    }
  }

  async cancel(confirmationCode: string): Promise<boolean> {
    const start = Date.now();
    await this.rateLimiter.acquire();

    let acquired: AcquiredContext | null = null;
    try {
      acquired = await this.browserPool.acquireContext();
      acquired.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

      logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): cancel — starting navigation`);

      const success = await this.navigateCancellation(acquired.page, confirmationCode);

      await this.checkAnomalies(acquired.page, 'cancel');

      const elapsed = Date.now() - start;
      logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): cancel completed in ${elapsed}ms — success=${success}`);
      return success;
    } catch (err) {
      const elapsed = Date.now() - start;
      logger.error(`BaseBrowserConnector(${this.config.connectorSlug}): cancel failed after ${elapsed}ms`, err);
      throw err;
    } finally {
      if (acquired) await acquired.release();
    }
  }

  // ── Anomaly detection helper ─────────────────────────────────────────────

  private async checkAnomalies(page: Page, operation: string): Promise<void> {
    const captcha = await this.detectCaptcha(page);
    if (captcha) {
      throw new CircuitBreakerError(
        `CAPTCHA detected during ${operation} on ${this.config.connectorSlug}`,
        'CAPTCHA_DETECTED',
      );
    }

    const structureValid = await this.validateStructure(page);
    if (!structureValid) {
      throw new CircuitBreakerError(
        `Portal structure changed during ${operation} on ${this.config.connectorSlug}`,
        'STRUCTURE_CHANGED',
      );
    }
  }

  // ── Abstract methods — subclasses must implement ─────────────────────────

  /** Navigate the portal to fetch available time slots. */
  protected abstract navigateAvailability(
    page: Page,
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<TimeSlot[]>;

  /** Navigate the portal to complete a booking. */
  protected abstract navigateBooking(
    page: Page,
    bookingData: Record<string, unknown>,
  ): Promise<BookingResult>;

  /** Navigate the portal to cancel an existing appointment. */
  protected abstract navigateCancellation(
    page: Page,
    confirmationCode: string,
  ): Promise<boolean>;

  /** Detect CAPTCHA presence on the current page. Returns null if none found. */
  protected abstract detectCaptcha(page: Page): Promise<CaptchaDetection | null>;

  /** Validate that the portal page has the expected structure. */
  protected abstract validateStructure(page: Page): Promise<boolean>;

  // ── Utility methods (protected, reusable by subclasses) ──────────────────

  /** Wait for a CSS selector to appear on the page. */
  protected async waitForSelector(
    page: Page,
    selector: string,
    timeout?: number,
  ): Promise<void> {
    await page.waitForSelector(selector, {
      timeout: timeout ?? this.config.navigationTimeoutMs,
    });
  }

  /** Click on a field and fill it with the given value. */
  protected async fillField(
    page: Page,
    selector: string,
    value: string,
  ): Promise<void> {
    await page.click(selector);
    await page.fill(selector, value);
  }

  /** Select a dropdown option by value or visible text. */
  protected async selectDropdown(
    page: Page,
    selector: string,
    value: string,
  ): Promise<void> {
    // Try selecting by value first, fall back to label
    const result = await page.selectOption(selector, { value });
    if (!result.length) {
      await page.selectOption(selector, { label: value });
    }
  }

  /** Click a button and wait for navigation to settle. */
  protected async clickButton(
    page: Page,
    selector: string,
  ): Promise<void> {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {
        // Some clicks don't trigger navigation — that's fine
      }),
      page.click(selector),
    ]);
  }

  /** Extract text content from an element. */
  protected async extractText(
    page: Page,
    selector: string,
  ): Promise<string> {
    const element = await page.$(selector);
    if (!element) return '';
    return (await element.textContent()) ?? '';
  }

  /** Capture a screenshot and save it to the screenshots directory. */
  protected async captureScreenshot(
    page: Page,
    name: string,
  ): Promise<string> {
    const dir = SCREENSHOT_DIR;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.config.connectorSlug}_${timestamp}_${name}.png`;
    const filePath = path.join(dir, filename);

    await page.screenshot({ path: filePath, fullPage: true });
    logger.info(`BaseBrowserConnector(${this.config.connectorSlug}): screenshot saved to ${filePath}`);
    return filePath;
  }
}
