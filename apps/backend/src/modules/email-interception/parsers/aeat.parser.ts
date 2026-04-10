/**
 * Parser for AEAT (Agencia Tributaria) confirmation emails.
 * Handles patterns specific to AEAT appointment confirmation, cancellation and reminder emails.
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
  detectEmailType,
  extractNif,
} from './parser.types';

// ─── AEAT-specific patterns ──────────────────────────────────────────────────

const AEAT_CODE_PATTERNS = [
  /** "Número de justificante: ABC123" */
  /n[uú]mero\s*(?:de\s*)?justificante[:\s]*([A-Z0-9-]+)/i,
  /** "Localizador: XYZ-9876" */
  /localizador[:\s]*([A-Z0-9-]+)/i,
  /** "Clave de confirmación: ABC1234" */
  /clave\s*(?:de\s*)?confirmaci[oó]n[:\s]*([A-Z0-9-]+)/i,
  /** "Número de cita: 20250312-001" */
  /n[uú]mero\s*(?:de\s*)?cita[:\s]*([A-Z0-9-]+)/i,
  ...GENERIC_PATTERNS.confirmationCode,
];

/**
 * Date patterns that capture the full date string as group 1.
 * Used with matchFirst → parseSpanishDate pipeline.
 */
const AEAT_DATE_PATTERNS = [
  /** "Fecha de la cita: 12/03/2025" or "Fecha: 12/03/2025" */
  /fecha[^:]*:[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  /** Generic date patterns */
  ...GENERIC_PATTERNS.date,
];

const AEAT_TIME_PATTERNS = [
  /** "Hora de la cita: 10:30" or "Hora: 10:30" */
  /hora[^:]*:[:\s]*(\d{1,2}:\d{2})/i,
  ...GENERIC_PATTERNS.time,
];

const AEAT_LOCATION_PATTERNS = [
  /** "Delegación: Delegación Especial de Madrid" */
  /delegaci[oó]n[:\s]*(.+?)(?:\n|$)/i,
  /** "Administración: Administración de Arganzuela" */
  /administraci[oó]n[:\s]*(.+?)(?:\n|$)/i,
  /** "Oficina: ..." */
  /oficina[:\s]*(.+?)(?:\n|$)/i,
  ...GENERIC_PATTERNS.location,
];

const AEAT_TRAMITE_PATTERNS = [
  /** "Trámite: Declaración de la Renta" */
  /tr[aá]mite[:\s]*(.+?)(?:\n|$)/i,
  /** "Gestión: ..." */
  /gesti[oó]n[:\s]*(.+?)(?:\n|$)/i,
  /** "Servicio: ..." */
  /servicio[:\s]*(.+?)(?:\n|$)/i,
  /** "Motivo de la cita: ..." */
  /motivo[^:]*:[:\s]*(.+?)(?:\n|$)/i,
];

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse an AEAT confirmation email body.
 * Tries AEAT-specific patterns first, then falls back to generic ones.
 * @param body     Plain-text email body.
 * @param subject  Email subject line (used for type detection).
 * @returns Parsed result or null if no confirmation code is found.
 */
export function parseAeat(body: string, subject = ''): ParsedEmailResult | null {
  const code = matchFirst(body, AEAT_CODE_PATTERNS);
  if (!code) return null;

  // Try numeric date patterns first; if none found, try long-form directly on body
  const rawDate = matchFirst(body, AEAT_DATE_PATTERNS);
  const date = rawDate
    ? (parseSpanishDate(rawDate) ?? rawDate)
    : (parseSpanishDate(body) ?? '');

  const time = matchFirst(body, AEAT_TIME_PATTERNS) ?? '';
  const location = matchFirst(body, AEAT_LOCATION_PATTERNS) ?? undefined;
  const tramite = matchFirst(body, AEAT_TRAMITE_PATTERNS) ?? undefined;
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
