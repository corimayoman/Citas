/**
 * Connector Registry — manages all available connector adapters.
 * New connectors must be registered here after passing compliance review.
 */
import { IConnector } from './connector.interface';
import { MockConnector } from './adapters/mock.connector';
import { logger } from '../../lib/logger';

class ConnectorRegistry {
  private connectors = new Map<string, IConnector>();

  constructor() {
    // Register built-in connectors
    this.register(new MockConnector());
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
