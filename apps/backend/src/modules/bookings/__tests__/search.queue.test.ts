import { Queue } from 'bullmq';

jest.mock('../../../lib/redis', () => ({
  getBullMQConnection: jest.fn().mockReturnValue({ connection: { host: 'localhost', port: 6379 } }),
}));

const mockAdd = jest.fn().mockResolvedValue({ id: 'job-123' });
const mockGetJob = jest.fn();
const mockOn = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    getJob: mockGetJob,
    on: mockOn,
  })),
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

// Reset module singleton between tests so each test gets a fresh Queue instance
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockAdd.mockResolvedValue({ id: 'job-123' });
  mockGetJob.mockReset();
});

describe('SEARCH_QUEUE_NAME', () => {
  it('is "booking-search"', async () => {
    const { SEARCH_QUEUE_NAME } = await import('../search.queue');
    expect(SEARCH_QUEUE_NAME).toBe('booking-search');
  });
});

describe('enqueueSearchJob', () => {
  it('calls queue.add with correct jobId format search-{bookingRequestId}', async () => {
    const { enqueueSearchJob } = await import('../search.queue');

    await enqueueSearchJob('booking-42');

    expect(mockAdd).toHaveBeenCalledWith(
      'search',
      { bookingRequestId: 'booking-42' },
      { jobId: 'search-booking-42' },
    );
  });

  it('returns the job id from queue.add', async () => {
    const { enqueueSearchJob } = await import('../search.queue');

    const jobId = await enqueueSearchJob('booking-42');

    expect(jobId).toBe('job-123');
  });
});

describe('removeSearchJob', () => {
  it('calls job.remove() when job exists', async () => {
    const mockRemove = jest.fn().mockResolvedValue(undefined);
    mockGetJob.mockResolvedValue({ remove: mockRemove });

    const { removeSearchJob } = await import('../search.queue');

    await removeSearchJob('search-booking-42');

    expect(mockGetJob).toHaveBeenCalledWith('search-booking-42');
    expect(mockRemove).toHaveBeenCalled();
  });

  it('does nothing when job not found (getJob returns null)', async () => {
    mockGetJob.mockResolvedValue(null);

    const { removeSearchJob } = await import('../search.queue');

    await expect(removeSearchJob('search-nonexistent')).resolves.not.toThrow();
    expect(mockGetJob).toHaveBeenCalledWith('search-nonexistent');
  });
});
