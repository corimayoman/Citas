/**
 * RegistroCivilConnector — real connector for the Registro Civil portal
 * (https://sede.mjusticia.gob.es).
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
  'sede.mjusticia',
  'mjusticia.gob.es',
  'registro civil',
] as const;

export class RegistroCivilConnector extends BaseRealConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'registro-civil-connector-001',
    name: 'Registro Civil — Ministerio de Justicia',
    organizationSlug: 'registro-civil',
    country: 'ES',
    integrationType: 'AUTHORIZED_INTEGRATION',
    canCheckAvailability: true,
    canBook: true,
    canCancel: true,
    canReschedule: false,
    complianceLevel: 'HIGH',
    legalBasis: 'Integración autorizada con el portal del Registro Civil',
    termsOfServiceUrl: 'https://sede.mjusticia.gob.es/condiciones',
  };

  constructor() {
    super({
      connectorSlug: 'registro-civil',
      baseUrl: 'https://sede.mjusticia.gob.es',
      rateLimit: 10,
    });
  }

  protected getHealthEndpoint(): string {
    return '/es/tramites/cita-previa-registro-civil';
  }

  protected async fetchAvailabilityPage(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<unknown> {
    // TODO: Implement actual Registro Civil portal interaction
    logger.info(
      `RegistroCivilConnector: fetching availability for procedure=${procedureId} from=${fromDate} to=${toDate}`,
    );
    const response = await this.httpClient.get('/citaprevia', {
      params: { p: procedureId },
    });
    return response.data as string;
  }

  protected parseAvailability(rawResponse: unknown): TimeSlot[] {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for Registro Civil portal
    logger.info('RegistroCivilConnector: parsing availability from HTML response');
    if (html.length === 0) {
      logger.warn('RegistroCivilConnector: empty response when parsing availability');
    }
    return [];
  }

  protected async submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown> {
    // TODO: Implement actual Registro Civil booking form submission
    logger.info('RegistroCivilConnector: submitting booking form', {
      procedure: data.procedureSlug,
      date: data.selectedDate,
      time: data.selectedTime,
    });
    const response = await this.httpClient.post('/citaprevia/confirmar', {});
    return response.data as string;
  }

  protected parseBookingResult(rawResponse: unknown): BookingResult {
    const html = String(rawResponse);
    // TODO: Implement real HTML parsing for Registro Civil booking confirmation
    logger.info('RegistroCivilConnector: parsing booking result from HTML response');
    if (html.includes('error') || html.includes('no disponible')) {
      return {
        success: false,
        errorMessage: 'La reserva no pudo completarse en el portal del Registro Civil',
      };
    }
    return {
      success: false,
      errorMessage:
        'RegistroCivilConnector: booking result parsing not yet implemented — requires portal-specific HTML selectors',
    };
  }

  protected async submitCancellation(confirmationCode: string): Promise<boolean> {
    // TODO: Implement actual Registro Civil cancellation flow
    logger.info(`RegistroCivilConnector: submitting cancellation for code=${confirmationCode}`);
    try {
      const response = await this.httpClient.post('/citaprevia/anular', {});
      const html = String(response.data);
      return html.includes('anulada') || html.includes('cancelada');
    } catch (err) {
      logger.error(`RegistroCivilConnector: cancellation failed for code=${confirmationCode}`, err);
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
