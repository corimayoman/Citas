/**
 * ExtranjeriaConnector (Browser) — Playwright-based connector for the
 * Extranjería portal (https://icp.administracionelectronica.gob.es).
 *
 * Extends BaseBrowserConnector to navigate the JSF multi-step forms
 * that require JavaScript rendering and ViewState management.
 *
 * This is a NEW file — the original HTTP-based ExtranjeriaConnector in
 * adapters/extranjeria.connector.ts is left untouched until the registry
 * swap in a later task.
 */

import type { Page } from 'playwright-core';
import { ConnectorMetadata, TimeSlot, BookingResult } from '../connector.interface';
import { BaseBrowserConnector } from './base-browser.connector';
import { BrowserPool } from './browser-pool';
import type { CaptchaDetection } from './portal-config';
import { CaptchaSolver } from './captcha-solver';
import { ScreenshotService } from './screenshot.service';
import { CircuitBreakerError } from '../adapters/base-real.connector';
import { logger } from '../../../lib/logger';

// ── Province → URL category mapping ──────────────────────────────────────────

export const PROVINCE_URL_CATEGORY: Record<number, string> = {
  8:  'icpplustieb',   // Barcelona
  28: 'icpplustiem',   // Madrid
  3:  'icpco',         // Alicante
  7:  'icpco',         // Illes Balears
  35: 'icpco',         // Las Palmas
  38: 'icpco',         // S.Cruz Tenerife
  29: 'icpco',         // Málaga (with tramiteGrupo[0])
};

const DEFAULT_URL_CATEGORY = 'icpplus';

// ── Operation codes ──────────────────────────────────────────────────────────

export const OPERATION_CODES = {
  TOMA_HUELLAS: 4010,
  RECOGIDA_TIE: 4036,
  CERTIFICADOS_NIE: 4096,
  SOLICITUD_ASILO: 4078,
} as const;

// ── Portal CSS selectors ─────────────────────────────────────────────────────

export const EXTRANJERIA_SELECTORS = {
  // Instructions / entry
  enterButton: '#btnEntrar',

  // Personal data form
  documentInput: '#txtIdCitado',
  nameInput: '#txtDesCitado',
  nationalitySelect: '#txtPaisNac',
  documentTypeNie: '#rdbTipoDocNie',
  documentTypePas: '#rdbTipoDocPas',
  documentTypeDni: '#rdbTipoDocDni',
  submitButton: '#btnEnviar',
  nextButton: '#btnSiguiente',

  // Office / slot selection
  officeSelect: '#idSede',
  slotsTable: '#CitaMAP_HORAS',
  dateSlots: '[id^=lCita_]',
  slotRadios: "input[name='rdbCita']",

  // Confirmation
  phoneInput: '#txtTelefonoCitado',
  emailOne: '#emailUNO',
  emailTwo: '#emailDOS',
  confirmCheckbox: '#chkTotal',
  sendEmailCheckbox: '#enviarCorreo',
  confirmButton: '#btnConfirmar',
  confirmationCode: '#justificanteFinal',

  // SMS verification
  smsVerificationInput: '#txtCodigoVerificacion',
} as const;

// ── CAPTCHA indicators ───────────────────────────────────────────────────────

const CAPTCHA_INDICATORS = [
  'g-recaptcha',
  'recaptcha/api.js',
  'class="captcha"',
  'img-thumbnail',
] as const;

// ── Structure markers ────────────────────────────────────────────────────────

const EXPECTED_STRUCTURE_MARKERS = [
  'icpplus',
  'citaprevia',
  'sede.administracionespublicas',
] as const;

// ── SMS Verification Error ───────────────────────────────────────────────────

export class SMSVerificationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SMSVerificationRequiredError';
  }
}

// ── ExtranjeriaConnector (Browser) ───────────────────────────────────────────

export class ExtranjeriaBrowserConnector extends BaseBrowserConnector {
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

  private readonly captchaSolver = new CaptchaSolver();
  private readonly screenshotService = new ScreenshotService();

  constructor(browserPool: BrowserPool) {
    super(
      {
        connectorSlug: 'extranjeria',
        baseUrl: 'https://icp.administracionelectronica.gob.es',
        navigationTimeoutMs: 60_000,
        rateLimit: 10,
        selectors: EXTRANJERIA_SELECTORS as unknown as Record<string, string>,
        maxSteps: 6,
      },
      browserPool,
    );
  }

