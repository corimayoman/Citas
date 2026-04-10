import { processDataPurge, startDataPurgeCron, DATA_PURGE_QUEUE_NAME } from '../data-purge.cron';
import { prisma } from '../../../lib/prisma';
import { auditService } from '../../audit/audit.service';
import { logger } from '../../../lib/logger';
import { Queue, Worker } from 'bullmq';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    bookingRequest: { findMany: jest.fn(), update: jest.fn() },
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

jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockJob = {} as any;

beforeEach(() => {
  jest.clearAllMocks();
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
});

describe('processDataPurge', () => {
  it('no eligible bookings: returns early without calling update', async () => {
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([]);

    await processDataPurge(mockJob);

    expect(mockPrisma.bookingRequest.update).not.toHaveBeenCalled();
  });

  it('no eligible bookings: logs appropriate message', async () => {
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue([]);

    await processDataPurge(mockJob);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('no bookings eligible'));
  });

  it('eligible bookings: calls prisma.bookingRequest.update for each with purged formData', async () => {
    const bookings = [
      { id: 'booking-1', userId: 'user-1', status: 'CONFIRMED' },
      { id: 'booking-2', userId: 'user-2', status: 'EXPIRED' },
    ];
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue(bookings);

    await processDataPurge(mockJob);

    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: {
        formData: { _purged: true, purgedAt: expect.any(String) },
      },
    });
    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: 'booking-2' },
      data: {
        formData: { _purged: true, purgedAt: expect.any(String) },
      },
    });
  });

  it('eligible bookings: calls auditService.log with DATA_DELETE action for each booking', async () => {
    const bookings = [
      { id: 'booking-1', userId: 'user-1', status: 'CONFIRMED' },
      { id: 'booking-2', userId: 'user-2', status: 'EXPIRED' },
    ];
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue(bookings);

    await processDataPurge(mockJob);

    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DATA_DELETE',
        entityType: 'BookingRequest',
        entityId: 'booking-1',
        userId: 'user-1',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DATA_DELETE',
        entityType: 'BookingRequest',
        entityId: 'booking-2',
        userId: 'user-2',
      }),
    );
  });

  it('handles update error gracefully: logs error and continues to next booking', async () => {
    const bookings = [
      { id: 'booking-fail', userId: 'user-1', status: 'CONFIRMED' },
      { id: 'booking-ok', userId: 'user-2', status: 'CONFIRMED' },
    ];
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue(bookings);
    (mockPrisma.bookingRequest.update as jest.Mock)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({});

    await expect(processDataPurge(mockJob)).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to purge booking'),
      expect.objectContaining({ bookingId: 'booking-fail' }),
    );
    // Second booking should still be processed
    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'booking-ok' } }),
    );
  });

  it('handles update error: auditService.log not called for failed booking', async () => {
    const bookings = [{ id: 'booking-fail', userId: 'user-1', status: 'CONFIRMED' }];
    (mockPrisma.bookingRequest.findMany as jest.Mock).mockResolvedValue(bookings);
    (mockPrisma.bookingRequest.update as jest.Mock).mockRejectedValue(new Error('DB error'));

    await processDataPurge(mockJob);

    // audit should not be called if update threw
    expect(auditService.log).not.toHaveBeenCalled();
  });
});

describe('startDataPurgeCron', () => {
  it('returns { queue, worker }', () => {
    const result = startDataPurgeCron();

    expect(result).toHaveProperty('queue');
    expect(result).toHaveProperty('worker');
  });

  it('instantiates Queue with DATA_PURGE_QUEUE_NAME', () => {
    startDataPurgeCron();

    expect(Queue).toHaveBeenCalledWith(DATA_PURGE_QUEUE_NAME, expect.any(Object));
  });

  it('instantiates Worker with DATA_PURGE_QUEUE_NAME and processDataPurge processor', () => {
    startDataPurgeCron();

    expect(Worker).toHaveBeenCalledWith(
      DATA_PURGE_QUEUE_NAME,
      processDataPurge,
      expect.any(Object),
    );
  });
});
