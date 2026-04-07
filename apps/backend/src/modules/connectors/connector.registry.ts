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

class ConnectorRegistry {
  private connectors = new Map<string, IConnector>();

  constructor() {
    // Register built-in connectors
    this.register(new MockConnector());

    // Register all HTTP-based real connectors
    const realConnectors: [string, BaseRealConnector][] = [
      ['ExtranjeriaConnector', new ExtranjeriaConnector()],
      ['DgtConnector', new DgtConnector()],
      ['AeatConnector', new AeatConnector()],
      ['SepeConnector', new SepeConnector()],
      ['RegistroCivilConnector', new RegistroCivilConnector()],
    ];

    for (const [name, connector] of realConnectors) {
      this.register(connector);
    }

    // Deferred health checks — run after 15s to let the server start first
    setTimeout(() => {
      for (const [connName, connector] of realConnectors) {
        connector.healthCheck().then((ok) => {
          logger.info(`${connName} healthCheck: ${ok ? 'OK' : 'FAIL'}`);
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`${connName} healthCheck error (non-blocking): ${msg}`);
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

  /** Orderly shutdown — placeholder for future cleanup needs. */
  async shutdown(): Promise<void> {
    logger.info('ConnectorRegistry: shutdown complete');
  }
}

export const connectorRegistry = new ConnectorRegistry();