  // ── navigateAvailability ─────────────────────────────────────────────────

  protected async navigateAvailability(
    page: Page,
    procedureId: string,
    _fromDate: string,
    _toDate: string,
  ): Promise<TimeSlot[]> {
    const { provinceCode, operationCode } = this.parseProcedureId(procedureId);
    const category = PROVINCE_URL_CATEGORY[provinceCode] ?? DEFAULT_URL_CATEGORY;
    const url = `${this.config.baseUrl}/${category}/citar?p=${provinceCode}`;

    // Step 1: Navigate to portal entry page
    logger.info(`ExtranjeriaBrowserConnector: navigating to ${url}`);
    await this.navigateWithRetry(page, url, { waitUntil: 'networkidle' });
    this.checkRedirect(page, this.config.baseUrl);
    await this.checkForPortalError(page);
    await this.checkForCaptcha(page);
    await this.checkStructure(page);

    // Step 2: Click enter button on instructions page
    await this.waitForSelector(page, EXTRANJERIA_SELECTORS.enterButton, 10_000);
    await this.clickButton(page, EXTRANJERIA_SELECTORS.enterButton);
    logger.info('ExtranjeriaBrowserConnector: passed instructions page');

    // Step 3: Select procedure (operation code)
    await this.waitForSelector(page, EXTRANJERIA_SELECTORS.submitButton, 10_000);
    // Select the operation from the tramite dropdown if present
    const tramiteSelector = 'select[id*="tramite"], select[name*="tramite"]';
    const hasTramite = await page.$(tramiteSelector);
    if (hasTramite) {
      await this.selectDropdown(page, tramiteSelector, String(operationCode));
    }
    await this.clickButton(page, EXTRANJERIA_SELECTORS.submitButton);
    await this.checkForCaptcha(page);
    logger.info(`ExtranjeriaBrowserConnector: selected operation ${operationCode}`);

    // Step 4: Fill minimal personal data to proceed
    await this.waitForSelector(page, EXTRANJERIA_SELECTORS.documentInput, 10_000);
    // Use placeholder data for availability check — just enough to proceed
    await this.fillField(page, EXTRANJERIA_SELECTORS.documentInput, 'X0000000T');
    await this.fillField(page, EXTRANJERIA_SELECTORS.nameInput, 'CONSULTA DISPONIBILIDAD');

    // Select document type (NIE by default)
    const nieRadio = await page.$(EXTRANJERIA_SELECTORS.documentTypeNie);
    if (nieRadio) await nieRadio.click();

    await this.clickButton(page, EXTRANJERIA_SELECTORS.submitButton);
    await this.checkForCaptcha(page);
    logger.info('ExtranjeriaBrowserConnector: submitted personal data');

    // Step 5: Select office if dropdown is present
    const officeDropdown = await page.$(EXTRANJERIA_SELECTORS.officeSelect);
    if (officeDropdown) {
      // Get all available offices and select the first one
      const options = await page.$$eval(`${EXTRANJERIA_SELECTORS.officeSelect} option`, opts =>
        opts.filter(o => (o as HTMLOptionElement).value).map(o => (o as HTMLOptionElement).value),
      );
      if (options.length > 0) {
        await this.selectDropdown(page, EXTRANJERIA_SELECTORS.officeSelect, options[0]);
        await this.clickButton(page, EXTRANJERIA_SELECTORS.nextButton);
      }
    }

    // Step 6: Extract available slots
    return this.extractSlots(page);
  }

  // ── navigateBooking ──────────────────────────────────────────────────────

