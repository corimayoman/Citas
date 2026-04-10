/**
 * Tests for SearchWorker — BullMQ worker that processes booking search jobs.
 *
 * Strategy: mock all external dependencies and call processSearchJob /
 * onSearchJobFailed by re-exporting them from a test-only helper shim,
 * since the worker only exports startSearchWorker().
 *
 * We extract the processor by monkey-patching the Worker constructor so
 * that when startSearchWorker() is called the processor function reference
 * is captured, then called directly in each test.
 */

// ── Must mock crypto BEFORE any other import ─────────────────────────────────
jest.mock('../../../lib/crypto', () => ({
  encrypt: jest.fn().mockReturnValue('encrypted-data'),
  decrypt: jest.fn().mockReturnValue('decrypted-data'),
  hashSensitive: jest.fn().mockReturnValue('hashed-data'),
}));

// ── Mock BullMQ so startSearchWorker() doesn't need a real Redis connection ──
const mockWorkerInstance = {
  on: jest.fn().mockReturnThis(),
};
const MockWorker = jest.fn().mockImplementation(() => mockWorkerInstance);

jest.mock('bullmq', () => ({
  Worker: MockWorker,
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    on: jest.fn(),
    getJob: jest.fn(),
  })),
  Job: jest.fn(),
}));

