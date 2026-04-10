/**
 * Parser for SEPE (Servicio Público de Empleo Estatal) confirmation emails.
 * Handles patterns specific to SEPE appointment emails.
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
  detectEmailType,
  extractNif,
} from './parser.types';

// ─── SEPE-specific patterns ──────────────────────────────────────────────────

const SEPE_CODE_PATTERNS = [
  /** "Número de cita: 2025031200001" */
  /n[uú]mero\s*(?:de\s*)?cita[:\s]*([A-Z0-9-]+)/i,
  /** "Código de prestación: P-20250312-001" */
  /c[oó]digo\s*(?:de\s*)?prestaci[oó]n[:\s]*([A-Z0-9-]+)/i,
  /** "Identificador de cita: ..." */
  /identificador[^:]*:[:\s]*([A-Z0-9-]+)/i,
  /** "Referencia: ..." */
  /referencia\s*(?:de\s*cita)?[:\s]*([A-Z0-9-]+)/i,
  ...GENERIC_PATTERNS.confirmationCode,
];

const SEPE_DATE_PATTERNS = [
  /** "Fecha de la cita: 12/03/2025" or "Fecha: 12/03/2025" */
  /fecha[^:]*:[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  ...GENERIC_PATTERNS.date,
];

const SEPE_TIME_PATTERNS = [
  /** "Hora de la cita: 09:00" or "Hora: 09:00" */
  /hora[^:]*:[:\s]*(\d{1,2}:\d{2})/i,
  ...GENERIC_PATTERNS.time,
];

const SEPE_LOCATION_PATTERNS = [
  /** "Oficina de empleo: Oficina de Empleo de Leganés" — colon required to avoid matching prose */
  /oficina\s*(?:de\s*empleo)?:\s*(.+?)(?:\n|$)/i,
  /** "Dirección de la oficina: Calle ..." */
  /direcci[oó]n[^:]*:\s*(.+?)(?:\n|$)/i,
  ...GENERIC_PATTERNS.location,
];

const SEPE_TRAMITE_PATTERNS = [
  /** "Trámite: Renovación de demanda" — checked first to avoid false matches inside prose */
  /tr[aá]mite:\s*(.+?)(?:\n|$)/i,
  /** "Prestación: Subsidio por desempleo" — colon required */
  /prestaci[oó]n:\s*(.+?)(?:\n|$)/i,
  /** "Motivo: ..." */
  /motivo:\s*(.+?)(?:\n|$)/i,
  /** "Tipo de gestión: ..." */
  /tipo\s*(?:de\s*)?gesti[oó]n:\s*(.+?)(?:\n|$)/i,
];

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a SEPE confirmation email body.
 * Tries SEPE-specific patterns first, then falls back to generic ones.
 * @param body     Plain-text email body.
 * @param subject  Email subject line (used for type detection).
 * @returns Parsed result or null if no confirmation code is found.
 */
export function parseSepe(body: string, subject = ''): ParsedEmailResult | null {
  const code = matchFirst(body, SEPE_CODE_PATTERNS);
  if (!code) return null;

  const rawDate = matchFirst(body, SEPE_DATE_PATTERNS);
  const date = rawDate
    ? (parseSpanishDate(rawDate) ?? rawDate)
    : (parseSpanishDate(body) ?? '');

  const time = matchFirst(body, SEPE_TIME_PATTERNS) ?? '';
  const location = matchFirst(body, SEPE_LOCATION_PATTERNS) ?? undefined;
  const tramite = matchFirst(body, SEPE_TRAMITE_PATTERNS) ?? undefined;
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
