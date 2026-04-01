/**
 * ExtranjeriaConnector — real connector for the Extranjería portal
 * (https://icp.administracionelectronica.gob.es/icpplus).
 *
 * Extends BaseRealConnector with portal-specific logic for:
 *   • Fetching the availability page (JSF-based form)
 *   • Parsing HTML to extract available time slots
 *   • Submitting the booking form
 *   • Parsing booking confirmation
 *   • Cancellation
 *   • CAPTCHA / structure-change detection
 *
 * NOTE: Many methods contain TODO placeholders where actual portal-specific
 * logic needs to be filled in after reverse-engineering the live portal.
 */

import { ConnectorMetadata, TimeSlot, BookingResult } from '../connector.interface';
import { BaseRealConnector } from './base-real.connector';
import { logger } from '../../../lib/logger';

// ── Constants ────────────────────────────────────────────────────────────────

/** Known CAPTCHA indicators found in portal HTML responses */
const CAPTCHA_INDICATORS = [
  'g-recaptcha',
  'recaptcha/api.js',
  'hcaptcha.com',
  'cf-turnstile',
  'captcha',
] as const;

/** CSS / HTML markers that confirm the portal structure is as expected */
const EXPECTED_STRUCTURE_MARKERS = [
  'icpplus',
  'citaprevia',
  'sede.administracionespublicas',
] as const;

// ── ExtranjeriaConnector ─────────────────────────────────────────────────────

