/**
 * Parser for SEPE portal confirmation emails.
 * Wraps the generic parser with SEPE-specific patterns.
 * TODO: Add SEPE-specific patterns once real email samples are available.
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
} from './parser.types';

/**
 * Parse a SEPE confirmation email body.
 * Tries SEPE-specific patterns first, then falls back to generic ones.
 * @returns parsed result or null if no confirmation code is found.
 */
export function parseSepe(body: string): ParsedEmailResult | null {
  const code = matchFirst(body, [
    /n[uú]mero\s*(?:de\s*)?cita[:\s]*([A-Z0-9-]+)/i,
    /c[oó]digo\s*(?:de\s*)?prestaci[oó]n[:\s]*([A-Z0-9-]+)/i,
    ...GENERIC_PATTERNS.confirmationCode,
  ]);
  if (!code) return null;

  const rawDate = matchFirst(body, GENERIC_PATTERNS.date);
  const date = rawDate ? (parseSpanishDate(rawDate) ?? rawDate) : '';
  const time = matchFirst(body, GENERIC_PATTERNS.time) ?? '';
  const location = matchFirst(body, GENERIC_PATTERNS.location) ?? undefined;

  return { confirmationCode: code, appointmentDate: date, appointmentTime: time, location };
}