  protected async navigateBooking(
    page: Page,
    bookingData: Record<string, unknown>,
  ): Promise<BookingResult> {
    const provinceCode = Number(bookingData.provinceCode ?? 28);
    const operationCode = Number(bookingData.operationCode ?? OPERATION_CODES.TOMA_HUELLAS);
    const category = PROVINCE_URL_CATEGORY[provinceCode] ?? DEFAULT_URL_CATEGORY;
    const url = `${this.config.baseUrl}/${category}/citar?p=${provinceCode}`;

    // Step 1: Navigate to portal
    logger.info(`ExtranjeriaBrowserConnector: booking — navigating to ${url}`);
    await this.navigateWithRetry(page, url, { waitUntil: 'networkidle' });
    this.checkRedirect(page, this.config.baseUrl);
    await this.checkForPortalError(page);
    await this.checkForCaptcha(page);
    await this.checkStructure(page);

    // Step 2: Pass instructions page
    await this.waitForSelector(page, EXTRANJERIA_SELECTORS.enterButton, 10_000);
    await this.clickButton(page, EXTRANJERIA_SELECTORS.enterButton);

    // Step 3: Select procedure
    await this.waitForSelector(page, EXTRANJERIA_SELECTORS.submitButton, 10_000);
    const tramiteSelector = 'select[id*="tramite"], select[name*="tramite"]';
    const hasTramite = await page.$(tramiteSelector);
    if (hasTramite) {
      await this.selectDropdown(page, tramiteSelector, String(operationCode));
    }
    await this.clickButton(page, EXTRANJERIA_SELECTORS.submitButton);
    await this.checkForCaptcha(page);

    // Step 4: Fill personal data
    await this.waitForSelector(page, EXTRANJERIA_SELECTORS.documentInput, 10_000);

    const documentNumber = String(bookingData.documentNumber ?? '');
    const applicantName = String(bookingData.applicantName ?? '');
    const nationality = String(bookingData.nationality ?? '');
    const documentType = String(bookingData.documentType ?? 'nie');
    const email = String(bookingData.email ?? '');
    const phone = String(bookingData.phone ?? '');

    await this.fillField(page, EXTRANJERIA_SELECTORS.documentInput, documentNumber);
    await this.fillField(page, EXTRANJERIA_SELECTORS.nameInput, applicantName);

    // Select nationality
    if (nationality) {
      await this.selectDropdown(page, EXTRANJERIA_SELECTORS.nationalitySelect, nationality);
    }

    // Select document type radio
    const docTypeMap: Record<string, string> = {
      nie: EXTRANJERIA_SELECTORS.documentTypeNie,
      passport: EXTRANJERIA_SELECTORS.documentTypePas,
      dni: EXTRANJERIA_SELECTORS.documentTypeDni,
    };
    const docTypeSelector = docTypeMap[documentType] ?? EXTRANJERIA_SELECTORS.documentTypeNie;
    const docRadio = await page.$(docTypeSelector);
    if (docRadio) await docRadio.click();

    await this.clickButton(page, EXTRANJERIA_SELECTORS.submitButton);
    await this.checkForCaptcha(page);
    logger.info('ExtranjeriaBrowserConnector: booking — personal data submitted');

    // Step 5: Select office
    const targetOffice = String(bookingData.officeId ?? '');
    const officeDropdown = await page.$(EXTRANJERIA_SELECTORS.officeSelect);
    if (officeDropdown && targetOffice) {
      await this.selectDropdown(page, EXTRANJERIA_SELECTORS.officeSelect, targetOffice);
      await this.clickButton(page, EXTRANJERIA_SELECTORS.nextButton);
    }

    // Step 6: Select the target slot
    const targetDate = String(bookingData.selectedDate ?? '');
    const targetTime = String(bookingData.selectedTime ?? '');
    const targetSlotId = String(bookingData.slotId ?? '');

    // Click on the date slot if available
    if (targetSlotId) {
      const slotRadio = await page.$(`input[name='rdbCita'][value='${targetSlotId}']`);
      if (slotRadio) {
        await slotRadio.click();
      }
    } else {
      // Try to find a matching date/time slot
      const dateSlots = await page.$$(EXTRANJERIA_SELECTORS.dateSlots);
      for (const slot of dateSlots) {
        const text = await slot.textContent();
        if (text && text.includes(targetDate)) {
          await slot.click();
          break;
        }
      }
    }

    await this.clickButton(page, EXTRANJERIA_SELECTORS.nextButton);
    await this.checkForCaptcha(page);
    logger.info(`ExtranjeriaBrowserConnector: booking — slot selected (${targetDate} ${targetTime})`);

    // Step 7: Fill confirmation details
    if (phone) {
      const phoneField = await page.$(EXTRANJERIA_SELECTORS.phoneInput);
      if (phoneField) await this.fillField(page, EXTRANJERIA_SELECTORS.phoneInput, phone);
    }

    if (email) {
      const emailField = await page.$(EXTRANJERIA_SELECTORS.emailOne);
      if (emailField) {
        await this.fillField(page, EXTRANJERIA_SELECTORS.emailOne, email);
        await this.fillField(page, EXTRANJERIA_SELECTORS.emailTwo, email);
      }
    }

    // Check confirmation checkbox
    const checkbox = await page.$(EXTRANJERIA_SELECTORS.confirmCheckbox);
    if (checkbox) await checkbox.check();

    // Check send-email checkbox
    const emailCheckbox = await page.$(EXTRANJERIA_SELECTORS.sendEmailCheckbox);
    if (emailCheckbox) await emailCheckbox.check();

    // Step 8: Confirm booking
    await this.clickButton(page, EXTRANJERIA_SELECTORS.confirmButton);
    await this.checkForCaptcha(page);

    // Step 9: Check for SMS verification
    await this.detectSMSVerification(page);

    // Step 10: Extract confirmation
    const confirmCode = await this.extractText(page, EXTRANJERIA_SELECTORS.confirmationCode);

    if (!confirmCode) {
      await this.screenshotService.capture(page, 'extranjeria', 'BOOKING_NO_CONFIRMATION');
      return {
        success: false,
        errorMessage: 'No confirmation code found after booking submission',
      };
    }

    logger.info(`ExtranjeriaBrowserConnector: booking confirmed — code=${confirmCode}`);

    return {
      success: true,
      confirmationCode: confirmCode.trim(),
      appointmentDate: targetDate,
      appointmentTime: targetTime,
      location: targetOffice,
    };
  }