export class ExtranjeriaConnector extends BaseRealConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'extranjeria-connector-001',
    name: 'Extranjería — Oficina de Extranjería',
    organizationSlug: 'extranjeria',
    country: 'ES',
    integrationType: 'AUTHORIZED_INTEGRATION',
    canCheckAvailability: true,
    canBook: true,
    canCancel: true,
    canReschedule: false,
    complianceLevel: 'CRITICAL',
    legalBasis: 'Integración autorizada con el portal de Extranjería',
    termsOfServiceUrl: 'https://icp.administracionelectronica.gob.es/icpplus/condiciones',
  };

  constructor() {
    super({
      connectorSlug: 'extranjeria',
      baseUrl: 'https://icp.administracionelectronica.gob.es',
      rateLimit: 10, // 10 requests/min
    });
  }

  // ── Abstract method implementations ──────────────────────────────────────

  protected getHealthEndpoint(): string {
    return '/icpplus/citar';
  }

  protected async fetchAvailabilityPage(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<unknown> {
    // TODO: Implement actual portal interaction after reverse-engineering
    // The Extranjería portal uses a JSF-based multi-step form:
    //   1. GET /icpplus/citar → select province
    //   2. POST with province + procedure → get available offices
    //   3. POST with office selection → get available dates
    //   4. POST with date selection → get available time slots
    //
    // Each step requires carrying the JSF ViewState token forward.

    logger.info(
      `ExtranjeriaConnector: fetching availability for procedure=${procedureId} ` +
      `from=${fromDate} to=${toDate}`,
    );

    const response = await this.httpClient.get('/icpplus/citar', {
      params: {
        p: procedureId,
        // TODO: Add province, office, and date range params
        // once the actual form field names are known
      },
    });

    return response.data as string;
  }

  protected parseAvailability(rawResponse: unknown): TimeSlot[] {
    const html = String(rawResponse);

    // TODO: Implement real HTML parsing with cheerio or similar
    // The portal renders available slots in an HTML table or select element.
    // Expected structure (to be confirmed):
    //   <select id="idCitaSel">
    //     <option value="slot-id">DD/MM/YYYY HH:mm</option>
    //     ...
    //   </select>

    logger.info('ExtranjeriaConnector: parsing availability from HTML response');

    const slots: TimeSlot[] = [];

    // TODO: Replace with actual HTML parsing logic
    // Example pattern (placeholder):
    //   const $ = cheerio.load(html);
    //   $('#idCitaSel option').each((_, el) => {
    //     const text = $(el).text().trim();
    //     const value = $(el).attr('value');
    //     if (!text || !value) return;
    //     const [datePart, timePart] = text.split(' ');
    //     const [day, month, year] = datePart.split('/');
    //     slots.push({
    //       date: `${year}-${month}-${day}`,
    //       time: timePart,
    //       available: true,
    //       slotId: value,
    //     });
    //   });

    if (html.length === 0) {
      logger.warn('ExtranjeriaConnector: empty response when parsing availability');
    }

    return slots;
  }

  protected async submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown> {
    // TODO: Implement actual form submission after reverse-engineering
    // The booking flow typically requires:
    //   1. Select the chosen slot (POST with slot ID + ViewState)
    //   2. Fill in applicant data (name, document, nationality, email, phone)
    //   3. Confirm the booking (final POST)
    //
    // The email field MUST use the platform email, not the user's email.

    logger.info('ExtranjeriaConnector: submitting booking form', {
      procedure: data.procedureSlug,
      date: data.selectedDate,
      time: data.selectedTime,
    });

    const response = await this.httpClient.post('/icpplus/acInfo', {
      // TODO: Map data fields to actual portal form field names
      // Example mapping (placeholder):
      //   txtIdCitado: data.documentNumber,
      //   txtDesCitado: `${data.applicantLastName}, ${data.applicantFirstName}`,
      //   txtFecha: data.selectedDate,
      //   txtHora: data.selectedTime,
      //   txtMail: data.email,  // Platform email
      //   txtTelefono: data.phone,
    });

    return response.data as string;
  }

  protected parseBookingResult(rawResponse: unknown): BookingResult {
    const html = String(rawResponse);

    // TODO: Implement real HTML parsing for booking confirmation
    // The portal typically shows a confirmation page with:
    //   - Confirmation code (e.g., "Código de confirmación: XXXX-XXXX")
    //   - Appointment date and time
    //   - Office address
    //   - Instructions for the appointment

    logger.info('ExtranjeriaConnector: parsing booking result from HTML response');

    // TODO: Replace with actual parsing logic
    // Example pattern (placeholder):
    //   const $ = cheerio.load(html);
    //   const confirmationCode = $('#txtCodigoJustificante').val();
    //   const dateText = $('#txtFechaCita').text();
    //   const timeText = $('#txtHoraCita').text();
    //   const location = $('#txtDireccion').text();

    // Check for error indicators in the response
    if (html.includes('error') || html.includes('no disponible')) {
      return {
        success: false,
        errorMessage: 'La reserva no pudo completarse en el portal de Extranjería',
      };
    }

    // TODO: Extract real values from parsed HTML
    return {
      success: false,
      errorMessage:
        'ExtranjeriaConnector: booking result parsing not yet implemented — ' +
        'requires portal-specific HTML selectors',
    };
  }

  protected async submitCancellation(
    confirmationCode: string,
  ): Promise<boolean> {
    // TODO: Implement actual cancellation flow after reverse-engineering
    // The cancellation flow typically requires:
    //   1. Navigate to the cancellation page
    //   2. Enter the confirmation code and document number
    //   3. Confirm the cancellation

    logger.info(
      `ExtranjeriaConnector: submitting cancellation for code=${confirmationCode}`,
    );

    try {
      const response = await this.httpClient.post('/icpplus/anularCita', {
        // TODO: Map to actual portal form field names
        //   txtCodigoJustificante: confirmationCode,
      });

      const html = String(response.data);

      // TODO: Parse the cancellation response to confirm success
      // Look for success indicators like "cita anulada" or similar
      return html.includes('anulada') || html.includes('cancelada');
    } catch (err) {
      logger.error(
        `ExtranjeriaConnector: cancellation failed for code=${confirmationCode}`,
        err,
      );
      return false;
    }
  }

  protected hasCaptcha(response: unknown): boolean {
    const html = String(response).toLowerCase();
    return CAPTCHA_INDICATORS.some((indicator) => html.includes(indicator));
  }

  protected hasExpectedStructure(response: unknown): boolean {
    const html = String(response).toLowerCase();
    // At least one of the expected markers must be present to confirm
    // we are still looking at the Extranjería portal
    return EXPECTED_STRUCTURE_MARKERS.some((marker) => html.includes(marker));
  }
}
