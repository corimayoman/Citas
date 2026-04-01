/**
 * Property tests — booking.service (máquina de estados)
 * Task 1.4 — Property 2: Las transiciones de estado siguen la máquina de estados definida
 * Requirement 5.5
 *
 * Máquina de estados válida:
 *   SEARCHING → PRE_CONFIRMED  (via _confirmSlot)
 *   PRE_CONFIRMED → CONFIRMED  (via confirmAfterPayment)
 *   SEARCHING → ERROR          (agotó intentos)
 *   * → CANCELLED              (cancelación manual)
 *
 * Invariantes:
 *   1. confirmAfterPayment solo funciona desde PRE_CONFIRMED
 *   2. createDraft siempre arranca en SEARCHING
 *   3. _confirmSlot siempre mueve a PRE_CONFIRMED y crea appointment si no existe
 *   4. _pickDateInRange siempre retorna una fecha dentro del rango dado
 */

import { bookingService } from '../booking.service';
import { prisma } from '../../../lib/prisma';
import { notificationService } from '../../notifications/notification.service';
import { auditService } from '../../audit/audit.service';
import * as cryptoLib from '../../../lib/crypto';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    applicantProfile: { findFirst: jest.fn() },
    procedure: { findUnique: jest.fn() },
    bookingRequest: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    appointment: { findUnique: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../../connectors/connector.registry', () => ({ connectorRegistry: { get: jest.fn() } }));
jest.mock('../../notifications/notification.service', () => ({ notificationService: { send: jest.fn() } }));
jest.mock('../../audit/audit.service', () => ({ auditService: { log: jest.fn() } }));
jest.mock('../../../lib/crypto', () => ({ encrypt: jest.fn().mockReturnValue('encrypted') }));

jest.mock('../search.queue', () => ({
  enqueueSearchJob: jest.fn().mockResolvedValue('job-123'),
}));

import { enqueueSearchJob } from '../search.queue';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

const ALL_STATUSES = ['SEARCHING', 'PRE_CONFIRMED', 'CONFIRMED', 'COMPLETED', 'ERROR', 'CANCELLED', 'PAID', 'IN_PROGRESS', 'REQUIRES_USER_ACTION'] as const;
type BookingStatus = typeof ALL_STATUSES[number];

function makeBooking(status: BookingStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    userId: 'user-1',
    status,
    procedure: { name: 'Trámite X' },
    appointment: null,
    preferredDateFrom: null,
    preferredDateTo: null,
    preferredTimeSlot: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Property 1: createDraft SIEMPRE crea el booking con status SEARCHING
// ---------------------------------------------------------------------------

describe('Property 1 — createDraft: siempre arranca en SEARCHING', () => {
  const SAMPLES = 10;

  it(`se cumple para ${SAMPLES} combinaciones de procedureId y profileId`, async () => {
    for (let seed = 0; seed < SAMPLES; seed++) {
      jest.clearAllMocks();

      (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: `profile-${seed}` });
      (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: `proc-${seed}`, connector: null });
      (mockPrisma.bookingRequest.create as jest.Mock).mockResolvedValue({
        id: `booking-${seed}`,
        status: 'SEARCHING',
      });
      (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({
        id: `booking-${seed}`,
        status: 'SEARCHING',
        searchJobId: 'job-123',
      });
      (auditService.log as jest.Mock).mockResolvedValue(undefined);
      (enqueueSearchJob as jest.Mock).mockResolvedValue('job-123');

      const result = await bookingService.createDraft('user-1', {
        applicantProfileId: `profile-${seed}`,
        procedureId: `proc-${seed}`,
        formData: { field: `value-${seed}` },
      });

      expect(result.status).toBe('SEARCHING');
      const createCall = (mockPrisma.bookingRequest.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.status).toBe('SEARCHING');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: confirmAfterPayment SOLO funciona desde PRE_CONFIRMED
// Cualquier otro estado debe lanzar error (porque la query filtra por status)
// ---------------------------------------------------------------------------

describe('Property 2 — confirmAfterPayment: solo transiciona desde PRE_CONFIRMED', () => {
  const NON_PRE_CONFIRMED = ALL_STATUSES.filter(s => s !== 'PRE_CONFIRMED');

  it.each(NON_PRE_CONFIRMED)(
    'estado %s → lanza AppError (no encontrado)',
    async (status) => {
      // La query de confirmAfterPayment filtra { status: 'PRE_CONFIRMED' }
      // Si el booking tiene otro status, findFirst retorna null
      (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(bookingService.confirmAfterPayment('booking-1', 'user-1'))
        .rejects.toMatchObject({ statusCode: 404 });

      // Nunca debe actualizar el booking
      expect(mockPrisma.bookingRequest.update as jest.Mock).not.toHaveBeenCalled();
    }
  );

  it('estado PRE_CONFIRMED → actualiza a CONFIRMED', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(
      makeBooking('PRE_CONFIRMED', { appointment: null })
    );
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);

    await bookingService.confirmAfterPayment('booking-1', 'user-1');

    expect(mockPrisma.bookingRequest.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: _confirmSlot SIEMPRE mueve el booking a PRE_CONFIRMED
// y NUNCA duplica el appointment
// ---------------------------------------------------------------------------

describe('Property 3 — _confirmSlot: siempre mueve a PRE_CONFIRMED y no duplica appointment', () => {
  const slotVariants = [
    { appointmentDate: '2026-05-01', appointmentTime: '09:00', location: 'Sede A', confirmationCode: 'CODE-1' },
    { appointmentDate: '2026-06-15', appointmentTime: '14:30', location: undefined, confirmationCode: undefined },
    { appointmentDate: new Date('2026-07-20'), appointmentTime: '11:00', location: 'Sede B', confirmationCode: 'CODE-3' },
  ];

  it.each(slotVariants)(
    'slot con fecha $appointmentDate → status PRE_CONFIRMED',
    async (slot) => {
      jest.clearAllMocks();
      const booking = makeBooking('SEARCHING');

      (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.appointment.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-new' });
      (notificationService.send as jest.Mock).mockResolvedValue(undefined);

      await bookingService._confirmSlot(booking, slot);

      const updateCall = (mockPrisma.bookingRequest.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBe('PRE_CONFIRMED');
    }
  );

  it('si el appointment ya existe, no lo duplica', async () => {
    const booking = makeBooking('SEARCHING');
    const slot = { appointmentDate: '2026-05-01', appointmentTime: '10:00', confirmationCode: 'X' };

    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.appointment.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-appt' });
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);

    await bookingService._confirmSlot(booking, slot);

    expect(mockPrisma.appointment.create as jest.Mock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Property 4: _pickDateInRange siempre retorna una fecha dentro del rango dado
// ---------------------------------------------------------------------------

describe('Property 4 — _pickDateInRange: fecha resultante siempre cae dentro del rango', () => {
  const SAMPLES = 30;

  it(`se cumple para ${SAMPLES} rangos aleatorios`, () => {
    for (let seed = 0; seed < SAMPLES; seed++) {
      const fromOffset = seed * 2 * 24 * 60 * 60 * 1000; // cada 2 días
      const rangeLen = (5 + seed) * 24 * 60 * 60 * 1000;  // rango de 5..35 días

      const from = new Date(Date.now() + fromOffset);
      const to = new Date(from.getTime() + rangeLen);
      const timeSlot = seed % 3 === 0 ? 'morning' : seed % 3 === 1 ? 'afternoon' : null;

      const result = bookingService._pickDateInRange(from, to, timeSlot);

      expect(result.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(to.getTime());

      // Verificar que el horario respeta la preferencia
      if (timeSlot === 'morning') expect(result.getHours()).toBeLessThan(14);
      if (timeSlot === 'afternoon') expect(result.getHours()).toBeGreaterThanOrEqual(14);
    }
  });

  it('sin rango definido, retorna una fecha futura', () => {
    const before = Date.now();
    const result = bookingService._pickDateInRange(null, null, null);
    expect(result.getTime()).toBeGreaterThan(before);
  });
});
