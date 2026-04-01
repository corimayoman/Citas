/**
 * Parser for Extranjería portal confirmation emails.
 * Handles patterns specific to Extranjería emails (expediente numbers, specific date formats).
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
} from './parser.types';

/**
 * Parse an Extranjería confirmation email body.
 * Tries Extranjería-specific patterns first (expediente numbers), then falls back to generic ones.
 * @returns parsed result or null if no confirmation code is found.
 */
export function parseExtranjeria(body: string): ParsedEmailResult | null {
  const code = matchFirst(body, [
    /c[oó]digo\s*(?:de\s*)?confirmaci[oó]n[:\s]*([A-Z0-9-]+)/i,
    /n[uú]mero\s*(?:de\s*)?expediente[:\s]*([A-Z0-9-]+)/i,
    ...GENERIC_PATTERNS.confirmationCode,
  ]);
  if (!code) return null;

  const rawDate = matchFirst(body, GENERIC_PATTERNS.date);
  const date = rawDate ? (parseSpanishDate(rawDate) ?? rawDate) : '';
  const time = matchFirst(body, GENERIC_PATTERNS.time) ?? '';
  const location = matchFirst(body, GENERIC_PATTERNS.location) ?? undefined;

  return { confirmationCode: code, appointmentDate: date, appointmentTime: time, location };
}
