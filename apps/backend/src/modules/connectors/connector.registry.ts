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

    // Register real connectors with non-blocking healthChecks
    const realConnectors: [string, BaseRealConnector][] = [
      ['ExtranjeriaConnector', new ExtranjeriaConnector()],
      ['DgtConnector', new DgtConnector()],
      ['AeatConnector', new AeatConnector()],
      ['SepeConnector', new SepeConnector()],
      ['RegistroCivilConnector', new RegistroCivilConnector()],
    ];

    for (const [name, connector] of realConnectors) {
      this.register(connector);
      connector.healthCheck().then((ok) => {
        logger.info(`${name} healthCheck: ${ok ? 'OK' : 'FAIL'}`);
      }).catch((err) => {
        logger.warn(`${name} healthCheck error (non-blocking)`, err);
      });
    }
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
}

export const connectorRegistry = new ConnectorRegistry();