  // ── navigateCancellation ─────────────────────────────────────────────────

  protected async navigateCancellation(
    page: Page,
    confirmationCode: string,
  ): Promise<boolean> {
    const url = `${this.config.baseUrl}/icpplus/anularCita`;

    logger.info(`ExtranjeriaBrowserConnector: cancellation — navigating to ${url}`);
    await this.navigateWithRetry(page, url, { waitUntil: 'networkidle' });
    this.checkRedirect(page, this.config.baseUrl);
    await this.checkForPortalError(page);
    await this.checkForCaptcha(page);
    await this.checkStructure(page);

    // Enter confirmation code
    const codeInput = await page.$('#txtCodigoJustificante');
    if (codeInput) {
      await this.fillField(page, '#txtCodigoJustificante', confirmationCode);
    }

    // Submit cancellation
    await this.clickButton(page, EXTRANJERIA_SELECTORS.submitButton);
    await this.checkForCaptcha(page);

    // Verify cancellation result
    const bodyText = await page.textContent('body') ?? '';
    const cancelled = bodyText.includes('anulada') || bodyText.includes('cancelada');

    if (!cancelled) {
      await this.screenshotService.capture(page, 'extranjeria', 'CANCELLATION_FAILED');
      logger.warn('ExtranjeriaBrowserConnector: cancellation may have failed');
    }

    return cancelled;
  }

  // ── detectCaptcha ────────────────────────────────────────────────────────

  protected async detectCaptcha(page: Page): Promise<CaptchaDetection | null> {
    const html = await page.content();
    const url = page.url();

    // Check for reCAPTCHA
    if (html.includes('g-recaptcha') || html.includes('recaptcha/api.js')) {
      const siteKey = await page
        .$eval('[data-sitekey]', el => el.getAttribute('data-sitekey'))
        .catch(() => null);
      logger.warn(`ExtranjeriaBrowserConnector: reCAPTCHA detected at ${url}`);
      return { type: 'recaptcha_v3', siteKey: siteKey ?? undefined, pageUrl: url };
    }

    // Check for image captcha
    if (html.includes('class="captcha"') || html.includes('img-thumbnail')) {
      logger.warn(`ExtranjeriaBrowserConnector: image CAPTCHA detected at ${url}`);
      return { type: 'image', pageUrl: url };
    }

    // Check for reCAPTCHA iframe
    const recaptchaFrame = await page.$('iframe[src*="recaptcha"]');
    if (recaptchaFrame) {
      logger.warn(`ExtranjeriaBrowserConnector: reCAPTCHA iframe detected at ${url}`);
      return { type: 'recaptcha_v2', pageUrl: url };
    }

    return null;
  }

  // ── validateStructure ────────────────────────────────────────────────────

  protected async validateStructure(page: Page): Promise<boolean> {
    const html = await page.content();
    const htmlLower = html.toLowerCase();

    // At least one expected marker must be present
    return EXPECTED_STRUCTURE_MARKERS.some(marker => htmlLower.includes(marker));
  }

