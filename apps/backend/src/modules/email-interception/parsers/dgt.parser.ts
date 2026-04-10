/**
 * Parser for DGT (Dirección General de Tráfico) confirmation emails.
 * Handles patterns specific to DGT appointment emails (permisos, vehículos, jefaturas).
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
  detectEmailType,
  extractNif,
} from './parser.types';

// ─── DGT-specific patterns ───────────────────────────────────────────────────

const DGT_CODE_PATTERNS = [
  /** "Número de cita: DGT20250312001" */
  /n[uú]mero\s*(?:de\s*)?cita[:\s]*([A-Z0-9-]+)/i,
  /** "Código de cita previa: CP-2025-001234" */
  /c[oó]digo\s*(?:de\s*)?cita\s*previa[:\s]*([A-Z0-9-]+)/i,
  /** "Localizador DGT: 20250312-001" */
  /localizador[^:]*:[:\s]*([A-Z0-9-]+)/i,
  /** "Referencia de cita: ..." */
  /referencia[^:]*:[:\s]*([A-Z0-9-]+)/i,
  ...GENERIC_PATTERNS.confirmationCode,
];

const DGT_DATE_PATTERNS = [
  /** "Fecha de la cita: 12/03/2025" or "Fecha: 12/03/2025" */
  /fecha[^:]*:[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  ...GENERIC_PATTERNS.date,
];

const DGT_TIME_PATTERNS = [
  /** "Hora de la cita: 11:00" or "Hora: 11:00" */
  /hora[^:]*:[:\s]*(\d{1,2}:\d{2})/i,
  ...GENERIC_PATTERNS.time,
];

const DGT_LOCATION_PATTERNS = [
  /** "Jefatura Provincial de Tráfico: Jefatura de Madrid" */
  /jefatura[^:]*:[:\s]*(.+?)(?:\n|$)/i,
  /** "Oficina de Tráfico: ..." */
  /oficina[^:]*:[:\s]*(.+?)(?:\n|$)/i,
  /** "Dirección: ..." */
  /direcci[oó]n[:\s]*(.+?)(?:\n|$)/i,
  ...GENERIC_PATTERNS.location,
];

const DGT_TRAMITE_PATTERNS = [
  /** "Trámite: Canje de permiso de conducción" */
  /tr[aá]mite[:\s]*(.+?)(?:\n|$)/i,
  /** "Tipo de trámite: ..." */
  /tipo\s*(?:de\s*)?tr[aá]mite[:\s]*(.+?)(?:\n|$)/i,
  /** "Gestión: Renovación de permiso" */
  /gesti[oó]n[:\s]*(.+?)(?:\n|$)/i,
  /** "Servicio solicitado: ..." */
  /servicio[^:]*:[:\s]*(.+?)(?:\n|$)/i,
  /** "Motivo de la cita: ..." */
  /motivo[^:]*:[:\s]*(.+?)(?:\n|$)/i,
];

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a DGT confirmation email body.
 * Tries DGT-specific patterns first, then falls back to generic ones.
 * @param body     Plain-text email body.
 * @param subject  Email subject line (used for type detection).
 * @returns Parsed result or null if no confirmation code is found.
 */
export function parseDgt(body: string, subject = ''): ParsedEmailResult | null {
  const code = matchFirst(body, DGT_CODE_PATTERNS);
  if (!code) return null;

  const rawDate = matchFirst(body, DGT_DATE_PATTERNS);
  const date = rawDate
    ? (parseSpanishDate(rawDate) ?? rawDate)
    : (parseSpanishDate(body) ?? '');

  const time = matchFirst(body, DGT_TIME_PATTERNS) ?? '';
  const location = matchFirst(body, DGT_LOCATION_PATTERNS) ?? undefined;
  const tramite = matchFirst(body, DGT_TRAMITE_PATTERNS) ?? undefined;
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
