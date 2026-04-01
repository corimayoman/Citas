/**
 * SepeConnector — real connector for the SEPE portal
 * (https://sede.sepe.gob.es).
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
  'sede.sepe',
  'sepe.gob.es',
  'citaprevia',
] as const;

export class SepeConnector extends BaseRealConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'sepe-connector-001',
    name: 'SEPE — Servicio Público de Empleo Estatal',
    organizationSlug: 'sepe',
    country: 'ES',
    integrationType: 'AUTHORIZED_INTEGRATION',
    canCheckAvailability: true,
    canBook: true,
    canCancel: true,
    canReschedule: false,
    complianceLevel: 'MEDIUM',
    legalBasis: 'Integración autorizada con el portal del SEPE',
    termsOfServiceUrl: 'https://sede.sepe.gob.es/condiciones',
  };

  constructor() {
    super({
      connectorSlug: 'sepe',
      baseUrl: 'https://sede.sepe.gob.es',
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
    // TODO: Implement actual SEPE portal interaction
    logger.info(
      `SepeConnector: fetching availability for procedure=${procedureId} from=${fromDate} to=${toDate}`,
    );
    const response = await this.httpClient.get('/citaprevia', {
      params: { p: procedureId },
    });
    return response.data as string;
  }

  protected parseAvailability(rawResponse: unknown): TimeSlot[] {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for SEPE portal
    logger.info('SepeConnector: parsing availability from HTML response');
    if (html.length === 0) {
      logger.warn('SepeConnector: empty response when parsing availability');
    }
    return [];
  }

  protected async submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown> {
    // TODO: Implement actual SEPE booking form submission
    logger.info('SepeConnector: submitting booking form', {
      procedure: data.procedureSlug,
      date: data.selectedDate,
      time: data.selectedTime,
    });
    const response = await this.httpClient.post('/citaprevia/confirmar', {});
    return response.data as string;
  }

  protected parseBookingResult(rawResponse: unknown): BookingResult {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for SEPE booking confirmation
    logger.info('SepeConnector: parsing booking result from HTML response');
    if (html.includes('error') || html.includes('no disponible')) {
      return {
        success: false,
        errorMessage: 'La reserva no pudo completarse en el portal del SEPE',
      };
    }
    return {
      success: false,
      errorMessage:
        'SepeConnector: booking result parsing not yet implemented — requires portal-specific HTML selectors',
    };
  }

  protected async submitCancellation(confirmationCode: string): Promise<boolean> {
    // TODO: Implement actual SEPE cancellation flow
    logger.info(`SepeConnector: submitting cancellation for code=${confirmationCode}`);
    try {
      const response = await this.httpClient.post('/citaprevia/anular', {});
      const html = String(response.data);
      return html.includes('anulada') || html.includes('cancelada');
    } catch (err) {
      logger.error(`SepeConnector: cancellation failed for code=${confirmationCode}`, err);
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
