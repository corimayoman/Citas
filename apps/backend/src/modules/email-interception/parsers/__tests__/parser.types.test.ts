import {
  matchFirst,
  parseSpanishDate,
  detectEmailType,
  extractNif,
  GENERIC_PATTERNS,
} from '../parser.types';

describe('matchFirst', () => {
  it('returns the first capture group of the first matching pattern', () => {
    const result = matchFirst('referencia: ABC-123', GENERIC_PATTERNS.confirmationCode);
    expect(result).toBe('ABC-123');
  });

  it('tries patterns in order and uses the first match', () => {
    const patterns = [/foo: (\w+)/i, /bar: (\w+)/i];
    expect(matchFirst('bar: HELLO', patterns)).toBe('HELLO');
    expect(matchFirst('foo: WORLD', patterns)).toBe('WORLD');
  });

  it('returns null when no pattern matches', () => {
    expect(matchFirst('nothing here', GENERIC_PATTERNS.confirmationCode)).toBeNull();
  });
});

describe('parseSpanishDate', () => {
  it('parses dd/mm/yyyy format', () => {
    expect(parseSpanishDate('12/03/2025')).toBe('2025-03-12');
  });

  it('parses dd-mm-yyyy format', () => {
    expect(parseSpanishDate('05-06-2025')).toBe('2025-06-05');
  });

  it('parses two-digit year as 20xx', () => {
    expect(parseSpanishDate('01/01/25')).toBe('2025-01-01');
  });

  it('parses long-form Spanish date', () => {
    expect(parseSpanishDate('12 de marzo de 2025')).toBe('2025-03-12');
    expect(parseSpanishDate('1 de enero de 2026')).toBe('2026-01-01');
    expect(parseSpanishDate('31 de diciembre de 2025')).toBe('2025-12-31');
  });

  it('returns null for unrecognized date formats', () => {
    expect(parseSpanishDate('no date here')).toBeNull();
  });
});

describe('detectEmailType', () => {
  it('returns confirmation for confirmation keywords', () => {
    expect(detectEmailType('Confirmación de cita', 'cita concedida')).toBe('confirmation');
    expect(detectEmailType('', 'Su cita ha sido confirmada')).toBe('confirmation');
  });

  it('returns cancellation for cancellation keywords', () => {
    expect(detectEmailType('Cancelación de cita', '')).toBe('cancellation');
    expect(detectEmailType('', 'Su cita ha sido anulada')).toBe('cancellation');
  });

  it('returns reminder for reminder keywords', () => {
    expect(detectEmailType('Recordatorio de cita', '')).toBe('reminder');
    expect(detectEmailType('', 'Le recordamos que tiene una cita')).toBe('reminder');
  });

  it('prioritises cancellation over reminder', () => {
    expect(detectEmailType('cancelad', 'recordatori')).toBe('cancellation');
  });

  it('returns unknown when no keyword matches', () => {
    expect(detectEmailType('Información general', 'texto sin palabras clave')).toBe('unknown');
  });
});

describe('extractNif', () => {
  it('extracts NIF with label', () => {
    expect(extractNif('NIF: 12345678A')).toBe('12345678A');
    expect(extractNif('DNI: 87654321Z')).toBe('87654321Z');
  });

  it('extracts NIE with label', () => {
    expect(extractNif('NIE: X1234567B')).toBe('X1234567B');
    expect(extractNif('NIE: Y9876543C')).toBe('Y9876543C');
  });

  it('extracts bare NIF without label', () => {
    expect(extractNif('Solicitante: 12345678A en Madrid')).toBe('12345678A');
  });

  it('extracts bare NIE without label', () => {
    expect(extractNif('X1234567A es el titular')).toBe('X1234567A');
  });

  it('returns null when no NIF/NIE is present', () => {
    expect(extractNif('No hay identificadores aquí')).toBeNull();
  });
});