// ── Mock Redis ────────────────────────────────────────────────────────────────
jest.mock('../../../lib/redis', () => ({
  getBullMQConnection: jest.fn().mockReturnValue({ connection: {} }),
  getRedisClient: jest.fn().mockReturnValue({
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    get: jest.fn(),
  }),
}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    bookingRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    bookingAttempt: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// ── Mock connectorRegistry ────────────────────────────────────────────────────
jest.mock('../../connectors/connector.registry', () => ({
  connectorRegistry: { get: jest.fn() },
}));

// ── Mock circuitBreakerService ────────────────────────────────────────────────
jest.mock('../../connectors/circuit-breaker.service', () => ({
  circuitBreakerService: {
    isOpen: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  },
}));

// ── Mock bookingService ───────────────────────────────────────────────────────
jest.mock('../booking.service', () => ({
  bookingService: {
    _confirmSlot: jest.fn(),
  },
}));

// ── Mock notificationService ──────────────────────────────────────────────────
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

// ── Mock auditService ─────────────────────────────────────────────────────────
jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

// ── Mock search.queue ─────────────────────────────────────────────────────────
jest.mock('../search.queue', () => ({
  SEARCH_QUEUE_NAME: 'booking-search',
  SEARCH_QUEUE_CONFIG: {
    maxAttempts: 20,
    backoff: { type: 'exponential', delay: 30000 },
    concurrency: 3,
  },
  enqueueSearchJob: jest.fn().mockResolvedValue('job-123'),
  getSearchQueue: jest.fn(),
}));

// ── Now import everything (after all mocks are in place) ──────────────────────
import { prisma } from '../../../lib/prisma';
import { connectorRegistry } from '../../connectors/connector.registry';
import { circuitBreakerService } from '../../connectors/circuit-breaker.service';
import { bookingService } from '../booking.service';
import { notificationService } from '../../notifications/notification.service';
import { auditService } from '../../audit/audit.service';
import { CircuitBreakerError } from '../../connectors/adapters/base-real.connector';
import { SEARCH_QUEUE_CONFIG } from '../search.queue';
import { processSearchJob, onSearchJobFailed, startSearchWorker } from '../search.worker';

// ── Helpers ───────────────────────────────────────────────────────────────────

import { Job } from 'bullmq';

type AnyJob = Job<any, any, any>;

// Wrappers cast the partial mock job to the full BullMQ Job type so
// TypeScript is satisfied — in tests we only need the fields the processor uses.
function extractProcessors() {
  return {
    processSearchJob: (job: unknown) => processSearchJob(job as AnyJob),
    onSearchJobFailed: (job: unknown, err: Error) => onSearchJobFailed(job as AnyJob, err),
  };
}

// ── Shared test data ──────────────────────────────────────────────────────────

const BOOKING_ID = 'booking-uuid-1';
const CONNECTOR_ID = 'connector-uuid-1';
const PROCEDURE_ID = 'procedure-uuid-1';
const USER_ID = 'user-uuid-1';

function makeJob(overrides: Partial<{ attemptsMade: number; id: string }> = {}) {
  return {
    id: 'job-1',
    data: { bookingRequestId: BOOKING_ID },
    attemptsMade: 0,
    ...overrides,
  };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    userId: USER_ID,
    status: 'SEARCHING',
    procedureId: PROCEDURE_ID,
    preferredDateFrom: null,
    preferredDateTo: null,
    preferredTimeSlot: null,
    procedure: {
      id: PROCEDURE_ID,
      name: 'Trámite de prueba',
      connector: {
        id: CONNECTOR_ID,
        slug: 'test-connector',
      },
    },
    applicantProfile: {
      firstName: 'Juan',
      lastName: 'Pérez',
    },
    ...overrides,
  };
}

function makeSlot(overrides: Partial<{ date: string; time: string; available: boolean; slotId: string }> = {}) {
  return {
    date: '2026-05-15',
    time: '10:00',
    available: true,
    slotId: 'slot-abc',
    ...overrides,
  };
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getAvailability: jest.fn().mockResolvedValue([makeSlot()]),
    book: jest.fn().mockResolvedValue({
      success: true,
      confirmationCode: 'CONF-001',
      appointmentDate: '2026-05-15',
      appointmentTime: '10:00',
      location: 'Oficina Central',
    }),
    ...overrides,
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Sensible defaults for all mocks
  (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(makeBooking());
  (prisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
  (prisma.bookingAttempt.findFirst as jest.Mock).mockResolvedValue(null); // no existing attempt
  (prisma.bookingAttempt.create as jest.Mock).mockResolvedValue({ id: 'attempt-1' });

  (connectorRegistry.get as jest.Mock).mockReturnValue(makeAdapter());

  (circuitBreakerService.isOpen as jest.Mock).mockResolvedValue(false);
  (circuitBreakerService.recordSuccess as jest.Mock).mockResolvedValue(undefined);
  (circuitBreakerService.recordFailure as jest.Mock).mockResolvedValue(undefined);

  (bookingService._confirmSlot as jest.Mock).mockResolvedValue(undefined);
  (notificationService.send as jest.Mock).mockResolvedValue(undefined);
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchWorker — processSearchJob', () => {
  describe('1. Happy path: slot found → book() exitoso', () => {
    it('calls _confirmSlot and recordSuccess, does not throw', async () => {
      const { processSearchJob } = extractProcessors();

      await processSearchJob(makeJob());

      expect(bookingService._confirmSlot).toHaveBeenCalledTimes(1);
      expect(bookingService._confirmSlot).toHaveBeenCalledWith(
        expect.objectContaining({ id: BOOKING_ID }),
        expect.objectContaining({
          confirmationCode: 'CONF-001',
          appointmentDate: '2026-05-15',
          appointmentTime: '10:00',
          location: 'Oficina Central',
        }),
      );
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith(CONNECTOR_ID);
    });

    it('creates a BookingAttempt with success=true', async () => {
      const { processSearchJob } = extractProcessors();

      await processSearchJob(makeJob());

      expect(prisma.bookingAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingRequestId: BOOKING_ID,
            connectorId: CONNECTOR_ID,
            success: true,
          }),
        }),
      );
    });

    it('uses slot date/time as fallback when bookResult lacks appointmentDate/Time', async () => {
      const adapter = makeAdapter({
        book: jest.fn().mockResolvedValue({
          success: true,
          confirmationCode: 'CONF-002',
          // no appointmentDate / appointmentTime
        }),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      expect(bookingService._confirmSlot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          appointmentDate: '2026-05-15',
          appointmentTime: '10:00',
        }),
      );
    });
  });

  describe('2. No slots returned by getAvailability', () => {
    it('creates BookingAttempt with success=false and throws for retry', async () => {
      const adapter = makeAdapter({ getAvailability: jest.fn().mockResolvedValue([]) });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();

      await expect(processSearchJob(makeJob())).rejects.toThrow('No matching slots found — will retry');

      expect(prisma.bookingAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingRequestId: BOOKING_ID,
            success: false,
          }),
        }),
      );
      expect(bookingService._confirmSlot).not.toHaveBeenCalled();
    });
  });

  describe('3. book() returns success=false', () => {
    it('records failed attempt and throws for retry', async () => {
      const adapter = makeAdapter({
        book: jest.fn().mockResolvedValue({
          success: false,
          errorMessage: 'Slot no longer available',
        }),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();

      await expect(processSearchJob(makeJob())).rejects.toThrow('No matching slots found — will retry');

      expect(prisma.bookingAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            errorMessage: 'Slot no longer available',
          }),
        }),
      );
    });
  });

  describe('4. CircuitBreakerError thrown by getAvailability', () => {
    it('records failure, moves booking to ERROR, sends notification, does NOT rethrow', async () => {
      const cbError = new CircuitBreakerError('CAPTCHA detected', 'CAPTCHA_DETECTED');
      const adapter = makeAdapter({ getAvailability: jest.fn().mockRejectedValue(cbError) });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();

      // Should NOT throw — circuit breaker errors are terminal, job must not retry
      await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

      expect(circuitBreakerService.recordFailure).toHaveBeenCalledWith(
        CONNECTOR_ID,
        'CAPTCHA_DETECTED',
      );

      expect(prisma.bookingRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: { status: 'ERROR' },
        }),
      );

      expect(notificationService.send).toHaveBeenCalledTimes(1);
      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          metadata: expect.objectContaining({ reason: 'CAPTCHA_DETECTED' }),
        }),
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          after: expect.objectContaining({ status: 'ERROR', reason: 'CAPTCHA_DETECTED' }),
        }),
      );
    });

    it('creates a BookingAttempt with success=false for the circuit breaker error', async () => {
      const cbError = new CircuitBreakerError('Structure changed', 'STRUCTURE_CHANGED');
      const adapter = makeAdapter({ getAvailability: jest.fn().mockRejectedValue(cbError) });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      expect(prisma.bookingAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingRequestId: BOOKING_ID,
            connectorId: CONNECTOR_ID,
            success: false,
          }),
        }),
      );
    });
  });

  describe('5. Circuit breaker is open (connector SUSPENDED)', () => {
    it('moves booking to ERROR without calling the connector adapter', async () => {
      (circuitBreakerService.isOpen as jest.Mock).mockResolvedValue(true);

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

      expect(connectorRegistry.get).toHaveBeenCalled();
      // Adapter's getAvailability must NOT be called
      const adapter = (connectorRegistry.get as jest.Mock).mock.results[0].value;
      expect(adapter.getAvailability).not.toHaveBeenCalled();

      expect(prisma.bookingRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: { status: 'ERROR' },
        }),
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          after: expect.objectContaining({ reason: 'CONNECTOR_SUSPENDED' }),
        }),
      );

      expect(notificationService.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. Booking not found', () => {
    it('returns silently without any DB writes', async () => {
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(null);

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

      expect(prisma.bookingRequest.update).not.toHaveBeenCalled();
      expect(bookingService._confirmSlot).not.toHaveBeenCalled();
    });
  });

  describe('7. Booking not in SEARCHING status', () => {
    it.each(['PRE_CONFIRMED', 'CONFIRMED', 'ERROR', 'CANCELLED'])(
      'status %s → returns silently',
      async (status) => {
        (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(
          makeBooking({ status }),
        );

        const { processSearchJob } = extractProcessors();
        await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

        expect(prisma.bookingAttempt.create).not.toHaveBeenCalled();
        expect(bookingService._confirmSlot).not.toHaveBeenCalled();
      },
    );
  });

  describe('8. No connector associated with procedure', () => {
    it('returns silently without calling the registry', async () => {
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(
        makeBooking({ procedure: { id: PROCEDURE_ID, name: 'Sin Conector', connector: null } }),
      );

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

      expect(connectorRegistry.get).not.toHaveBeenCalled();
      expect(bookingService._confirmSlot).not.toHaveBeenCalled();
    });
  });

  describe('9. Connector slug not in registry', () => {
    it('returns silently when registry returns undefined', async () => {
      (connectorRegistry.get as jest.Mock).mockReturnValue(undefined);

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

      expect(circuitBreakerService.isOpen).not.toHaveBeenCalled();
      expect(bookingService._confirmSlot).not.toHaveBeenCalled();
    });

    it('returns silently when adapter lacks getAvailability', async () => {
      (connectorRegistry.get as jest.Mock).mockReturnValue({ book: jest.fn() }); // no getAvailability

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).resolves.toBeUndefined();

      expect(circuitBreakerService.isOpen).not.toHaveBeenCalled();
    });
  });

  describe('10. Idempotency: existing BookingAttempt with same attemptNumber', () => {
    it('does NOT create a duplicate attempt on happy path', async () => {
      // Simulate a BullMQ retry: an attempt record already exists for this attemptNumber
      (prisma.bookingAttempt.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-attempt-1' });

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob({ attemptsMade: 2 }));

      // _confirmSlot and recordSuccess should still be called
      expect(bookingService._confirmSlot).toHaveBeenCalledTimes(1);
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledTimes(1);

      // But NO new attempt should be created
      expect(prisma.bookingAttempt.create).not.toHaveBeenCalled();
    });

    it('does NOT create a duplicate attempt when no slots found and attempt exists', async () => {
      (prisma.bookingAttempt.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-attempt-1' });
      const adapter = makeAdapter({ getAvailability: jest.fn().mockResolvedValue([]) });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).rejects.toThrow();

      expect(prisma.bookingAttempt.create).not.toHaveBeenCalled();
    });
  });

  describe('11. Time slot filtering', () => {
    it('preferredTimeSlot=morning: filters OUT slots with hour >= 14', async () => {
      const booking = makeBooking({ preferredTimeSlot: 'morning' });
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(booking);

      const afternoonSlot = makeSlot({ time: '14:00' }); // should be excluded
      const morningSlot = makeSlot({ time: '09:00' });   // should be included
      const adapter = makeAdapter({
        getAvailability: jest.fn().mockResolvedValue([afternoonSlot, morningSlot]),
        book: jest.fn().mockResolvedValue({
          success: true,
          confirmationCode: 'CONF-M',
          appointmentDate: '2026-05-15',
          appointmentTime: '09:00',
        }),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      // Should have booked the morning slot (09:00), not the afternoon one
      expect(adapter.book).toHaveBeenCalledWith(
        expect.objectContaining({ selectedTime: '09:00' }),
      );
    });

    it('preferredTimeSlot=morning: no morning slots → throws for retry', async () => {
      const booking = makeBooking({ preferredTimeSlot: 'morning' });
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(booking);

      // Only afternoon slots
      const adapter = makeAdapter({
        getAvailability: jest.fn().mockResolvedValue([makeSlot({ time: '15:30' })]),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).rejects.toThrow('No matching slots found — will retry');
    });

    it('preferredTimeSlot=afternoon: filters OUT slots with hour < 14', async () => {
      const booking = makeBooking({ preferredTimeSlot: 'afternoon' });
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(booking);

      const morningSlot = makeSlot({ time: '09:00' }); // excluded
      const afternoonSlot = makeSlot({ time: '16:00', slotId: 'aft-slot' }); // included
      const adapter = makeAdapter({
        getAvailability: jest.fn().mockResolvedValue([morningSlot, afternoonSlot]),
        book: jest.fn().mockResolvedValue({
          success: true,
          confirmationCode: 'CONF-A',
          appointmentDate: '2026-05-15',
          appointmentTime: '16:00',
        }),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      expect(adapter.book).toHaveBeenCalledWith(
        expect.objectContaining({ selectedTime: '16:00' }),
      );
    });

    it('preferredTimeSlot=afternoon: hour exactly 14 is included', async () => {
      const booking = makeBooking({ preferredTimeSlot: 'afternoon' });
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(booking);

      const slot14 = makeSlot({ time: '14:00' });
      const adapter = makeAdapter({
        getAvailability: jest.fn().mockResolvedValue([slot14]),
        book: jest.fn().mockResolvedValue({
          success: true,
          confirmationCode: 'CONF-B',
          appointmentDate: '2026-05-15',
          appointmentTime: '14:00',
        }),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      expect(bookingService._confirmSlot).toHaveBeenCalledTimes(1);
    });

    it('preferredTimeSlot=morning: hour exactly 13:59 is included', async () => {
      const booking = makeBooking({ preferredTimeSlot: 'morning' });
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(booking);

      const slot1359 = makeSlot({ time: '13:59' });
      const adapter = makeAdapter({
        getAvailability: jest.fn().mockResolvedValue([slot1359]),
        book: jest.fn().mockResolvedValue({
          success: true,
          confirmationCode: 'CONF-C',
          appointmentDate: '2026-05-15',
          appointmentTime: '13:59',
        }),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      expect(bookingService._confirmSlot).toHaveBeenCalledTimes(1);
    });

    it('unavailable slots are filtered out regardless of time', async () => {
      const booking = makeBooking({ preferredTimeSlot: null });
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(booking);

      const unavailable = makeSlot({ available: false, time: '09:00' });
      const adapter = makeAdapter({
        getAvailability: jest.fn().mockResolvedValue([unavailable]),
      });
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapter);

      const { processSearchJob } = extractProcessors();
      await expect(processSearchJob(makeJob())).rejects.toThrow('No matching slots found — will retry');
    });
  });

  describe('Connector without book() method', () => {
    it('confirms slot directly via _confirmSlot when adapter has no book()', async () => {
      const adapterWithoutBook = {
        getAvailability: jest.fn().mockResolvedValue([makeSlot()]),
        // no book() method
      };
      (connectorRegistry.get as jest.Mock).mockReturnValue(adapterWithoutBook);

      const { processSearchJob } = extractProcessors();
      await processSearchJob(makeJob());

      expect(bookingService._confirmSlot).toHaveBeenCalledTimes(1);
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith(CONNECTOR_ID);
    });
  });
});

describe('SearchWorker — onSearchJobFailed', () => {
  describe('12. Max attempts reached', () => {
    it('moves SEARCHING booking to ERROR and sends notification', async () => {
      const { onSearchJobFailed } = extractProcessors();

      const bookingWithProcedure = {
        id: BOOKING_ID,
        userId: USER_ID,
        status: 'SEARCHING',
        procedure: { name: 'Trámite de prueba' },
      };
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(bookingWithProcedure);

      const job = {
        ...makeJob({ attemptsMade: SEARCH_QUEUE_CONFIG.maxAttempts }), // exactly at max
      };

      await onSearchJobFailed(job, new Error('No matching slots found — will retry'));

      expect(prisma.bookingRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BOOKING_ID },
          data: { status: 'ERROR' },
        }),
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          after: expect.objectContaining({
            status: 'ERROR',
            reason: 'MAX_ATTEMPTS_REACHED',
          }),
        }),
      );

      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          title: 'No se encontró cita disponible',
          metadata: expect.objectContaining({ reason: 'MAX_ATTEMPTS_REACHED' }),
        }),
      );
    });

    it('does nothing if booking is not in SEARCHING status when max attempts reached', async () => {
      const { onSearchJobFailed } = extractProcessors();

      const bookingNotSearching = {
        id: BOOKING_ID,
        userId: USER_ID,
        status: 'ERROR', // already in ERROR
        procedure: { name: 'Trámite de prueba' },
      };
      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(bookingNotSearching);

      const job = makeJob({ attemptsMade: SEARCH_QUEUE_CONFIG.maxAttempts });

      await onSearchJobFailed(job, new Error('some error'));

      expect(prisma.bookingRequest.update).not.toHaveBeenCalled();
      expect(notificationService.send).not.toHaveBeenCalled();
    });
  });

  describe('13. Not at max attempts', () => {
    it('does nothing when attemptsMade < maxAttempts', async () => {
      const { onSearchJobFailed } = extractProcessors();

      const job = makeJob({ attemptsMade: SEARCH_QUEUE_CONFIG.maxAttempts - 1 });

      await onSearchJobFailed(job, new Error('No matching slots found — will retry'));

      expect(prisma.bookingRequest.findUnique).not.toHaveBeenCalled();
      expect(prisma.bookingRequest.update).not.toHaveBeenCalled();
      expect(notificationService.send).not.toHaveBeenCalled();
    });

    it('does nothing when job is undefined', async () => {
      const { onSearchJobFailed } = extractProcessors();

      await onSearchJobFailed(undefined, new Error('some error'));

      expect(prisma.bookingRequest.findUnique).not.toHaveBeenCalled();
      expect(notificationService.send).not.toHaveBeenCalled();
    });
  });

  describe('14. Booking not found at max attempts', () => {
    it('handles missing booking gracefully without throwing', async () => {
      const { onSearchJobFailed } = extractProcessors();

      (prisma.bookingRequest.findUnique as jest.Mock).mockResolvedValue(null);

      const job = makeJob({ attemptsMade: SEARCH_QUEUE_CONFIG.maxAttempts });

      // Should not throw even if the booking is gone
      await expect(
        onSearchJobFailed(job, new Error('max retries exceeded')),
      ).resolves.toBeUndefined();

      expect(prisma.bookingRequest.update).not.toHaveBeenCalled();
      expect(notificationService.send).not.toHaveBeenCalled();
    });
  });
});

describe('SearchWorker — startSearchWorker', () => {
  it('creates a Worker with the correct queue name', () => {
    MockWorker.mockClear();
    startSearchWorker();
    expect(MockWorker).toHaveBeenCalledWith(
      'booking-search',
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('registers event handlers for failed, error and completed', () => {
    mockWorkerInstance.on.mockClear();
    startSearchWorker();
    const eventNames = mockWorkerInstance.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain('failed');
    expect(eventNames).toContain('error');
    expect(eventNames).toContain('completed');
  });

  it('returns the worker instance', () => {
    const result = startSearchWorker();
    expect(result).toBe(mockWorkerInstance);
  });
});
