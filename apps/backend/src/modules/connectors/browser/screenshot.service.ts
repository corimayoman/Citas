import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'playwright-core';
import { logger } from '../../../lib/logger';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? '/tmp/screenshots';
const RETENTION_DAYS = parseInt(process.env.SCREENSHOT_RETENTION_DAYS ?? '7', 10);

export class ScreenshotService {
  async capture(page: Page, connectorSlug: string, errorType: string): Promise<string> {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${connectorSlug}_${timestamp}_${errorType}.png`;
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: true });
    logger.info(`Screenshot saved: ${filePath}`);
    return filePath;
  }

  async cleanup(): Promise<number> {
    if (!fs.existsSync(SCREENSHOT_DIR)) return 0;
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(SCREENSHOT_DIR);
    let deleted = 0;
    for (const file of files) {
      const filePath = path.join(SCREENSHOT_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    if (deleted > 0) logger.info(`ScreenshotService: cleaned up ${deleted} expired screenshot(s)`);
    return deleted;
  }
}
