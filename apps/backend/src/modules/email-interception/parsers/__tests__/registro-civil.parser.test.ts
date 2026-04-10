import { parseRegistroCivil } from '../registro-civil.parser';

describe('parseRegistroCivil', () => {
  // ─── Basic confirmation with numero de expediente ─────────────────────────

  it('parses a confirmation email with numero de expediente', () => {
    const body = `
Estimado/a ciudadano/a,

Le confirmamos su cita en el Registro Civil.

Número de expediente: 28-2025-001234
Fecha de la cita: 15/03/2025
Hora de la cita: 10:00
Registro Civil: Registro Civil de Madrid - Sección Primera
Dirección: Plaza de la Villa de París, s/n, 28004 Madrid
Acto registral: Matrimonio civil
NIF: 11223344C

Deberá presentar la documentación requerida.
    `.trim();

    const result = parseRegistroCivil(body, 'Confirmación de cita - Registro Civil');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('28-2025-001234');
    expect(result!.appointmentDate).toBe('2025-03-15');
    expect(result!.appointmentTime).toBe('10:00');
    expect(result!.location).toMatch(/registro\s*civil/i);
    expect(result!.tramite).toMatch(/matrimonio/i);
    expect(result!.nif).toBe('11223344C');
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Código de registro pattern ───────────────────────────────────────────

  it('parses email with código de registro', () => {
    const body = `
Cita concedida.

Código de registro: RC-MAD-20250401-001
Fecha: 01/04/2025
Hora: 11:15
Oficina del Registro: Registro Civil de Getafe
Tipo de trámite: Inscripción de nacimiento
    `.trim();

    const result = parseRegistroCivil(body, 'Registro Civil - Cita concedida');
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('RC-MAD-20250401-001');
    expect(result!.appointmentDate).toBe('2025-04-01');
    expect(result!.appointmentTime).toBe('11:15');
    expect(result!.tramite).toMatch(/inscripci[oó]n/i);
    expect(result!.emailType).toBe('confirmation');
  });

  // ─── Número de cita pattern ───────────────────────────────────────────────

  it('parses email with número de cita', () => {
    const body = `
Número de cita: RC-2025-00099
Fecha de la cita: 30/05/2025
Hora de la cita: 09:30
Juzgado de Paz: Juzgado de Paz de Alcorcón
Gestión: Solicitud de certificado de defunción
    `.trim();

    const result = parseRegistroCivil(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('RC-2025-00099');
    expect(result!.appointmentDate).toBe('2025-05-30');
    expect(result!.appointmentTime).toBe('09:30');
    expect(result!.location).toMatch(/juzgado/i);
  });

  // ─── Long-form Spanish date ────────────────────────────────────────────────

  it('parses long-form Spanish date', () => {
    const body = `
Número de expediente: EXP-12345
Le esperamos el 8 de marzo de 2026 a las 10:30
Registro Civil: Registro Civil Central
    `.trim();

    const result = parseRegistroCivil(body);
    expect(result!.appointmentDate).toBe('2026-03-08');
    expect(result!.appointmentTime).toBe('10:30');
  });

  // ─── Localizador fallback ─────────────────────────────────────────────────

  it('parses email with localizador', () => {
    const body = `
Localizador: LOC-RC-77777
Fecha: 12/12/2025
Hora: 13:00
Lugar: Registro Civil Municipal de Alcalá de Henares
    `.trim();

    const result = parseRegistroCivil(body);
    expect(result).not.toBeNull();
    expect(result!.confirmationCode).toBe('LOC-RC-77777');
  });

  // ─── Cancellation detection ───────────────────────────────────────────────

  it('detects cancellation email type', () => {
    const body = `
Su cita ha sido cancelada.
Número de expediente: EXP-CANCEL-001
Fecha: 20/06/2025
Hora: 09:00
    `.trim();

    const result = parseRegistroCivil(body, 'Cancelación de cita - Registro Civil');
    expect(result!.emailType).toBe('cancellation');
  });

  // ─── Reminder detection ───────────────────────────────────────────────────

  it('detects reminder email type', () => {
    const body = `
Le recordamos su próxima cita en el Registro Civil.
Número de expediente: EXP-REM-002
Fecha: 25/07/2025
Hora: 12:00
    `.trim();

    const result = parseRegistroCivil(body, 'Recordatorio de cita - Registro Civil');
    expect(result!.emailType).toBe('reminder');
  });

  // ─── Returns null when no code found ─────────────────────────────────────

  it('returns null when no confirmation code is present', () => {
    const body = 'Información sobre el Registro Civil Municipal.';
    expect(parseRegistroCivil(body)).toBeNull();
  });

  // ─── NIE extraction ───────────────────────────────────────────────────────

  it('extracts NIE from body', () => {
    const body = `
Número de expediente: EXP-NIE-001
NIE: Y9876543B
Fecha: 01/01/2026
Hora: 10:00
    `.trim();

    const result = parseRegistroCivil(body);
    expect(result!.nif).toBe('Y9876543B');
  });
});
