import { ConnectorStatus, AuditAction, UserRole } from '@prisma/client';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  get: jest.fn(),
  mget: jest.fn(),
  multi: jest.fn(),
};

jest.mock('../../../lib/redis', () => ({
  getRedisClient: jest.fn(() => mockRedis),
}));

const mockPrisma = {
  connector: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  bookingRequest: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('../../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('../../audit/audit.service', () => ({
  auditService: {
    log: jest.fn(),
  },
}));

jest.mock('../../notifications/notification.service', () => ({
  notificationService: {
    send: jest.fn(),
  },
}));

jest.mock('../../../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { circuitBreakerService } from '../circuit-breaker.service';
import { auditService } from '../../audit/audit.service';
import { notificationService } from '../../notifications/notification.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONNECTOR_ID = 'connector-abc';
const FAILURES_KEY = `cb:${CONNECTOR_ID}:failures`;

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Reset config to defaults so tests don't bleed into each other
  circuitBreakerService.config = { failureThreshold: 5, windowMs: 300_000 };
});

// ─────────────────────────────────────────────────────────────────────────────
// isOpen()
// ─────────────────────────────────────────────────────────────────────────────

describe('isOpen()', () => {
  it('returns false when connector status is ACTIVE', async () => {
    mockPrisma.connector.findUnique.mockResolvedValue({ status: ConnectorStatus.ACTIVE });

    const result = await circuitBreakerService.isOpen(CONNECTOR_ID);

    expect(result).toBe(false);
    expect(mockPrisma.connector.findUnique).toHaveBeenCalledWith({
      where: { id: CONNECTOR_ID },
      select: { status: true },
    });
  });

  it('returns true when connector status is SUSPENDED', async () => {
    mockPrisma.connector.findUnique.mockResolvedValue({ status: ConnectorStatus.SUSPENDED });

    const result = await circuitBreakerService.isOpen(CONNECTOR_ID);

    expect(result).toBe(true);
  });

  it('returns false (fallback) when prisma throws', async () => {
    mockPrisma.connector.findUnique.mockRejectedValue(new Error('DB connection failed'));

    const result = await circuitBreakerService.isOpen(CONNECTOR_ID);

    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordFailure()
// ─────────────────────────────────────────────────────────────────────────────

describe('recordFailure()', () => {
  beforeEach(() => {
    // Prevent suspend() from running (threshold is 5, we test < 5 here)
    mockPrisma.connector.update.mockResolvedValue({ name: 'Test Connector' });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.bookingRequest.findMany.mockResolvedValue([]);
    (auditService.log as jest.Mock).mockResolvedValue(undefined);
  });

  it('increments Redis counter and sets TTL on first failure', async () => {
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    await circuitBreakerService.recordFailure(CONNECTOR_ID, 'timeout');

    expect(mockRedis.incr).toHaveBeenCalledWith(FAILURES_KEY);
    expect(mockRedis.expire).toHaveBeenCalledWith(FAILURES_KEY, 300); // 300_000ms / 1000
  });

  it('does NOT set TTL after first failure (failures > 1)', async () => {
    mockRedis.incr.mockResolvedValue(2);

    await circuitBreakerService.recordFailure(CONNECTOR_ID, 'timeout');

    expect(mockRedis.incr).toHaveBeenCalledWith(FAILURES_KEY);
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it('calls suspend() when failures reach the threshold (5)', async () => {
    mockRedis.incr.mockResolvedValue(5);
    mockRedis.del.mockResolvedValue(1);

    await circuitBreakerService.recordFailure(CONNECTOR_ID, 'too many errors');

    expect(mockPrisma.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTOR_ID },
        data: expect.objectContaining({ status: ConnectorStatus.SUSPENDED }),
      }),
    );
  });

  it('does NOT call suspend() when failures are below the threshold', async () => {
    mockRedis.incr.mockResolvedValue(4);

    await circuitBreakerService.recordFailure(CONNECTOR_ID, 'partial failure');

    expect(mockPrisma.connector.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordSuccess()
// ─────────────────────────────────────────────────────────────────────────────

describe('recordSuccess()', () => {
  it('calls redis.del with the correct failures key', async () => {
    mockRedis.del.mockResolvedValue(1);

    await circuitBreakerService.recordSuccess(CONNECTOR_ID);

    expect(mockRedis.del).toHaveBeenCalledWith(FAILURES_KEY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// suspend()
// ─────────────────────────────────────────────────────────────────────────────

describe('suspend()', () => {
  const CONNECTOR_NAME = 'My Connector';
  const REASON = 'failure threshold exceeded';

  beforeEach(() => {
    mockPrisma.connector.update.mockResolvedValue({
      id: CONNECTOR_ID,
      name: CONNECTOR_NAME,
      status: ConnectorStatus.SUSPENDED,
    });
    mockRedis.del.mockResolvedValue(1);
    (auditService.log as jest.Mock).mockResolvedValue(undefined);
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.bookingRequest.findMany.mockResolvedValue([]);
  });

  it('updates connector status to SUSPENDED in the database', async () => {
    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    expect(mockPrisma.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTOR_ID },
        data: expect.objectContaining({
          status: ConnectorStatus.SUSPENDED,
          suspendedReason: REASON,
        }),
      }),
    );
  });

  it('deletes the Redis failures key after suspending', async () => {
    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    expect(mockRedis.del).toHaveBeenCalledWith(FAILURES_KEY);
  });

  it('calls auditService.log with CONNECTOR_TOGGLE action', async () => {
    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CONNECTOR_TOGGLE,
        entityType: 'Connector',
        entityId: CONNECTOR_ID,
        before: { status: 'ACTIVE' },
        after: expect.objectContaining({ status: 'SUSPENDED', reason: REASON }),
      }),
    );
  });

  it('notifies all OPERATOR and ADMIN users via notificationService', async () => {
    const operators = [{ id: 'user-op-1' }, { id: 'user-admin-1' }];
    mockPrisma.user.findMany.mockResolvedValue(operators);

    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: [UserRole.OPERATOR, UserRole.ADMIN] },
          isActive: true,
        }),
      }),
    );
    expect(notificationService.send).toHaveBeenCalledTimes(2);
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-op-1' }),
    );
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-admin-1' }),
    );
  });

  it('returns early in _cascadeSearchingToError when no SEARCHING bookings exist', async () => {
    mockPrisma.bookingRequest.findMany.mockResolvedValue([]);

    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    expect(mockPrisma.bookingRequest.updateMany).not.toHaveBeenCalled();
  });

  it('bulk-updates SEARCHING bookings to ERROR and notifies affected users', async () => {
    const affectedBookings = [
      { id: 'booking-1', userId: 'user-1', procedure: { name: 'Consultation' } },
      { id: 'booking-2', userId: 'user-2', procedure: { name: 'Consultation' } },
    ];
    mockPrisma.bookingRequest.findMany.mockResolvedValue(affectedBookings);
    mockPrisma.bookingRequest.updateMany.mockResolvedValue({ count: 2 });

    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    expect(mockPrisma.bookingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['booking-1', 'booking-2'] } },
        data: { status: 'ERROR' },
      }),
    );
    // notificationService.send is called for operators (0) + 2 affected users
    const sendCalls = (notificationService.send as jest.Mock).mock.calls;
    const userNotifCalls = sendCalls.filter(
      ([arg]) => arg.userId === 'user-1' || arg.userId === 'user-2',
    );
    expect(userNotifCalls).toHaveLength(2);
  });

  it('calls auditService.log for each cascaded booking', async () => {
    const affectedBookings = [
      { id: 'booking-1', userId: 'user-1', procedure: { name: 'Consultation' } },
    ];
    mockPrisma.bookingRequest.findMany.mockResolvedValue(affectedBookings);
    mockPrisma.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

    await circuitBreakerService.suspend(CONNECTOR_ID, REASON);

    // First auditService.log call is for the connector suspension itself
    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'BookingRequest',
        entityId: 'booking-1',
        after: expect.objectContaining({ status: 'ERROR', reason: 'CONNECTOR_SUSPENDED' }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reactivate()
// ─────────────────────────────────────────────────────────────────────────────

describe('reactivate()', () => {
  const ADMIN_USER_ID = 'admin-user-99';

  beforeEach(() => {
    mockPrisma.connector.update.mockResolvedValue({
      id: CONNECTOR_ID,
      name: 'My Connector',
      status: ConnectorStatus.ACTIVE,
    });
    mockRedis.del.mockResolvedValue(1);
    (auditService.log as jest.Mock).mockResolvedValue(undefined);
  });

  it('updates connector status to ACTIVE and clears suspendedReason/suspendedAt', async () => {
    await circuitBreakerService.reactivate(CONNECTOR_ID, ADMIN_USER_ID);

    expect(mockPrisma.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTOR_ID },
        data: {
          status: ConnectorStatus.ACTIVE,
          suspendedReason: null,
          suspendedAt: null,
        },
      }),
    );
  });

  it('deletes the Redis failures key after reactivating', async () => {
    await circuitBreakerService.reactivate(CONNECTOR_ID, ADMIN_USER_ID);

    expect(mockRedis.del).toHaveBeenCalledWith(FAILURES_KEY);
  });

  it('calls auditService.log with adminUserId and CONNECTOR_TOGGLE action', async () => {
    await circuitBreakerService.reactivate(CONNECTOR_ID, ADMIN_USER_ID);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        action: AuditAction.CONNECTOR_TOGGLE,
        entityId: CONNECTOR_ID,
        before: { status: 'SUSPENDED' },
        after: { status: 'ACTIVE' },
        metadata: { reactivatedBy: ADMIN_USER_ID },
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStatus()
// ─────────────────────────────────────────────────────────────────────────────

describe('getStatus()', () => {
  it('returns correct shape with failures from Redis and status from DB', async () => {
    const suspendedAt = new Date('2024-01-15T10:00:00Z');
    mockPrisma.connector.findUnique.mockResolvedValue({
      status: ConnectorStatus.SUSPENDED,
      suspendedReason: 'too many timeouts',
      suspendedAt,
    });
    mockRedis.get.mockResolvedValue('3');

    const result = await circuitBreakerService.getStatus(CONNECTOR_ID);

    expect(result).toEqual({
      connectorId: CONNECTOR_ID,
      isOpen: true,
      failures: 3,
      suspendedReason: 'too many timeouts',
      suspendedAt,
      connectorStatus: ConnectorStatus.SUSPENDED,
    });
    expect(mockRedis.get).toHaveBeenCalledWith(FAILURES_KEY);
  });

  it('defaults failures to 0 when Redis returns null', async () => {
    mockPrisma.connector.findUnique.mockResolvedValue({
      status: ConnectorStatus.ACTIVE,
      suspendedReason: null,
      suspendedAt: null,
    });
    mockRedis.get.mockResolvedValue(null);

    const result = await circuitBreakerService.getStatus(CONNECTOR_ID);

    expect(result.failures).toBe(0);
    expect(result.isOpen).toBe(false);
  });

  it('defaults connectorStatus to ACTIVE when connector is not found in DB', async () => {
    mockPrisma.connector.findUnique.mockResolvedValue(null);
    mockRedis.get.mockResolvedValue(null);

    const result = await circuitBreakerService.getStatus(CONNECTOR_ID);

    expect(result.connectorStatus).toBe(ConnectorStatus.ACTIVE);
    expect(result.isOpen).toBe(false);
    expect(result.suspendedReason).toBeNull();
    expect(result.suspendedAt).toBeNull();
  });
});
