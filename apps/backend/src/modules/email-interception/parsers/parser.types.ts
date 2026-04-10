/**
 * Shared types and helpers for email parsers.
 */

export type EmailType = 'confirmation' | 'cancellation' | 'reminder' | 'unknown';

export interface ParsedEmailResult {
  confirmationCode: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
  emailType?: EmailType;
  tramite?: string;
  nif?: string;
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
    // These patterns must capture the FULL date string as group 1 (used with matchFirst).
    // Long-form "15 de enero de 2026" is handled by parseSpanishDate(body) fallback
    // in each parser — do NOT add multi-group patterns here.
    /fecha[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /d[ií]a[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
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

/**
 * Detect the type of email: confirmation, cancellation, reminder, or unknown.
 * Checks both subject and body text.
 */
export function detectEmailType(subject: string, body: string): EmailType {
  const text = `${subject} ${body}`.toLowerCase();

  const cancellationKeywords = [
    'cancelad', 'cancelaci', 'anulad', 'anulaci', 'cancel·lad',
  ];
  const reminderKeywords = [
    'recordatori', 'recordamos', 'le recordamos', 'reminder',
    'próxima cita', 'proxima cita', 'tiene una cita',
  ];
  const confirmationKeywords = [
    'confirmaci', 'confirmad', 'confirmamos', 'ha sido confirm',
    'cita concedida', 'cita reservada', 'cita previa concedida',
  ];

  if (cancellationKeywords.some((k) => text.includes(k))) return 'cancellation';
  if (reminderKeywords.some((k) => text.includes(k))) return 'reminder';
  if (confirmationKeywords.some((k) => text.includes(k))) return 'confirmation';

  return 'unknown';
}

/**
 * Extract a Spanish NIF/NIE from text.
 * NIF: 8 digits + letter. NIE: X/Y/Z + 7 digits + letter.
 */
export function extractNif(text: string): string | null {
  const nifPattern = /\b(?:NIF|NIE|DNI)[:\s]*([XYZ]?\d{7,8}[A-Z])\b/i;
  const m = text.match(nifPattern);
  if (m) return m[1].toUpperCase();

  // Bare NIF without label
  const barePattern = /\b([XYZ]\d{7}[A-Z]|\d{8}[A-Z])\b/;
  const bare = text.match(barePattern);
  return bare ? bare[1].toUpperCase() : null;
}
