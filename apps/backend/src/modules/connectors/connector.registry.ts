/**
 * Connector Registry — manages all available connector adapters.
 * New connectors must be registered here after passing compliance review.
 */
import { IConnector } from './connector.interface';
import { MockConnector } from './adapters/mock.connector';
import { BaseRealConnector } from './adapters/base-real.connector';
import { ExtranjeriaConnector } from './adapters/extranjeria.connector';
import { DgtConnector } from './adapters/dgt.connector';
import { AeatConnector } from './adapters/aeat.connector';
import { SepeConnector } from './adapters/sepe.connector';
import { RegistroCivilConnector } from './adapters/registro-civil.connector';
import { logger } from '../../lib/logger';

// Conditional imports for browser-based connector (requires Playwright + Chromium)
import type { BrowserPool } from './browser/browser-pool';
import type { BrowserPoolMetrics } from './browser/browser-pool';

export type { BrowserPoolMetrics };

class ConnectorRegistry {
  private connectors = new Map<string, IConnector>();
  private _browserPool: BrowserPool | null = null;

  constructor() {
    // Register built-in connectors
    this.register(new MockConnector());

    // Try to create browser-based Extranjeria connector.
    // Falls back to HTTP-based if Playwright/Chromium is not available
    // (e.g. in test environments or when Chromium is not installed).
    let extranjeriaBrowser = false;
    try {
      // Dynamic require so the module is only loaded if Playwright is available
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BrowserPool: BrowserPoolClass } = require('./browser/browser-pool') as {
        BrowserPool: new (config?: Record<string, unknown>) => BrowserPool;
      };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ExtranjeriaBrowserConnector } = require('./browser/extranjeria-browser.connector') as {
        ExtranjeriaBrowserConnector: new (pool: BrowserPool) => IConnector;
      };

      this._browserPool = new BrowserPoolClass();
      const browserConnector = new ExtranjeriaBrowserConnector(this._browserPool);
      this.register(browserConnector);
      extranjeriaBrowser = true;

      // Deferred health check — run after 30s to let the server start first
      setTimeout(() => {
        (browserConnector as any).healthCheck?.()
          .then((ok: boolean) => {
            logger.info(`ExtranjeriaBrowserConnector healthCheck: ${ok ? 'OK' : 'FAIL'}`);
          })
          .catch((err: unknown) => {
            logger.warn('ExtranjeriaBrowserConnector healthCheck error (non-blocking)', err);
          });
      }, 30_000);

      logger.info('Extranjeria connector: using Playwright browser-based connector');
    } catch (err) {
      logger.warn(
        'Playwright/Chromium not available — falling back to HTTP-based ExtranjeriaConnector',
        err instanceof Error ? err.message : err,
      );
    }

    // Register real connectors (HTTP-based)
    const realConnectors: [string, BaseRealConnector][] = [
      // Only register HTTP Extranjeria if browser version failed to load
      ...(!extranjeriaBrowser
        ? [['ExtranjeriaConnector', new ExtranjeriaConnector()] as [string, BaseRealConnector]]
        : []),
      ['DgtConnector', new DgtConnector()],
      ['AeatConnector', new AeatConnector()],
      ['SepeConnector', new SepeConnector()],
      ['RegistroCivilConnector', new RegistroCivilConnector()],
    ];

    for (const [name, connector] of realConnectors) {
      this.register(connector);
    }

    // Deferred health checks — run after 15s to let the server start first
    const connectorList = realConnectors;
    setTimeout(() => {
      for (const [connName, connector] of connectorList) {
        connector.healthCheck().then((ok) => {
          logger.info(`${connName} healthCheck: ${ok ? 'OK' : 'FAIL'}`);
        }).catch((err) => {
          logger.warn(`${connName} healthCheck error (non-blocking)`, err);
        });
      }
    }, 15_000);
  }

  register(connector: IConnector): void {
    const { id, integrationType } = connector.metadata;
    if (integrationType === 'MANUAL_ASSISTED') {
      logger.warn(`Connector ${id} registered as MANUAL_ASSISTED — no automated booking`);
    }
    this.connectors.set(id, connector);
    // Also register by slug (organizationSlug) for lookup from DB connector.slug
    if (connector.metadata.organizationSlug) {
      this.connectors.set(connector.metadata.organizationSlug, connector);
    }
    logger.info(`Connector registered: ${id} (${integrationType})`);
  }

  get(id: string): IConnector | undefined {
    return this.connectors.get(id);
  }

  getAll(): IConnector[] {
    return Array.from(this.connectors.values());
  }

  list() {
    return this.getAll().map(c => c.metadata);
  }

  /** Expose the BrowserPool instance (null if Playwright is not available). */
  get browserPool(): BrowserPool | null {
    return this._browserPool;
  }

  /** Get browser pool metrics, or null if pool is not active. */
  getBrowserPoolMetrics(): BrowserPoolMetrics | null {
    return this._browserPool?.getMetrics() ?? null;
  }

  /** Orderly shutdown — closes the browser pool if active. */
  async shutdown(): Promise<void> {
    if (this._browserPool) {
      logger.info('ConnectorRegistry: shutting down BrowserPool…');
      await this._browserPool.shutdown();
      this._browserPool = null;
    }
  }
}

export const connectorRegistry = new ConnectorRegistry();
