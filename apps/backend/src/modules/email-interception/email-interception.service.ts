import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { auditService } from '../audit/audit.service';
import { parseExtranjeria } from './parsers/extranjeria.parser';
import { parseGeneric } from './parsers/generic.parser';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface InboundEmailPayload {
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Raw HTML body if available */
  html?: string;
}

export interface ParsedConfirmation {
  confirmationCode: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
  rawBody: string;
  portalOrigin: string;
}

type CorrelationStatus = 'PENDING' | 'CORRELATED' | 'UNCORRELATED';

// ─── Domain helpers ──────────────────────────────────────────────────────────

/** Extract domain from an email address (e.g. "noreply@extranjeria.gob.es" → "extranjeria.gob.es") */
function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return email.toLowerCase().trim();
  return email.slice(atIndex + 1).toLowerCase().trim();
}

/** Map a sender domain to a known portal origin key */
function domainToPortalOrigin(domain: string): string {
  if (domain.includes('extranjeria') || domain.includes('icpplus') || domain.includes('administracionespublicas')) {
    return 'extranjeria';
  }
  if (domain.includes('dgt')) return 'dgt';
  if (domain.includes('agenciatributaria') || domain.includes('aeat')) return 'aeat';
  if (domain.includes('sepe')) return 'sepe';
  if (domain.includes('mjusticia') || domain.includes('registro')) return 'registro-civil';
  return 'unknown';
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const emailInterceptionService = {
  /**
   * Main entry point — orchestrates parsing, persistence and correlation.
   */
  async processInboundEmail(payload: InboundEmailPayload): Promise<void> {
    const domain = extractDomain(payload.from);
    const portalOrigin = domainToPortalOrigin(domain);

    logger.info('Processing inbound email', { from: payload.from, subject: payload.subject, portalOrigin });

    let parsed: ParsedConfirmation | null = null;
    let correlationStatus: CorrelationStatus = 'PENDING';
    let bookingRequestId: string | null = null;

    try {
      parsed = emailInterceptionService.parseConfirmation(payload.body, payload.from);
    } catch (err) {
      logger.error('Failed to parse confirmation email', { error: err, from: payload.from });
    }

    if (parsed) {
      bookingRequestId = await emailInterceptionService.correlateToBooking(parsed);
      correlationStatus = bookingRequestId ? 'CORRELATED' : 'UNCORRELATED';
    } else {
      correlationStatus = 'UNCORRELATED';
    }

    // Persist the intercepted email
    await prisma.interceptedEmail.create({
      data: {
        bookingRequestId,
        fromAddress: payload.from,
        subject: payload.subject,
        rawBody: payload.body,
        parsedData: parsed ? JSON.parse(JSON.stringify(parsed)) : undefined,
        portalOrigin,
        correlationStatus,
        processedAt: new Date(),
      },
    });

    // If correlation failed, register anomaly in audit log
    if (correlationStatus === 'UNCORRELATED') {
      await auditService.log({
        action: 'COMPLIANCE_CHECK',
        entityType: 'InterceptedEmail',
        metadata: {
          reason: parsed
            ? 'Confirmation email could not be correlated to any booking'
            : 'Email could not be parsed as a confirmation',
          from: payload.from,
          subject: payload.subject,
          portalOrigin,
          confirmationCode: parsed?.confirmationCode ?? null,
        },
      });
      logger.warn('Inbound email could not be correlated', { from: payload.from, portalOrigin });
    }
  },

  /**
   * Delegates to the appropriate parser based on the sender's domain.
   */
  parseConfirmation(body: string, from: string): ParsedConfirmation | null {
    const domain = extractDomain(from);
    const portalOrigin = domainToPortalOrigin(domain);

    let result: Omit<ParsedConfirmation, 'rawBody' | 'portalOrigin'> | null = null;

    switch (portalOrigin) {
      case 'extranjeria':
        result = parseExtranjeria(body);
        break;
      case 'dgt':
      case 'aeat':
      case 'sepe':
      case 'registro-civil':
        // Future: dedicated parsers per portal. For now, use generic.
        result = parseGeneric(body);
        break;
      default:
        result = parseGeneric(body);
        break;
    }

    if (!result) return null;

    return {
      ...result,
      rawBody: body,
      portalOrigin,
    };
  },

  /**
   * Finds the matching BookingRequest by confirmationCode (externalRef or Appointment.confirmationCode).
   */
  async correlateToBooking(parsed: ParsedConfirmation): Promise<string | null> {
    if (!parsed.confirmationCode) return null;

    // Try matching by BookingRequest.externalRef
    const byExternalRef = await prisma.bookingRequest.findFirst({
      where: { externalRef: parsed.confirmationCode },
      select: { id: true },
    });
    if (byExternalRef) return byExternalRef.id;

    // Try matching by Appointment.confirmationCode
    const byAppointment = await prisma.appointment.findFirst({
      where: { confirmationCode: parsed.confirmationCode },
      select: { bookingRequestId: true },
    });
    if (byAppointment) return byAppointment.bookingRequestId;

    return null;
  },

  /**
   * Formats parsed confirmation data into a human-readable string for storage/display.
   */
  formatConfirmation(parsed: ParsedConfirmation): string {
    const lines: string[] = [
      `Portal: ${parsed.portalOrigin}`,
      `Código de confirmación: ${parsed.confirmationCode}`,
    ];
    if (parsed.appointmentDate) lines.push(`Fecha: ${parsed.appointmentDate}`);
    if (parsed.appointmentTime) lines.push(`Hora: ${parsed.appointmentTime}`);
    if (parsed.location) lines.push(`Ubicación: ${parsed.location}`);
    return lines.join('\n');
  },
};
