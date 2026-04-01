/**
 * Generic parser for Spanish government portal confirmation emails.
 * Handles common patterns found across multiple portals (DGT, AEAT, SEPE, Registro Civil, etc.).
 */
import {
  ParsedEmailResult,
  GENERIC_PATTERNS,
  matchFirst,
  parseSpanishDate,
} from './parser.types';

/**
 * Parse a generic Spanish government confirmation email body.
 * Uses common patterns for confirmation codes, dates, times and locations.
 * @returns parsed result or null if no confirmation code is found.
 */
export function parseGeneric(body: string): ParsedEmailResult | null {
  const code = matchFirst(body, GENERIC_PATTERNS.confirmationCode);
  if (!code) return null;

  const rawDate = matchFirst(body, GENERIC_PATTERNS.date);
  const date = rawDate ? (parseSpanishDate(rawDate) ?? rawDate) : '';
  const time = matchFirst(body, GENERIC_PATTERNS.time) ?? '';
  const location = matchFirst(body, GENERIC_PATTERNS.location) ?? undefined;

  return { confirmationCode: code, appointmentDate: date, appointmentTime: time, location };
}
