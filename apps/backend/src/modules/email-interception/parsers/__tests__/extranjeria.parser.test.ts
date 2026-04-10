import { parseExtranjeria } from '../extranjeria.parser';

describe('parseExtranjeria', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── No code found ────────────────────────────────────────────────────────

  it('returns null when no confirmation code found', () => {
    // Body avoids all trigger words: expediente, confirmación, referencia, confirmation
    const body = 'Correo meramente informativo. Por favor, revise su documentación.';
    expect(parseExtranjeria(body)).toBeNull();
  });

  // ─── Número de expediente ─────────────────────────────────────────────────

  it('parses número de expediente as confirmation code', () => {
    // Use "Fecha:" (without extra words) so the generic date pattern matches
    const body = `
Estimado/a ciudadano/a,

Su cita en la Oficina de Extranjería ha sido confirmada.

Número de expediente: EXP-MAD-2025-00123
Fecha: 20/03/2025
Hora: 10:00
Oficina: Oficina de Extranjería de Madrid
    `.trim();

    const result = parseExtranjeria(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('EXP-MAD-2025-00123');
    expect(result!.appointmentDate).toBe('2025-03-20');
    expect(result!.appointmentTime).toBe('10:00');
  });

  // ─── Código de confirmación pattern ──────────────────────────────────────

  it('parses código de confirmación pattern', () => {
    const body = `
Código de confirmación: ICPP-2025-XYZ99
Fecha: 05/09/2025
Hora: 12:15
Lugar: Comisaría Provincial de Extranjería
    `.trim();

    const result = parseExtranjeria(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('ICPP-2025-XYZ99');
  });

  // ─── Date and time parsing ────────────────────────────────────────────────

  it('parses date and time from the email body', () => {
    // Simple "Fecha:" format is matched by GENERIC_PATTERNS.date
    const body = `
Número de expediente: EXP-0001
Fecha: 10/11/2025
Hora: 09:30
    `.trim();

    const result = parseExtranjeria(body);
    expect(result).not.toBeNull();
    expect(result!.appointmentDate).toBe('2025-11-10');
    expect(result!.appointmentTime).toBe('09:30');
  });

  // ─── Falls back to generic patterns for date/location ────────────────────

  it('falls back to generic patterns for date and location when extranjería-specific fields are absent', () => {
    const body = `
Código de confirmación: GEN-FALLBACK-001
Día: 25/12/2025
Horario: 14:00
Sede: Delegación del Gobierno de Madrid
    `.trim();

    const result = parseExtranjeria(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('GEN-FALLBACK-001');
    // Generic date pattern (día:) should still be picked up
    expect(result!.appointmentDate).toBe('2025-12-25');
    // Generic time pattern (horario:) should still be picked up
    expect(result!.appointmentTime).toBe('14:00');
    // Generic location pattern (sede:) should still be picked up
    expect(result!.location).toMatch(/Delegaci[oó]n/i);
  });
});
