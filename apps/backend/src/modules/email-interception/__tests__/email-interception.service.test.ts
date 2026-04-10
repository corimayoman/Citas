import { emailInterceptionService, InboundEmailPayload, ParsedConfirmation } from '../email-interception.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// jest.mock() paths are resolved relative to the TEST FILE.
// This test lives in __tests__/, one level below the service.
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    interceptedEmail: { create: jest.fn() },
    bookingRequest: { findFirst: jest.fn() },
    appointment: { findFirst: jest.fn() },
  },
}));

jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('../../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../parsers/extranjeria.parser', () => ({ parseExtranjeria: jest.fn() }));
jest.mock('../parsers/dgt.parser', () => ({ parseDgt: jest.fn() }));
jest.mock('../parsers/aeat.parser', () => ({ parseAeat: jest.fn() }));
jest.mock('../parsers/sepe.parser', () => ({ parseSepe: jest.fn() }));
jest.mock('../parsers/registro-civil.parser', () => ({ parseRegistroCivil: jest.fn() }));
jest.mock('../parsers/generic.parser', () => ({ parseGeneric: jest.fn() }));

// ─── Import mocks after jest.mock() declarations ──────────────────────────────
// Paths below are relative to THIS test file (one level inside __tests__/),
// while jest.mock() paths above are relative to the module-under-test.

import { prisma } from '../../../lib/prisma';
import { auditService } from '../../audit/audit.service';
import { logger } from '../../../lib/logger';
import { parseExtranjeria } from '../parsers/extranjeria.parser';
import { parseDgt } from '../parsers/dgt.parser';
import { parseAeat } from '../parsers/aeat.parser';
import { parseSepe } from '../parsers/sepe.parser';
import { parseRegistroCivil } from '../parsers/registro-civil.parser';
import { parseGeneric } from '../parsers/generic.parser';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockInterceptedEmailCreate = prisma.interceptedEmail.create as jest.Mock;
const mockBookingRequestFindFirst = prisma.bookingRequest.findFirst as jest.Mock;
const mockAppointmentFindFirst = prisma.appointment.findFirst as jest.Mock;
const mockAuditLog = auditService.log as jest.Mock;
const mockParseExtranjeria = parseExtranjeria as jest.Mock;
const mockParseDgt = parseDgt as jest.Mock;
const mockParseAeat = parseAeat as jest.Mock;
const mockParseSepe = parseSepe as jest.Mock;
const mockParseRegistroCivil = parseRegistroCivil as jest.Mock;
const mockParseGeneric = parseGeneric as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseParsedResult = {
  confirmationCode: 'ABC-001',
  appointmentDate: '2025-06-01',
  appointmentTime: '10:00',
  location: 'Oficina Central',
};

const buildParsed = (overrides?: Partial<ParsedConfirmation>): ParsedConfirmation => ({
  ...baseParsedResult,
  rawBody: 'raw email body',
  portalOrigin: 'unknown',
  ...overrides,
});

