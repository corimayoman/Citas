import { processAutoCancellation, startAutoCancellationCron, AUTO_CANCEL_QUEUE_NAME } from '../auto-cancellation.cron';
import { prisma } from '../../../lib/prisma';
import { connectorRegistry } from '../../connectors/connector.registry';
import { notificationService } from '../../notifications/notification.service';
import { auditService } from '../../audit/audit.service';
import { logger } from '../../../lib/logger';
import { Queue, Worker } from 'bullmq';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    bookingRequest: { findMany: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

jest.mock('../../../lib/redis', () => ({
  getBullMQConnection: jest.fn().mockReturnValue({ connection: { host: 'localhost', port: 6379 } }),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  Job: jest.fn(),
}));

jest.mock('../../connectors/connector.registry', () => ({
  connectorRegistry: { get: jest.fn() },
}));

jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockBooking = {
  id: 'booking-1',
  userId: 'user-1',
  externalRef: 'REF-001',
  status: 'PRE_CONFIRMED',
  procedure: {
    name: 'Trámite',
    connector: { id: 'connector-1', slug: 'aeat', name: 'AEAT' },
  },
  appointment: { confirmationCode: 'CODE-123' },
};

const mockJob = {} as any;

beforeEach(() => {
  jest.clearAllMocks();
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  (notificationService.send as jest.Mock).mockResolvedValue(undefined);
  (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
  (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);
});

describe('AUTO_CANCEL_QUEUE_NAME', () => {
  it('is "auto-cancellation"', () => {
    expect(AUTO_CANCEL_QUEUE_NAME).toBe('auto-cancellation');
  });
});

describe('processAutoCancellation', () => {
  it('no expired bookings: logs message and returns early without calling update', async () => {
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([]);

    await processAutoCancellation(mockJob);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('no expired bookings found'));
    expect(mockPrisma.bookingRequest.update).not.toHaveBeenCalled();
  });

  it('expired booking with no connector: updates status to EXPIRED', async () => {
    const bookingNoConnector = {
      ...mockBooking,
      procedure: { ...mockBooking.procedure, connector: null },
    };
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([bookingNoConnector]);

    await processAutoCancellation(mockJob);

    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'EXPIRED' },
    });
  });

  it('expired booking with no connector: calls notificationService.send to user', async () => {
    const bookingNoConnector = {
      ...mockBooking,
      procedure: { ...mockBooking.procedure, connector: null },
    };
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([bookingNoConnector]);

    await processAutoCancellation(mockJob);

    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('connector with cancel() returning true: updates to EXPIRED', async () => {
    const mockAdapter = { cancel: jest.fn().mockResolvedValue(true) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);

    await processAutoCancellation(mockJob);

    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'EXPIRED' },
    });
  });

  it('connector with cancel() returning true: calls auditService.log', async () => {
    const mockAdapter = { cancel: jest.fn().mockResolvedValue(true) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);

    await processAutoCancellation(mockJob);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'booking-1',
        after: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });

  it('connector.cancel() returns false: updates status to ERROR', async () => {
    const mockAdapter = { cancel: jest.fn().mockResolvedValue(false) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'operator-1' }]);

    await processAutoCancellation(mockJob);

    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'ERROR' },
    });
  });

  it('connector.cancel() returns false: calls prisma.user.findMany to find operators', async () => {
    const mockAdapter = { cancel: jest.fn().mockResolvedValue(false) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'operator-1' }]);

    await processAutoCancellation(mockJob);

    expect(mockPrisma.user.findMany).toHaveBeenCalled();
  });

  it('connector.cancel() returns false: notifies user about the problem', async () => {
    const mockAdapter = { cancel: jest.fn().mockResolvedValue(false) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'operator-1' }]);

    await processAutoCancellation(mockJob);

    // User notification
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        metadata: expect.objectContaining({ reason: 'AUTO_CANCEL_FAILED' }),
      }),
    );
  });

  it('connector.cancel() throws: moves booking to ERROR', async () => {
    const mockAdapter = { cancel: jest.fn().mockRejectedValue(new Error('portal down')) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await processAutoCancellation(mockJob);

    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { status: 'ERROR' },
    });
  });

  it('connector.cancel() throws: notifies operators', async () => {
    const mockAdapter = { cancel: jest.fn().mockRejectedValue(new Error('portal down')) };
    (connectorRegistry.get as jest.Mock).mockReturnValue(mockAdapter);
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([mockBooking]);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'operator-1' }]);

    await processAutoCancellation(mockJob);

    expect(mockPrisma.user.findMany).toHaveBeenCalled();
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'operator-1' }),
    );
  });
});

describe('startAutoCancellationCron', () => {
  it('returns { queue, worker }', () => {
    const result = startAutoCancellationCron();

    expect(result).toHaveProperty('queue');
    expect(result).toHaveProperty('worker');
  });

  it('instantiates Queue with AUTO_CANCEL_QUEUE_NAME', () => {
    startAutoCancellationCron();

    expect(Queue).toHaveBeenCalledWith(AUTO_CANCEL_QUEUE_NAME, expect.any(Object));
  });

  it('instantiates Worker with AUTO_CANCEL_QUEUE_NAME and processAutoCancellation processor', () => {
    startAutoCancellationCron();

    expect(Worker).toHaveBeenCalledWith(
      AUTO_CANCEL_QUEUE_NAME,
      processAutoCancellation,
      expect.any(Object),
    );
  });
});
