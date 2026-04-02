import type { Page } from 'playwright-core';
import type { CaptchaDetection } from './portal-config';
import { CircuitBreakerError } from '../adapters/base-real.connector';
import { logger } from '../../../lib/logger';

export class CaptchaSolver {
  private readonly provider: string | undefined;
  private readonly apiKey: string | undefined;

  constructor() {
    this.provider = process.env.CAPTCHA_SOLVER_PROVIDER;
    this.apiKey = process.env.CAPTCHA_SOLVER_API_KEY;
  }

  isConfigured(): boolean {
    return !!(this.provider && this.apiKey);
  }

  async detect(page: Page): Promise<CaptchaDetection | null> {
    const html = await page.content();
    const url = page.url();

    if (html.includes('g-recaptcha') || html.includes('recaptcha/api.js')) {
      const siteKey = await page.$eval('[data-sitekey]', el => el.getAttribute('data-sitekey')).catch(() => null);
      return { type: 'recaptcha_v3', siteKey: siteKey ?? undefined, pageUrl: url };
    }

    if (html.includes('class="captcha"') || html.includes('img-thumbnail')) {
      return { type: 'image', pageUrl: url };
    }

    return null;
  }

  async solve(page: Page, detection: CaptchaDetection): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('CaptchaSolver: not configured, cannot solve CAPTCHA');
      throw new CircuitBreakerError('CAPTCHA detected but solver not configured', 'CAPTCHA_DETECTED');
    }

    logger.info(`CaptchaSolver: attempting to solve ${detection.type} CAPTCHA`);

    // TODO: Integrate with actual anti-captcha service (2Captcha / Anti-Captcha)
    // For now, throw CircuitBreakerError since we can't solve it
    throw new CircuitBreakerError(
      `CAPTCHA ${detection.type} detected — anti-captcha integration pending`,
      'CAPTCHA_DETECTED',
    );
  }

  async injectToken(page: Page, token: string): Promise<void> {
    await page.evaluate((t) => {
      const el = document.getElementById('g-recaptcha-response');
      if (el) (el as HTMLTextAreaElement).value = t;
    }, token);
  }
}