const buildPayload = (overrides?: Partial<InboundEmailPayload>): InboundEmailPayload => ({
  from: 'noreply@someportal.es',
  to: 'inbox@citas.example',
  subject: 'Confirmación de cita',
  body: 'raw email body',
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('emailInterceptionService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── parseConfirmation() ───────────────────────────────────────────────────

  describe('parseConfirmation()', () => {
    it('routes noreply@aeat.es to parseAeat', () => {
      mockParseAeat.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('body', 'noreply@aeat.es');
      expect(mockParseAeat).toHaveBeenCalledWith('body');
      expect(result).not.toBeNull();
      expect(result!.portalOrigin).toBe('aeat');
    });

    it('routes info@dgt.gob.es to parseDgt', () => {
      mockParseDgt.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('body', 'info@dgt.gob.es');
      expect(mockParseDgt).toHaveBeenCalledWith('body');
      expect(result!.portalOrigin).toBe('dgt');
    });

    it('routes citas@sepe.es to parseSepe', () => {
      mockParseSepe.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('body', 'citas@sepe.es');
      expect(mockParseSepe).toHaveBeenCalledWith('body');
      expect(result!.portalOrigin).toBe('sepe');
    });

    it('routes correo@mjusticia.gob.es to parseRegistroCivil', () => {
      mockParseRegistroCivil.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('body', 'correo@mjusticia.gob.es');
      expect(mockParseRegistroCivil).toHaveBeenCalledWith('body');
      expect(result!.portalOrigin).toBe('registro-civil');
    });

    it('routes info@icpplus.es to parseExtranjeria', () => {
      mockParseExtranjeria.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('body', 'info@icpplus.es');
      expect(mockParseExtranjeria).toHaveBeenCalledWith('body');
      expect(result!.portalOrigin).toBe('extranjeria');
    });

    it('routes unknown domain to parseGeneric', () => {
      mockParseGeneric.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('body', 'noreply@unknown-portal.es');
      expect(mockParseGeneric).toHaveBeenCalledWith('body');
      expect(result!.portalOrigin).toBe('unknown');
    });

    it('returns null when parser returns null', () => {
      mockParseGeneric.mockReturnValue(null);
      const result = emailInterceptionService.parseConfirmation('body', 'noreply@unknown.es');
      expect(result).toBeNull();
    });

    it('returns ParsedConfirmation with rawBody and portalOrigin added', () => {
      mockParseAeat.mockReturnValue(baseParsedResult);
      const result = emailInterceptionService.parseConfirmation('the raw body', 'noreply@aeat.es');
      expect(result).toMatchObject({
        ...baseParsedResult,
        rawBody: 'the raw body',
        portalOrigin: 'aeat',
      });
    });
  });

  // ── correlateToBooking() ──────────────────────────────────────────────────

  describe('correlateToBooking()', () => {
    it('returns bookingRequestId when found by externalRef', async () => {
      mockBookingRequestFindFirst.mockResolvedValue({ id: 'booking-123' });
      const result = await emailInterceptionService.correlateToBooking(buildParsed({ confirmationCode: 'ABC-001' }));
      expect(mockBookingRequestFindFirst).toHaveBeenCalledWith({
        where: { externalRef: 'ABC-001' },
        select: { id: true },
      });
      expect(result).toBe('booking-123');
    });

    it('returns bookingRequestId from appointment when externalRef not found', async () => {
      mockBookingRequestFindFirst.mockResolvedValue(null);
      mockAppointmentFindFirst.mockResolvedValue({ bookingRequestId: 'booking-456' });
      const result = await emailInterceptionService.correlateToBooking(buildParsed({ confirmationCode: 'ABC-001' }));
      expect(mockAppointmentFindFirst).toHaveBeenCalledWith({
        where: { confirmationCode: 'ABC-001' },
        select: { bookingRequestId: true },
      });
      expect(result).toBe('booking-456');
    });

    it('returns null when neither externalRef nor appointment match', async () => {
      mockBookingRequestFindFirst.mockResolvedValue(null);
      mockAppointmentFindFirst.mockResolvedValue(null);
      const result = await emailInterceptionService.correlateToBooking(buildParsed());
      expect(result).toBeNull();
    });
  });

  // ── processInboundEmail() ─────────────────────────────────────────────────

  describe('processInboundEmail()', () => {
    it('happy path: parse succeeds + correlation succeeds → CORRELATED, no audit log', async () => {
      mockParseGeneric.mockReturnValue(baseParsedResult);
      mockBookingRequestFindFirst.mockResolvedValue({ id: 'booking-789' });
      mockInterceptedEmailCreate.mockResolvedValue({});

      await emailInterceptionService.processInboundEmail(buildPayload());

      expect(mockInterceptedEmailCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ correlationStatus: 'CORRELATED', bookingRequestId: 'booking-789' }) })
      );
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it('parse succeeds + correlation fails → UNCORRELATED, calls auditService.log', async () => {
      mockParseGeneric.mockReturnValue(baseParsedResult);
      mockBookingRequestFindFirst.mockResolvedValue(null);
      mockAppointmentFindFirst.mockResolvedValue(null);
      mockInterceptedEmailCreate.mockResolvedValue({});

      await emailInterceptionService.processInboundEmail(buildPayload());

      expect(mockInterceptedEmailCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ correlationStatus: 'UNCORRELATED', bookingRequestId: null }) })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPLIANCE_CHECK',
          entityType: 'InterceptedEmail',
          metadata: expect.objectContaining({
            reason: 'Confirmation email could not be correlated to any booking',
          }),
        })
      );
    });

    it('parse fails (returns null) → UNCORRELATED, calls auditService.log', async () => {
      mockParseGeneric.mockReturnValue(null);
      mockInterceptedEmailCreate.mockResolvedValue({});

      await emailInterceptionService.processInboundEmail(buildPayload());

      expect(mockInterceptedEmailCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ correlationStatus: 'UNCORRELATED', bookingRequestId: null }) })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            reason: 'Email could not be parsed as a confirmation',
          }),
        })
      );
    });

    it('parse throws → logs error, creates interceptedEmail with UNCORRELATED', async () => {
      mockParseGeneric.mockImplementation(() => { throw new Error('parse boom'); });
      mockInterceptedEmailCreate.mockResolvedValue({});

      await emailInterceptionService.processInboundEmail(buildPayload());

      expect((logger.error as jest.Mock)).toHaveBeenCalled();
      expect(mockInterceptedEmailCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ correlationStatus: 'UNCORRELATED' }) })
      );
    });
  });

  // ── formatConfirmation() ──────────────────────────────────────────────────

  describe('formatConfirmation()', () => {
    it('includes portal, code, date, time, location when all present', () => {
      const parsed = buildParsed({ portalOrigin: 'aeat', location: 'Delegación Madrid' });
      const output = emailInterceptionService.formatConfirmation(parsed);
      expect(output).toContain('Portal: aeat');
      expect(output).toContain('Código de confirmación: ABC-001');
      expect(output).toContain('Fecha: 2025-06-01');
      expect(output).toContain('Hora: 10:00');
      expect(output).toContain('Ubicación: Delegación Madrid');
    });

    it('omits optional fields (date, time, location) when not present', () => {
      const parsed = buildParsed({ appointmentDate: '', appointmentTime: '', location: undefined });
      const output = emailInterceptionService.formatConfirmation(parsed);
      expect(output).toContain('Portal:');
      expect(output).toContain('Código de confirmación:');
      expect(output).not.toContain('Fecha:');
      expect(output).not.toContain('Hora:');
      expect(output).not.toContain('Ubicación:');
    });
  });
});
