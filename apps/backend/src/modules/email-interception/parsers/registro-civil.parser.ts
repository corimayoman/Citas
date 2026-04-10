/**
 * Parser for Registro Civil (Ministerio de Justicia) confirmation emails.
 * Handles patterns for civil registry appointments (matrimonios, nacimientos, defunciones, etc.).
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
  detectEmailType,
  extractNif,
} from './parser.types';

// ─── Registro Civil-specific patterns ───────────────────────────────────────

const RC_CODE_PATTERNS = [
  /** "Número de expediente: 28-2025-001234" */
  /n[uú]mero\s*(?:de\s*)?expediente[:\s]*([A-Z0-9/-]+)/i,
  /** "Código de registro: RC-MAD-20250312" */
  /c[oó]digo\s*(?:de\s*)?registro[:\s]*([A-Z0-9-]+)/i,
  /** "Número de cita: ..." */
  /n[uú]mero\s*(?:de\s*)?cita[:\s]*([A-Z0-9-]+)/i,
  /** "Referencia del acto: ..." */
  /referencia[^:]*:[:\s]*([A-Z0-9-]+)/i,
  /** "Localizador: ..." */
  /localizador[:\s]*([A-Z0-9-]+)/i,
  ...GENERIC_PATTERNS.confirmationCode,
];

const RC_DATE_PATTERNS = [
  /** "Fecha de la cita: 15/03/2025" or "Fecha: 15/03/2025" */
  /fecha[^:]*:[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  ...GENERIC_PATTERNS.date,
];

const RC_TIME_PATTERNS = [
  /** "Hora de la cita: 10:00" or "Hora: 10:00" */
  /hora[^:]*:[:\s]*(\d{1,2}:\d{2})/i,
  ...GENERIC_PATTERNS.time,
];

const RC_LOCATION_PATTERNS = [
  /** "Registro Civil: Registro Civil de Madrid" — colon required to avoid matching prose */
  /registro\s*civil:\s*(.+?)(?:\n|$)/i,
  /** "Juzgado de Paz: ..." */
  /juzgado[^:]*:\s*(.+?)(?:\n|$)/i,
  /** "Oficina del Registro: ..." */
  /oficina[^:]*:\s*(.+?)(?:\n|$)/i,
  /** "Dirección: ..." */
  /direcci[oó]n:\s*(.+?)(?:\n|$)/i,
  ...GENERIC_PATTERNS.location,
];

const RC_TRAMITE_PATTERNS = [
  /** "Acto registral: Matrimonio civil" */
  /acto[^:]*:[:\s]*(.+?)(?:\n|$)/i,
  /** "Tipo de trámite: Inscripción de nacimiento" */
  /tipo\s*(?:de\s*)?tr[aá]mite[:\s]*(.+?)(?:\n|$)/i,
  /** "Trámite: ..." */
  /tr[aá]mite[:\s]*(.+?)(?:\n|$)/i,
  /** "Gestión: Solicitud de certificado" */
  /gesti[oó]n[:\s]*(.+?)(?:\n|$)/i,
  /** "Motivo de la cita: ..." */
  /motivo[^:]*:[:\s]*(.+?)(?:\n|$)/i,
];

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a Registro Civil confirmation email body.
 * Tries Registro Civil-specific patterns first, then falls back to generic ones.
 * @param body     Plain-text email body.
 * @param subject  Email subject line (used for type detection).
 * @returns Parsed result or null if no confirmation code is found.
 */
export function parseRegistroCivil(body: string, subject = ''): ParsedEmailResult | null {
  const code = matchFirst(body, RC_CODE_PATTERNS);
  if (!code) return null;

  const rawDate = matchFirst(body, RC_DATE_PATTERNS);
  const date = rawDate
    ? (parseSpanishDate(rawDate) ?? rawDate)
    : (parseSpanishDate(body) ?? '');

  const time = matchFirst(body, RC_TIME_PATTERNS) ?? '';
  const location = matchFirst(body, RC_LOCATION_PATTERNS) ?? undefined;
  const tramite = matchFirst(body, RC_TRAMITE_PATTERNS) ?? undefined;
  const nif = extractNif(body) ?? undefined;
  const emailType = detectEmailType(subject, body);

  return {
    confirmationCode: code,
    appointmentDate: date,
    appointmentTime: time,
    location,
    tramite,
    nif,
    emailType,
  };
}
