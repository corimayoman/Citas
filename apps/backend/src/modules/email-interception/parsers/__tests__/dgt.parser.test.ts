import { parseDgt } from '../dgt.parser';

describe('parseDgt', () => {
  // ─── Basic confirmation with numero de cita ────────────────────────────────

  it('parses a confirmation email with numero de cita', () => {
    const body = `
Estimado ciudadano,

Su cita previa en la DGT ha sido confirmada.

Número de cita: DGT-20250312-001
Fecha de la cita: 12/03/2025
Hora de la cita: 11:00
Jefatura Provincial de Tráfico: Jefatura Provincial de Madrid
Dirección: Calle Josefa Valcárcel, 28, 28027 Madrid
Trámite: Renovación del permiso de conducción
NIF: 87654321B

Recuerde presentar su documentación.
    `.trim();

    const result = parseDgt(body, 'Confirmación de cita previa - DGT');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('DGT-20250312-001');
    expect(result!.appointmentDate).toBe('2025-03-12');
    expect(result!.appointmentTime).toBe('11:00');
    expect(result!.location).toMatch(/jefatura/i);
    expect(result!.tramite).toMatch(/permiso/i);
    expect(result!.nif).toBe('87654321B');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Código de cita previa pattern ────────────────────────────────────────

  it('parses email with código de cita previa', () => {
    const body = `
Cita previa concedida.

Código de cita previa: CP-2025-001234
Fecha: 20/04/2025
Hora: 10:30
Jefatura: Jefatura de Barcelona
Tipo de trámite: Canje de permiso de conducción extranjero
    `.trim();

    const result = parseDgt(body, 'DGT - Cita previa concedida');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('CP-2025-001234');
    expect(result!.appointmentDate).toBe('2025-04-20');
    expect(result!.appointmentTime).toBe('10:30');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Localizador DGT pattern ───────────────────────────────────────────────

  it('parses email with localizador DGT', () => {
    const body = `
Localizador DGT: LOC-DGT-555
Fecha: 01/09/2025
Hora: 12:30
Oficina de Tráfico: Jefatura de Valencia
Gestión: Transferencia de vehículo
    `.trim();

    const result = parseDgt(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('LOC-DGT-555');
    expect(result!.appointmentDate).toBe('2025-09-01');
    expect(result!.appointmentTime).toBe('12:30');
  });

  // ─── Long-form Spanish date ────────────────────────────────────────────────

  it('parses long-form Spanish date', () => {
    const body = `
Número de cita: DGT-LONG-001
Su cita es el 25 de diciembre de 2025 a las 08:00
Jefatura: Jefatura de Sevilla
    `.trim();

    const result = parseDgt(body);
    expect(result!.appointmentDate).toBe('2025-12-25');
    expect(result!.appointmentTime).toBe('08:00');
  });

  // ─── Cancellation detection ───────────────────────────────────────────────

  it('detects cancellation email type', () => {
    const body = `
Su cita ha sido cancelada a su solicitud.
Número de cita: DGT-CANCEL-003
Fecha: 15/05/2025
Hora: 11:00
    `.trim();

    const result = parseDgt(body, 'Cancelación de cita - DGT');
    expect(result!.emailType).toBe('cancellation');
  });

  // ─── Reminder detection ───────────────────────────────────────────────────

  it('detects reminder email type', () => {
    const body = `
Le recordamos que próximamente tiene una cita en la DGT.
Número de cita: DGT-REM-007
Fecha: 10/04/2025
Hora: 09:45
    `.trim();

    const result = parseDgt(body, 'Recordatorio de cita DGT');
    expect(result!.emailType).toBe('reminder');
  });

  // ─── Returns null when no code found ─────────────────────────────────────

  it('returns null when no confirmation code is present', () => {
    const body = 'Información general sobre permisos de conducción.';
    expect(parseDgt(body)).toBeNull();
  });

  // ─── Generic fallback ─────────────────────────────────────────────────────

  it('falls back to generic confirmation code pattern', () => {
    const body = `
Referencia: REF-DGT-9999
Fecha: 01/01/2026
Hora: 10:00
    `.trim();

    const result = parseDgt(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('REF-DGT-9999');
  });
});
