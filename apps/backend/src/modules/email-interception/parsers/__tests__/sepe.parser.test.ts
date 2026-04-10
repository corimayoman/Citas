import { parseSepe } from '../sepe.parser';

describe('parseSepe', () => {
  // ─── Basic confirmation with numero de cita ────────────────────────────────

  it('parses a confirmation email with numero de cita', () => {
    const body = `
Estimado/a ciudadano/a,

Le confirmamos su cita en la Oficina de Empleo.

Número de cita: SEPE-2025031200001
Fecha de la cita: 12/03/2025
Hora de la cita: 09:00
Oficina de empleo: Oficina de Empleo de Leganés
Dirección: Calle del Trabajo, 10, 28911 Leganés
Trámite: Solicitud de prestación por desempleo
NIF: 12345678Z

Recuerde traer su documentación completa.
    `.trim();

    const result = parseSepe(body, 'Confirmación de cita - SEPE');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('SEPE-2025031200001');
    expect(result!.appointmentDate).toBe('2025-03-12');
    expect(result!.appointmentTime).toBe('09:00');
    expect(result!.location).toMatch(/empleo/i);
    expect(result!.tramite).toMatch(/prestaci[oó]n/i);
    expect(result!.nif).toBe('12345678Z');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Código de prestación pattern ─────────────────────────────────────────

  it('parses email with código de prestación', () => {
    const body = `
Cita concedida.

Código de prestación: P-20250601-007
Fecha: 01/06/2025
Hora: 11:30
Oficina: Oficina de Empleo de Vallecas
Tipo de gestión: Renovación de demanda de empleo
    `.trim();

    const result = parseSepe(body, 'SEPE - Cita concedida');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('P-20250601-007');
    expect(result!.appointmentDate).toBe('2025-06-01');
    expect(result!.appointmentTime).toBe('11:30');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Long-form Spanish date ────────────────────────────────────────────────

  it('parses long-form Spanish date', () => {
    const body = `
Número de cita: C-98765
Le esperamos el 3 de julio de 2025 a las 10:00
Oficina: Oficina Central de Empleo
    `.trim();

    const result = parseSepe(body);
    expect(result!.appointmentDate).toBe('2025-07-03');
    expect(result!.appointmentTime).toBe('10:00');
  });

  // ─── Generic confirmation code fallback ───────────────────────────────────

  it('falls back to generic confirmation code', () => {
    const body = `
Código de confirmación: GEN-001
Fecha: 15/08/2025
Hora: 08:30
    `.trim();

    const result = parseSepe(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('GEN-001');
  });

  // ─── Cancellation detection ───────────────────────────────────────────────

  it('detects cancellation email type', () => {
    const body = `
Su cita ha sido anulada.
Número de cita: SEPE-CANCEL-001
Fecha: 20/05/2025
Hora: 09:00
    `.trim();

    const result = parseSepe(body, 'Anulación de cita - SEPE');
    expect(result!.emailType).toBe('cancellation');
  });

  // ─── Reminder detection ───────────────────────────────────────────────────

  it('detects reminder email type', () => {
    const body = `
Le recordamos que mañana tiene una cita.
Número de cita: SEPE-REM-002
Fecha: 10/04/2025
Hora: 10:15
    `.trim();

    const result = parseSepe(body, 'Recordatorio - SEPE');
    expect(result!.emailType).toBe('reminder');
  });

  // ─── Returns null when no code found ─────────────────────────────────────

  it('returns null when no confirmation code is present', () => {
    const body = 'Este es un correo informativo sin código de cita.';
    expect(parseSepe(body)).toBeNull();
  });
});
