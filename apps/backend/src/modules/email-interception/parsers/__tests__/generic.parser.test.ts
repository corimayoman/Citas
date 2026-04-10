import { parseGeneric } from '../generic.parser';

describe('parseGeneric', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── No code found ────────────────────────────────────────────────────────

  it('returns null when no confirmation code found', () => {
    const body = 'Este es un correo informativo sin ningún código de cita ni referencia.';
    expect(parseGeneric(body)).toBeNull();
  });

  // ─── Full parse with código de confirmación ───────────────────────────────

  it('parses código de confirmación, fecha, hora and location', () => {
    const body = `
Estimado ciudadano,

Su cita ha sido confirmada.

Código de confirmación: CONF-20250515-099
Fecha: 15/05/2025
Hora: 11:30
Lugar: Oficina Central de Servicios, Planta 2

Muchas gracias.
    `.trim();

    const result = parseGeneric(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('CONF-20250515-099');
    expect(result!.appointmentDate).toBe('2025-05-15');
    expect(result!.appointmentTime).toBe('11:30');
    expect(result!.location).toMatch(/Oficina Central/i);
  });

  // ─── Número de referencia pattern ────────────────────────────────────────

  it('parses número de referencia as confirmation code', () => {
    const body = `
Número de referencia: REF-XYZ-001
Fecha: 22/07/2025
Hora: 09:45
    `.trim();

    const result = parseGeneric(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('REF-XYZ-001');
  });

  // ─── Date defaults to empty string when not found ─────────────────────────

  it('date defaults to empty string when no date pattern matches', () => {
    const body = `
Código de confirmación: CODE-001
Hora: 10:00
Sin información de fecha.
    `.trim();

    const result = parseGeneric(body);
    expect(result).not.toBeNull();
    expect(result!.appointmentDate).toBe('');
  });

  // ─── Location is undefined when no location pattern matches ───────────────

  it('location is undefined when no location pattern matches', () => {
    // Body intentionally avoids keywords: lugar, ubicación, dirección, oficina, sede, centro
    const body = `
Código de confirmación: CODE-002
Fecha: 01/01/2026
Hora: 08:00
Sin datos adicionales sobre el punto de atención.
    `.trim();

    const result = parseGeneric(body);
    expect(result).not.toBeNull();
    expect(result!.location).toBeUndefined();
  });
});
