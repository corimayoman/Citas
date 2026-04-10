import { parseAeat } from '../aeat.parser';

describe('parseAeat', () => {
  // ─── Basic confirmation with justificante number ───────────────────────────

  it('parses a confirmation email with numero de justificante', () => {
    const body = `
Estimado contribuyente,

Le confirmamos su cita previa en la Agencia Tributaria.

Número de justificante: JUS-20250312-001
Fecha de la cita: 12/03/2025
Hora de la cita: 10:30
Delegación: Delegación Especial de Madrid - Administración de Arganzuela
Trámite: Declaración de la Renta 2024
NIF: 12345678A

Por favor, acuda con su documento de identidad.
    `.trim();

    const result = parseAeat(body, 'Confirmación de cita - Agencia Tributaria');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('JUS-20250312-001');
    expect(result!.appointmentDate).toBe('2025-03-12');
    expect(result!.appointmentTime).toBe('10:30');
    expect(result!.location).toMatch(/Delegaci[oó]n/i);
    expect(result!.tramite).toMatch(/Renta/i);
    expect(result!.nif).toBe('12345678A');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Localizador pattern ───────────────────────────────────────────────────

  it('parses a confirmation email with localizador', () => {
    const body = `
Cita concedida

Localizador: AEAT-XYZ-9876
Fecha: 05/06/2025
Hora: 09:15
Oficina: Administración de Pozuelo de Alarcón
Gestión: Obtención de certificado tributario
    `.trim();

    const result = parseAeat(body, 'Cita concedida en AEAT');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('AEAT-XYZ-9876');
    expect(result!.appointmentDate).toBe('2025-06-05');
    expect(result!.appointmentTime).toBe('09:15');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Long-form Spanish date ────────────────────────────────────────────────

  it('parses a long-form Spanish date', () => {
    const body = `
Número de justificante: J12345
Le atenderemos el 15 de enero de 2026 a las 11:00
Delegación: Administración de Getafe
    `.trim();

    const result = parseAeat(body);
    expect(result!.appointmentDate).toBe('2026-01-15');
    expect(result!.appointmentTime).toBe('11:00');
  });

  // ─── Generic confirmation code fallback ───────────────────────────────────

  it('falls back to generic confirmation code pattern', () => {
    const body = `
Código de confirmación: ABC123
Fecha: 20/07/2025
Hora: 12:00
    `.trim();

    const result = parseAeat(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('ABC123');
  });

  // ─── Cancellation detection ───────────────────────────────────────────────

  it('detects cancellation email type', () => {
    const body = `
Su cita ha sido cancelada.
Número de justificante: J99999
Fecha: 10/04/2025
Hora: 10:00
    `.trim();

    const result = parseAeat(body, 'Cancelación de cita - Agencia Tributaria');
    expect(result!.emailType).toBe('cancellation');
  });

  // ─── Reminder detection ───────────────────────────────────────────────────

  it('detects reminder email type', () => {
    const body = `
Le recordamos que tiene una cita programada.
Número de justificante: J77777
Fecha: 10/04/2025
Hora: 10:00
    `.trim();

    const result = parseAeat(body, 'Recordatorio de cita');
    expect(result!.emailType).toBe('reminder');
  });

  // ─── Returns null when no code found ─────────────────────────────────────

  it('returns null when no confirmation code is found', () => {
    const body = `
Este es un email de información general.
No contiene código de cita.
    `.trim();

    expect(parseAeat(body)).toBeNull();
  });

  // ─── NIE extraction ───────────────────────────────────────────────────────

  it('extracts NIE from email body', () => {
    const body = `
Número de justificante: J54321
NIE: X1234567A
Fecha: 01/01/2026
Hora: 08:00
    `.trim();

    const result = parseAeat(body);
    expect(result!.nif).toBe('X1234567A');
  });
});
