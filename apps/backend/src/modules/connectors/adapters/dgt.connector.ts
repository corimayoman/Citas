/**
 * DgtConnector — real connector for the DGT portal
 * (https://sedeclave.dgt.gob.es).
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
  'sedeclave',
  'dgt.gob.es',
  'citaprevia',
] as const;

export class DgtConnector extends BaseRealConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'dgt-connector-001',
    name: 'DGT — Dirección General de Tráfico',
    organizationSlug: 'dgt',
    country: 'ES',
    integrationType: 'AUTHORIZED_INTEGRATION',
    canCheckAvailability: true,
    canBook: true,
    canCancel: true,
    canReschedule: false,
    complianceLevel: 'HIGH',
    legalBasis: 'Integración autorizada con el portal de la DGT',
    termsOfServiceUrl: 'https://sedeclave.dgt.gob.es/condiciones',
  };

  constructor() {
    super({
      connectorSlug: 'dgt',
      baseUrl: 'https://sedeclave.dgt.gob.es',
      rateLimit: 10,
    });
  }

  protected getHealthEndpoint(): string {
    return '/citaprevia';
  }

  protected async fetchAvailabilityPage(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<unknown> {
    // TODO: Implement actual DGT portal interaction
    logger.info(
      `DgtConnector: fetching availability for procedure=${procedureId} from=${fromDate} to=${toDate}`,
    );
    const response = await this.httpClient.get('/citaprevia', {
      params: { p: procedureId },
    });
    return response.data as string;
  }

  protected parseAvailability(rawResponse: unknown): TimeSlot[] {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for DGT portal
    logger.info('DgtConnector: parsing availability from HTML response');
    if (html.length === 0) {
      logger.warn('DgtConnector: empty response when parsing availability');
    }
    return [];
  }

  protected async submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown> {
    // TODO: Implement actual DGT booking form submission
    logger.info('DgtConnector: submitting booking form', {
      procedure: data.procedureSlug,
      date: data.selectedDate,
      time: data.selectedTime,
    });
    const response = await this.httpClient.post('/citaprevia/confirmar', {});
    return response.data as string;
  }

  protected parseBookingResult(rawResponse: unknown): BookingResult {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for DGT booking confirmation
    logger.info('DgtConnector: parsing booking result from HTML response');
    if (html.includes('error') || html.includes('no disponible')) {
      return {
        success: false,
        errorMessage: 'La reserva no pudo completarse en el portal de la DGT',
      };
    }
    return {
      success: false,
      errorMessage:
        'DgtConnector: booking result parsing not yet implemented — requires portal-specific HTML selectors',
    };
  }

  protected async submitCancellation(confirmationCode: string): Promise<boolean> {
    // TODO: Implement actual DGT cancellation flow
    logger.info(`DgtConnector: submitting cancellation for code=${confirmationCode}`);
    try {
      const response = await this.httpClient.post('/citaprevia/anular', {});
      const html = String(response.data);
      return html.includes('anulada') || html.includes('cancelada');
    } catch (err) {
      logger.error(`DgtConnector: cancellation failed for code=${confirmationCode}`, err);
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
