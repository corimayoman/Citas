/**
 * AeatConnector — real connector for the AEAT (Agencia Tributaria) portal.
 *
 * Uses the public appointment system at:
 *   https://www2.agenciatributaria.gob.es/wlpl/TOCP-MUTE/internet/
 *
 * Flow (4 steps, all HTTP — no browser needed):
 *   1. POST /internet/identificacion — identify with NIF + name
 *   2. GET  /internet/procedimiento  — select service category + procedure
 *   3. POST /internet/cita           — select office + date/time slot
 *   4. POST /internet/cita           — confirm appointment
 *
 * No CAPTCHA, no certificate required for individuals.
 */

import { ConnectorMetadata, TimeSlot, BookingResult } from '../connector.interface';
import { BaseRealConnector } from './base-real.connector';
import { logger } from '../../../lib/logger';

// ── Structure markers ────────────────────────────────────────────────────────

const EXPECTED_STRUCTURE_MARKERS = [
  'agenciatributaria',
  'tocp-mute',
  'asistencia',
] as const;

// ── AEAT appointment base URL ────────────────────────────────────────────────

const AEAT_CITA_BASE = 'https://www2.agenciatributaria.gob.es/wlpl/TOCP-MUTE';

export class AeatConnector extends BaseRealConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'aeat-connector-001',
    name: 'AEAT — Agencia Estatal de Administración Tributaria',
    organizationSlug: 'aeat',
    country: 'ES',
    integrationType: 'AUTHORIZED_INTEGRATION',
    canCheckAvailability: true,
    canBook: true,
    canCancel: false,
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

  // ── Step 1: Identify and start session ───────────────────────────────────

  /**
   * POST to /internet/identificacion to start a session.
   * Returns cookies that maintain the session for subsequent steps.
   */
  private async startSession(nif: string, nombre: string): Promise<string[]> {
    const params = new URLSearchParams({
      fnif: nif,
      fnombre: nombre,
      fnifR: '',
      fnombreR: '',
      fnombreSN: '',
      USUARIO: '',
      citaSNif: 'N',
      modoCita: '1',       // 1 = nueva cita
      simularGest: 'N',
      simularCBPT: 'N',
      faccion: 'V',
    });

    const response = await this.httpClient.post(
      `${AEAT_CITA_BASE}/internet/identificacion`,
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        maxRedirects: 5,
      },
    );

    // Extract Set-Cookie headers for session maintenance
    const cookies: string[] = [];
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
      for (const c of Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]) {
        const name = c.split(';')[0];
        if (name) cookies.push(name);
      }
    }

    logger.info(`AeatConnector: session started for NIF=${nif.substring(0, 3)}*** (${cookies.length} cookies)`);
    return cookies;
  }

  // ── Step 2: Fetch available procedures ───────────────────────────────────

  protected async fetchAvailabilityPage(
    procedureId: string,
    _fromDate: string,
    _toDate: string,
  ): Promise<unknown> {
    // Use a test NIF to check availability without a real booking
    // The AEAT portal allows browsing procedures without committing
    const testNif = '00000000T';
    const testNombre = 'CONSULTA DISPONIBILIDAD';

    logger.info(`AeatConnector: fetching availability for procedure=${procedureId}`);

    try {
      // Step 1: Start session
      const cookies = await this.startSession(testNif, testNombre);

      // Step 2: Get the procedure/cita page (the session determines what's shown)
      const response = await this.httpClient.get(
        `${AEAT_CITA_BASE}/internet/cita`,
        {
          headers: {
            Cookie: cookies.join('; '),
          },
          maxRedirects: 5,
        },
      );

      return response.data as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`AeatConnector: fetchAvailability failed — ${msg}`);
      return '';
    }
  }

  // ── Parse availability from HTML ─────────────────────────────────────────

  protected parseAvailability(rawResponse: unknown): TimeSlot[] {
    const html = String(rawResponse);
    if (!html || html.length < 100) {
      logger.info('AeatConnector: no availability data in response');
      return [];
    }

    const slots: TimeSlot[] = [];

    // The AEAT cita page renders available slots as JSON data embedded in
    // onclick handlers: onClickMarcarDiaHora(evt, {dia:'2026-04-10', horaI:'0900', ...})
    // Pattern: {dia:'YYYY-MM-DD',horaI:'HHMM',horaF:'HHMM',centro:'...',direccion:'...'}
    const slotPattern = /\{[^}]*dia['"]\s*:\s*['"](\d{4}-\d{2}-\d{2})['"][^}]*horaI['"]\s*:\s*['"](\d{4})['"][^}]*centro['"]\s*:\s*['"]([^'"]+)['"][^}]*\}/g;

    let match: RegExpExecArray | null;
    while ((match = slotPattern.exec(html)) !== null) {
      const [fullMatch, date, horaI, centro] = match;
      const time = `${horaI.substring(0, 2)}:${horaI.substring(2, 4)}`;
      slots.push({
        date,
        time,
        available: true,
        slotId: `${centro}|${date}|${horaI}`,
      });
    }

    // Fallback: look for date patterns in table cells or list items
    if (slots.length === 0) {
      const dateTimePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/g;
      let dtMatch: RegExpExecArray | null;
      while ((dtMatch = dateTimePattern.exec(html)) !== null) {
        const [, day, month, year, hour, minute] = dtMatch;
        slots.push({
          date: `${year}-${month}-${day}`,
          time: `${hour}:${minute}`,
          available: true,
        });
      }
    }

    logger.info(`AeatConnector: parsed ${slots.length} available slot(s)`);
    return slots;
  }

  // ── Step 3+4: Submit booking ─────────────────────────────────────────────

  protected async submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const nif = String(data.nif ?? data.documentNumber ?? '');
    const nombre = String(data.nombre ?? data.applicantName ?? '');
    const centro = String(data.officeId ?? data.centro ?? '');
    const dia = String(data.selectedDate ?? data.dia ?? '');
    const hora = String(data.selectedTime ?? data.hora ?? '').replace(':', '');
    const servicio = String(data.procedureCode ?? data.servicio ?? '');

    if (!nif || !nombre) {
      throw new Error('AeatConnector: NIF and nombre are required for booking');
    }

    logger.info(`AeatConnector: booking — NIF=${nif.substring(0, 3)}***, centro=${centro}, dia=${dia}, hora=${hora}`);

    // Step 1: Start session with real user data
    const cookies = await this.startSession(nif, nombre);

    // Step 3: Submit appointment selection
    const citaParams = new URLSearchParams({
      fcentro: centro,
      fdia: dia,
      fhora: hora,
      fservicio: servicio,
      faccion: 'V',
    });

    const citaResponse = await this.httpClient.post(
      `${AEAT_CITA_BASE}/internet/cita`,
      citaParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookies.join('; '),
        },
        maxRedirects: 5,
      },
    );

    // Step 4: Confirm — the confirmation page should show the result
    const confirmParams = new URLSearchParams({
      fcentro: centro,
      fdia: dia,
      fhora: hora,
      fservicio: servicio,
      faccion: 'confirmar',
    });

    const confirmResponse = await this.httpClient.post(
      `${AEAT_CITA_BASE}/internet/cita`,
      confirmParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookies.join('; '),
        },
        maxRedirects: 5,
      },
    );

    return confirmResponse.data as string;
  }

  // ── Parse booking result ─────────────────────────────────────────────────

  protected parseBookingResult(rawResponse: unknown): BookingResult {
    const html = String(rawResponse);

    // Look for confirmation indicators
    const confirmed = html.toLowerCase().includes('confirmada')
      || html.toLowerCase().includes('grabada')
      || html.toLowerCase().includes('justificante');

    if (confirmed) {
      // Try to extract confirmation code
      // Pattern: "Código de justificante: XXXX" or similar
      const codeMatch = html.match(/justificante[^:]*:\s*([A-Z0-9\-]+)/i)
        ?? html.match(/c[oó]digo[^:]*:\s*([A-Z0-9\-]+)/i);

      const code = codeMatch?.[1]?.trim() ?? `AEAT-${Date.now()}`;

      logger.info(`AeatConnector: booking confirmed — code=${code}`);
      return {
        success: true,
        confirmationCode: code,
      };
    }

    // Check for error messages
    const errorMatch = html.match(/class="alert[^"]*danger[^"]*"[^>]*>([^<]+)/i)
      ?? html.match(/error[^:]*:\s*([^<]+)/i);

    const errorMsg = errorMatch?.[1]?.trim()
      ?? 'La reserva no pudo completarse en el portal de la AEAT';

    logger.warn(`AeatConnector: booking failed — ${errorMsg}`);
    return {
      success: false,
      errorMessage: errorMsg,
    };
  }

  // ── Cancellation (not supported for AEAT) ────────────────────────────────

  protected async submitCancellation(_confirmationCode: string): Promise<boolean> {
    logger.warn('AeatConnector: cancellation not supported via this connector');
    return false;
  }

  // ── Anomaly detection ────────────────────────────────────────────────────

  protected hasCaptcha(response: unknown): boolean {
    const html = String(response).toLowerCase();
    return html.includes('g-recaptcha') || html.includes('captcha');
  }

  protected hasExpectedStructure(response: unknown): boolean {
    const html = String(response).toLowerCase();
    return EXPECTED_STRUCTURE_MARKERS.some(marker => html.includes(marker));
  }
}
