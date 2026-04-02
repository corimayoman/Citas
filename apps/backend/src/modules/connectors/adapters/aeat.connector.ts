/**
 * AeatConnector — real connector for the AEAT portal
 * (https://sede.agenciatributaria.gob.es).
 *
 * Extends BaseRealConnector with portal-specific logic.
 * NOTE: Methods contain TODO placeholders where actual portal-specific
 * logic needs to be filled in after reverse-engineering the live portal.
 */

import { ConnectorMetadata, TimeSlot, BookingResult } from '../connector.interface';
import { BaseRealConnector } from './base-real.connector';
import { logger } from '../../../lib/logger';

const CAPTCHA_INDICATORS = [
  'g-recaptcha',
  'recaptcha/api.js',
  'hcaptcha.com',
  'cf-turnstile',
  'captcha',
] as const;

const EXPECTED_STRUCTURE_MARKERS = [
  'agenciatributaria',
  'sede.agenciatributaria',
  'citaprevia',
] as const;

export class AeatConnector extends BaseRealConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'aeat-connector-001',
    name: 'AEAT — Agencia Estatal de Administración Tributaria',
    organizationSlug: 'aeat',
    country: 'ES',
    integrationType: 'AUTHORIZED_INTEGRATION',
    canCheckAvailability: true,
    canBook: true,
    canCancel: true,
    canReschedule: false,
    complianceLevel: 'HIGH',
    legalBasis: 'Integración autorizada con el portal de la AEAT',
    termsOfServiceUrl: 'https://sede.agenciatributaria.gob.es/condiciones',
  };

  constructor() {
    super({
      connectorSlug: 'aeat',
      baseUrl: 'https://sede.agenciatributaria.gob.es',
      rateLimit: 10,
    });
  }

  protected getHealthEndpoint(): string {
    return '/';
  }

  protected async fetchAvailabilityPage(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<unknown> {
    // TODO: Implement actual AEAT portal interaction
    logger.info(
      `AeatConnector: fetching availability for procedure=${procedureId} from=${fromDate} to=${toDate}`,
    );
    const response = await this.httpClient.get('/Sede/citaprevia', {
      params: { p: procedureId },
    });
    return response.data as string;
  }

  protected parseAvailability(rawResponse: unknown): TimeSlot[] {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for AEAT portal
    logger.info('AeatConnector: parsing availability from HTML response');
    if (html.length === 0) {
      logger.warn('AeatConnector: empty response when parsing availability');
    }
    return [];
  }

  protected async submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown> {
    // TODO: Implement actual AEAT booking form submission
    logger.info('AeatConnector: submitting booking form', {
      procedure: data.procedureSlug,
      date: data.selectedDate,
      time: data.selectedTime,
    });
    const response = await this.httpClient.post('/Sede/citaprevia/confirmar', {});
    return response.data as string;
  }

  protected parseBookingResult(rawResponse: unknown): BookingResult {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for AEAT booking confirmation
    logger.info('AeatConnector: parsing booking result from HTML response');
    if (html.includes('error') || html.includes('no disponible')) {
      return {
        success: false,
        errorMessage: 'La reserva no pudo completarse en el portal de la AEAT',
      };
    }
    return {
      success: false,
      errorMessage:
        'AeatConnector: booking result parsing not yet implemented — requires portal-specific HTML selectors',
    };
  }

  protected async submitCancellation(confirmationCode: string): Promise<boolean> {
    // TODO: Implement actual AEAT cancellation flow
    logger.info(`AeatConnector: submitting cancellation for code=${confirmationCode}`);
    try {
      const response = await this.httpClient.post('/Sede/citaprevia/anular', {});
      const html = String(response.data);
      return html.includes('anulada') || html.includes('cancelada');
    } catch (err) {
      logger.error(`AeatConnector: cancellation failed for code=${confirmationCode}`, err);
      return false;
    }
  }

  protected hasCaptcha(response: unknown): boolean {
    const html = String(response).toLowerCase();
    return CAPTCHA_INDICATORS.some((indicator) => html.includes(indicator));
  }

  protected hasExpectedStructure(response: unknown): boolean {
    const html = String(response).toLowerCase();
    return EXPECTED_STRUCTURE_MARKERS.some((marker) => html.includes(marker));
  }
}
