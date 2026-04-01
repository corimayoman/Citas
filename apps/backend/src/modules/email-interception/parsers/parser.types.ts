/**
 * Shared types and helpers for email parsers.
 */

export interface ParsedEmailResult {
  confirmationCode: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
}

/**
 * Generic confirmation code patterns found across Spanish government portals.
 */
export const GENERIC_PATTERNS = {
  confirmationCode: [
    /c[oó]digo\s*(?:de\s*)?confirmaci[oó]n[:\s]*([A-Z0-9-]+)/i,
    /n[uú]mero\s*(?:de\s*)?referencia[:\s]*([A-Z0-9-]+)/i,
    /referencia[:\s]*([A-Z0-9-]+)/i,
    /confirmation[:\s]*([A-Z0-9-]+)/i,
  ],
  date: [
    /fecha[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /d[ií]a[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i,
  ],
  time: [
    /hora[:\s]*(\d{1,2}:\d{2})/i,
    /horario[:\s]*(\d{1,2}:\d{2})/i,
    /a\s+las\s+(\d{1,2}:\d{2})/i,
  ],
  location: [
    /(?:lugar|ubicaci[oó]n|direcci[oó]n|oficina)[:\s]*(.+?)(?:\n|$)/i,
    /(?:sede|centro)[:\s]*(.+?)(?:\n|$)/i,
  ],
};

const MONTH_MAP: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

/** Try each pattern in order and return the first capture group match, or null. */
export function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

/** Parse a Spanish-format date string into ISO yyyy-MM-dd. */
export function parseSpanishDate(text: string): string | null {
  // Try dd/mm/yyyy or dd-mm-yyyy
  const numericMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numericMatch) {
    const day = numericMatch[1].padStart(2, '0');
    const month = numericMatch[2].padStart(2, '0');
    let year = numericMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Try "12 de enero de 2025"
  const longMatch = text.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i);
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0');
    const month = MONTH_MAP[longMatch[2].toLowerCase()];
    const year = longMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  return null;
}