  // ── SMS verification detection ───────────────────────────────────────────

  private async detectSMSVerification(page: Page): Promise<void> {
    const smsInput = await page.$(EXTRANJERIA_SELECTORS.smsVerificationInput);
    if (smsInput) {
      logger.warn('ExtranjeriaBrowserConnector: SMS verification required — manual intervention needed');
      await this.screenshotService.capture(page, 'extranjeria', 'SMS_VERIFICATION_REQUIRED');

      // Do NOT throw CircuitBreakerError — SMS verification is not a portal failure
      throw new SMSVerificationRequiredError(
        'Portal requires SMS verification code. Manual intervention needed to complete booking.',
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Check for CAPTCHA and attempt to solve it. If solving fails, throw
   * CircuitBreakerError.
   */
  private async checkForCaptcha(page: Page): Promise<void> {
    const detection = await this.detectCaptcha(page);
    if (!detection) return;

    logger.warn(`ExtranjeriaBrowserConnector: CAPTCHA detected (${detection.type})`);
    await this.screenshotService.capture(page, 'extranjeria', 'CAPTCHA_DETECTED');

    if (this.captchaSolver.isConfigured()) {
      const solved = await this.captchaSolver.solve(page, detection);
      if (solved) {
        logger.info('ExtranjeriaBrowserConnector: CAPTCHA solved successfully');
        return;
      }
    }

    throw new CircuitBreakerError(
      `CAPTCHA ${detection.type} detected on Extranjería portal`,
      'CAPTCHA_DETECTED',
    );
  }

  /**
   * Validate portal structure. If invalid, capture screenshot and throw.
   */
  private async checkStructure(page: Page): Promise<void> {
    const valid = await this.validateStructure(page);
    if (!valid) {
      await this.screenshotService.capture(page, 'extranjeria', 'STRUCTURE_CHANGED');
      throw new CircuitBreakerError(
        'Extranjería portal structure has changed unexpectedly',
        'STRUCTURE_CHANGED',
      );
    }
  }

  /**
   * Parse procedureId into province code and operation code.
   * Expected format: "{provinceCode}:{operationCode}" e.g. "28:4010"
   * Falls back to Madrid (28) and TOMA_HUELLAS (4010) if parsing fails.
   */
  private parseProcedureId(procedureId: string): {
    provinceCode: number;
    operationCode: number;
  } {
    const parts = procedureId.split(':');
    return {
      provinceCode: parseInt(parts[0], 10) || 28,
      operationCode: parseInt(parts[1], 10) || OPERATION_CODES.TOMA_HUELLAS,
    };
  }

  /**
   * Extract available time slots from the current page.
   * Looks for the slots table (#CitaMAP_HORAS) or date slot elements.
   */
  private async extractSlots(page: Page): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];

    // Try extracting from radio buttons first (most common pattern)
    const radios = await page.$$(EXTRANJERIA_SELECTORS.slotRadios);
    for (const radio of radios) {
      const value = await radio.getAttribute('value');
      const parent = await radio.evaluateHandle(el => el.closest('tr') ?? el.parentElement);
      const rowText = await parent.evaluate(el => (el as HTMLElement).textContent ?? '');

      const parsed = this.parseSlotText(rowText.trim(), value ?? undefined);
      if (parsed) slots.push(parsed);
    }

    if (slots.length > 0) return slots;

    // Fallback: try date slot elements
    const dateElements = await page.$$(EXTRANJERIA_SELECTORS.dateSlots);
    for (const el of dateElements) {
      const text = await el.textContent();
      const id = await el.getAttribute('id');
      const parsed = this.parseSlotText(text ?? '', id ?? undefined);
      if (parsed) slots.push(parsed);
    }

    logger.info(`ExtranjeriaBrowserConnector: extracted ${slots.length} slot(s)`);
    return slots;
  }

  /**
   * Parse slot text (e.g. "15/07/2025 09:30") into a TimeSlot.
   * Handles common Spanish date formats: DD/MM/YYYY HH:mm
   */
  private parseSlotText(text: string, slotId?: string): TimeSlot | null {
    // Match DD/MM/YYYY HH:mm pattern
    const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/);
    if (!match) return null;

    const [, day, month, year, time] = match;
    return {
      date: `${year}-${month}-${day}`,
      time,
      available: true,
      slotId,
    };
  }
}
