/**
 * Parser for Registro Civil portal confirmation emails.
 * Wraps the generic parser with Registro Civil-specific patterns.
 * TODO: Add Registro Civil-specific patterns once real email samples are available.
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
} from './parser.types';

/**
 * Parse a Registro Civil confirmation email body.
 * Tries Registro Civil-specific patterns first, then falls back to generic ones.
 * @returns parsed result or null if no confirmation code is found.
 */
export function parseRegistroCivil(body: string): ParsedEmailResult | null {
  const code = matchFirst(body, [
    /n[uú]mero\s*(?:de\s*)?expediente[:\s]*([A-Z0-9-]+)/i,
    /c[oó]digo\s*(?:de\s*)?registro[:\s]*([A-Z0-9-]+)/i,
    ...GENERIC_PATTERNS.confirmationCode,
  ]);
  if (!code) return null;

  const rawDate = matchFirst(body, GENERIC_PATTERNS.date);
  const date = rawDate ? (parseSpanishDate(rawDate) ?? rawDate) : '';
  const time = matchFirst(body, GENERIC_PATTERNS.time) ?? '';
  const location = matchFirst(body, GENERIC_PATTERNS.location) ?? undefined;

  return { confirmationCode: code, appointmentDate: date, appointmentTime: time, location };
}
