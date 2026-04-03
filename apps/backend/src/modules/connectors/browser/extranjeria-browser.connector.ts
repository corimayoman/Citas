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

/**
 * The tramiteGrupo parameter index varies by province.
 * Barcelona, Málaga, Melilla, Sevilla use [0]; the rest use [1].
 */
function getTramiteParam(provinceCode: number): string {
  const useZero = [8, 29, 52, 41]; // Barcelona, Málaga, Melilla, Sevilla
  return useZero.includes(provinceCode) ? 'tramiteGrupo[0]' : 'tramiteGrupo[1]';
}

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
      const tramiteParam = getTramiteParam(provinceCode);

      // Two-URL pattern (from cita-bot): first load province page, then navigate to operation
      const url1 = `${this.config.baseUrl}/${category}/citar?p=${provinceCode}`;
      const url2 = `${this.config.baseUrl}/${category}/acInfo?${tramiteParam}=${operationCode}`;

      // Step 1: Load province page (triggers bot protection / cookie setup)
      logger.info(`ExtranjeriaBrowserConnector: navigating to ${url1}`);
      await this.navigateWithRetry(page, url1, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000); // Let bot protection scripts execute

      // Step 2: Navigate to operation page
      logger.info(`ExtranjeriaBrowserConnector: navigating to ${url2}`);
      await page.goto(url2, { waitUntil: 'networkidle', timeout: this.config.navigationTimeoutMs });
      await page.waitForTimeout(3000);

      // Verify we're on the right page
      const bodyText = await page.textContent('body') ?? '';
      if (!bodyText.includes('INTERNET CITA PREVIA') && !bodyText.includes('CITA PREVIA')) {
        await this.screenshotService.capture(page, 'extranjeria', 'AVAILABILITY_PAGE_NOT_LOADED');
        logger.warn('ExtranjeriaBrowserConnector: portal page did not load correctly');
        return [];
      }

      // Step 3: Click "Entrar" on instructions page
      const enterBtn = await page.$(EXTRANJERIA_SELECTORS.enterButton);
      if (enterBtn) {
        await enterBtn.click();
        await page.waitForTimeout(2000);
      }
      logger.info('ExtranjeriaBrowserConnector: passed instructions page');

      // Step 4: Fill personal data (minimal — just enough to see availability)
      await this.waitForSelector(page, EXTRANJERIA_SELECTORS.documentInput, 15_000);

      // Select document type (NIE by default)
      const nieRadio = await page.$(EXTRANJERIA_SELECTORS.documentTypeNie);
      if (nieRadio) await nieRadio.click();

      await this.fillField(page, EXTRANJERIA_SELECTORS.documentInput, 'X0000000T');

      // Name field — may be a separate field or tab-linked
      const nameField = await page.$(EXTRANJERIA_SELECTORS.nameInput);
      if (nameField) {
        await this.fillField(page, EXTRANJERIA_SELECTORS.nameInput, 'CONSULTA DISPONIBILIDAD');
      } else {
        await page.keyboard.press('Tab');
        await page.keyboard.type('CONSULTA DISPONIBILIDAD');
      }

      // Nationality select (if present for this operation type)
      const nationalitySelect = await page.$(EXTRANJERIA_SELECTORS.nationalitySelect);
      if (nationalitySelect) {
        await page.selectOption(EXTRANJERIA_SELECTORS.nationalitySelect, { label: 'ESPAÑA' }).catch(() => {});
      }

      // Submit personal data
      const submitBtn = await page.$(EXTRANJERIA_SELECTORS.submitButton);
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }
      await this.checkForCaptcha(page);
      logger.info('ExtranjeriaBrowserConnector: submitted personal data');

      // Step 5: Office selection
      const pageText = await page.textContent('body') ?? '';
      if (pageText.includes('Seleccione la oficina')) {
        const officeDropdown = await page.$(EXTRANJERIA_SELECTORS.officeSelect);
        if (officeDropdown) {
          const options = await page.$$eval(
            `${EXTRANJERIA_SELECTORS.officeSelect} option`,
            opts => opts.filter(o => (o as HTMLOptionElement).value !== '').map(o => (o as HTMLOptionElement).value),
          );
          if (options.length > 0) {
            await page.selectOption(EXTRANJERIA_SELECTORS.officeSelect, options[0]);
            const nextBtn = await page.$(EXTRANJERIA_SELECTORS.nextButton);
            if (nextBtn) {
              await nextBtn.click();
              await page.waitForTimeout(3000);
            }
          }
        }
      } else if (pageText.includes('En este momento no hay citas disponibles')) {
        logger.info('ExtranjeriaBrowserConnector: no appointments available at this time');
        return [];
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
      const tramiteParam = getTramiteParam(provinceCode);

      const url1 = `${this.config.baseUrl}/${category}/citar?p=${provinceCode}`;
      const url2 = `${this.config.baseUrl}/${category}/acInfo?${tramiteParam}=${operationCode}`;

      // Step 1: Load province page (bot protection)
      logger.info(`ExtranjeriaBrowserConnector: booking — navigating to ${url1}`);
      await this.navigateWithRetry(page, url1, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Step 2: Navigate to operation page
      await page.goto(url2, { waitUntil: 'networkidle', timeout: this.config.navigationTimeoutMs });
      await page.waitForTimeout(3000);

      const bodyText = await page.textContent('body') ?? '';
      if (!bodyText.includes('INTERNET CITA PREVIA') && !bodyText.includes('CITA PREVIA')) {
        await this.screenshotService.capture(page, 'extranjeria', 'BOOKING_PAGE_NOT_LOADED');
        return { success: false, errorMessage: 'Portal page did not load correctly' };
      }

      // Step 3: Pass instructions page
      const enterBtn = await page.$(EXTRANJERIA_SELECTORS.enterButton);
      if (enterBtn) {
        await enterBtn.click();
        await page.waitForTimeout(2000);
      }

      // Step 4: Fill personal data
      await this.waitForSelector(page, EXTRANJERIA_SELECTORS.documentInput, 15_000);

      const documentNumber = String(bookingData.documentNumber ?? '');
      const applicantName = String(bookingData.applicantName ?? '');
      const nationality = String(bookingData.nationality ?? '');
      const documentType = String(bookingData.documentType ?? 'nie');
      const email = String(bookingData.email ?? '');
      const phone = String(bookingData.phone ?? '');
      const yearOfBirth = String(bookingData.yearOfBirth ?? '');

      // Select document type radio
      const docTypeMap: Record<string, string> = {
        nie: EXTRANJERIA_SELECTORS.documentTypeNie,
        passport: EXTRANJERIA_SELECTORS.documentTypePas,
        dni: EXTRANJERIA_SELECTORS.documentTypeDni,
      };
      const docTypeSelector = docTypeMap[documentType] ?? EXTRANJERIA_SELECTORS.documentTypeNie;
      const docRadio = await page.$(docTypeSelector);
      if (docRadio) await docRadio.click();

      // Fill document number and name (tab-linked fields)
      const docInput = await page.$(EXTRANJERIA_SELECTORS.documentInput);
      if (docInput) {
        await docInput.click();
        await docInput.fill(documentNumber);
        await page.keyboard.press('Tab');
        await page.keyboard.type(applicantName);
        // Some operations require year of birth after name
        if (yearOfBirth) {
          await page.keyboard.press('Tab');
          await page.keyboard.type(yearOfBirth);
        }
      }

      // Nationality select (if present)
      if (nationality) {
        const natSelect = await page.$(EXTRANJERIA_SELECTORS.nationalitySelect);
        if (natSelect) {
          await page.selectOption(EXTRANJERIA_SELECTORS.nationalitySelect, { label: nationality }).catch(() => {});
        }
      }

      // Submit personal data
      const submitBtn = await page.$(EXTRANJERIA_SELECTORS.submitButton);
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }
      await this.checkForCaptcha(page);
      logger.info('ExtranjeriaBrowserConnector: booking — personal data submitted');

      // Step 5: Office selection
      const targetOffice = String(bookingData.officeId ?? '');
      const pageText = await page.textContent('body') ?? '';

      if (pageText.includes('Seleccione la oficina')) {
        const officeDropdown = await page.$(EXTRANJERIA_SELECTORS.officeSelect);
        if (officeDropdown && targetOffice) {
          await page.selectOption(EXTRANJERIA_SELECTORS.officeSelect, targetOffice);
        } else if (officeDropdown) {
          // Select first available office
          const options = await page.$$eval(
            `${EXTRANJERIA_SELECTORS.officeSelect} option`,
            opts => opts.filter(o => (o as HTMLOptionElement).value !== '').map(o => (o as HTMLOptionElement).value),
          );
          if (options.length > 0) {
            await page.selectOption(EXTRANJERIA_SELECTORS.officeSelect, options[0]);
          }
        }
        const nextBtn = await page.$(EXTRANJERIA_SELECTORS.nextButton);
        if (nextBtn) {
          await nextBtn.click();
          await page.waitForTimeout(3000);
        }
      } else if (pageText.includes('En este momento no hay citas disponibles')) {
        return { success: false, errorMessage: 'No hay citas disponibles en este momento' };
      }

      // Step 6: Fill phone and email
      const phoneField = await page.$(EXTRANJERIA_SELECTORS.phoneInput);
      if (phoneField && phone) {
        await this.fillField(page, EXTRANJERIA_SELECTORS.phoneInput, phone);
      }
      const emailField = await page.$(EXTRANJERIA_SELECTORS.emailOne);
      if (emailField && email) {
        await this.fillField(page, EXTRANJERIA_SELECTORS.emailOne, email);
        const emailTwo = await page.$(EXTRANJERIA_SELECTORS.emailTwo);
        if (emailTwo) await this.fillField(page, EXTRANJERIA_SELECTORS.emailTwo, email);
      }

      // Add reason if needed (e.g. for SOLICITUD_ASILO)
      const reason = String(bookingData.reason ?? '');
      if (reason) {
        const reasonField = await page.$('#txtObservaciones');
        if (reasonField) await this.fillField(page, '#txtObservaciones', reason);
      }

      // Submit contact info — uses enviar() JS call
      await page.evaluate(() => { (window as any).enviar?.(); }).catch(() => {});
      await page.waitForTimeout(3000);

      // Step 7: Select appointment slot
      const targetDate = String(bookingData.selectedDate ?? '');
      const targetTime = String(bookingData.selectedTime ?? '');
      const targetSlotId = String(bookingData.slotId ?? '');
      const slotPageText = await page.textContent('body') ?? '';

      if (slotPageText.includes('DISPONE DE 5 MINUTOS') || slotPageText.includes('citas disponibles')) {
        logger.info('ExtranjeriaBrowserConnector: booking — slot selection page reached');

        // Solve CAPTCHA if present
        await this.checkForCaptcha(page);

        if (targetSlotId) {
          // Direct slot selection by ID
          const slotRadio = await page.$(`input[name='rdbCita'][value='${targetSlotId}']`);
          if (slotRadio) await slotRadio.click();
        } else {
          // Try to find matching date/time in radio buttons
          const dateSlots = await page.$$('[id^=lCita_]');
          let selectedIndex = 0;
          for (let i = 0; i < dateSlots.length; i++) {
            const text = await dateSlots[i].textContent() ?? '';
            if (targetDate && text.includes(targetDate)) {
              selectedIndex = i;
              break;
            }
          }
          // Click the corresponding radio button
          const radios = await page.$$("input[type='radio'][name='rdbCita']");
          if (radios[selectedIndex]) await radios[selectedIndex].click();
        }

        // Submit slot selection — uses envia() JS call
        await page.evaluate(() => { (window as any).envia?.(); }).catch(() => {});
        await page.waitForTimeout(1000);

        // Accept the alert dialog
        page.once('dialog', dialog => dialog.accept());
        await page.waitForTimeout(2000);
      } else {
        await this.screenshotService.capture(page, 'extranjeria', 'BOOKING_NO_SLOTS');
        return { success: false, errorMessage: 'No se encontraron citas disponibles' };
      }

      // Step 8: Confirmation page
      const confirmText = await page.textContent('body') ?? '';
      if (confirmText.includes('Debe confirmar los datos')) {
        logger.info('ExtranjeriaBrowserConnector: booking — confirmation page reached');

        // Check for SMS verification
        await this.detectSMSVerification(page);

        // Check confirmation checkbox and send email checkbox
        const checkbox = await page.$(EXTRANJERIA_SELECTORS.confirmCheckbox);
        if (checkbox) await checkbox.check();
        const emailCheckbox = await page.$(EXTRANJERIA_SELECTORS.sendEmailCheckbox);
        if (emailCheckbox) await emailCheckbox.check();

        // Confirm
        const confirmBtn = await page.$(EXTRANJERIA_SELECTORS.confirmButton);
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForTimeout(3000);
        }
      }

      // Step 9: Extract confirmation code
      const finalText = await page.textContent('body') ?? '';
      if (finalText.includes('CITA CONFIRMADA Y GRABADA')) {
        const confirmCode = await this.extractText(page, EXTRANJERIA_SELECTORS.confirmationCode);
        logger.info(`ExtranjeriaBrowserConnector: booking confirmed — code=${confirmCode}`);
        return {
          success: true,
          confirmationCode: confirmCode?.trim(),
          appointmentDate: targetDate,
          appointmentTime: targetTime,
          location: targetOffice,
        };
      }

      await this.screenshotService.capture(page, 'extranjeria', 'BOOKING_FAILED');
      return { success: false, errorMessage: 'La reserva no pudo completarse' };
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
      const bodyText = await page.textContent('body') ?? '';

      // Format 1: Radio buttons with date labels (lCita_X elements)
      if (bodyText.includes('DISPONE DE 5 MINUTOS') || bodyText.includes('citas disponibles')) {
        const dateElements = await page.$$('[id^=lCita_]');
        for (const el of dateElements) {
          const text = await el.textContent() ?? '';
          const parsed = this.parseSlotText(text.trim());
          if (parsed) slots.push(parsed);
        }

        if (slots.length > 0) {
          logger.info(`ExtranjeriaBrowserConnector: extracted ${slots.length} slot(s) from radio buttons`);
          return slots;
        }

        // Format 2: Table with HUECO_* elements (CitaMAP_HORAS)
        const slotsTable = await page.$(EXTRANJERIA_SELECTORS.slotsTable);
        if (slotsTable) {
          // Get column headers (dates)
          const dateHeaders = await page.$$eval(
            '#CitaMAP_HORAS thead [class^=colFecha]',
            els => els.map(el => el.textContent?.trim() ?? ''),
          );

          // Get rows with time slots
          const rows = await page.$$('#CitaMAP_HORAS tbody tr');
          for (const row of rows) {
            const timeHeader = await row.$('th');
            const time = await timeHeader?.textContent() ?? '';
            const cells = await row.$$('td');

            for (let i = 0; i < cells.length && i < dateHeaders.length; i++) {
              const hueco = await cells[i].$('[id^=HUECO]');
              if (hueco) {
                const huecoId = await hueco.getAttribute('id') ?? '';
                const dateText = dateHeaders[i];
                const parsed = this.parseSlotText(`${dateText} ${time.trim()}`, huecoId);
                if (parsed) slots.push(parsed);
              }
            }
          }

          logger.info(`ExtranjeriaBrowserConnector: extracted ${slots.length} slot(s) from HUECO table`);
        }
      } else if (bodyText.includes('En este momento no hay citas disponibles')) {
        logger.info('ExtranjeriaBrowserConnector: no appointments available');
      } else {
        // Take screenshot for debugging
        await this.screenshotService.capture(page, 'extranjeria', 'UNKNOWN_SLOT_PAGE');
        logger.warn('ExtranjeriaBrowserConnector: unexpected page state when extracting slots');
      }

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
