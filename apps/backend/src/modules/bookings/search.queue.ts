import { Queue } from 'bullmq';
import { logger } from '../../lib/logger';

export const SEARCH_QUEUE_NAME = 'booking-search';

const SEARCH_QUEUE_CONFIG = {
  maxAttempts: 20,
  backoff: {
    type: 'exponential' as const,
    delay: 30_000, // 30 seconds initial delay
  },
  concurrency: 3,
};

let searchQueue: Queue | null = null;

function getSearchQueue(): Queue {
  if (!searchQueue) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    searchQueue = new Queue(SEARCH_QUEUE_NAME, {
      connection: {
        host: new URL(redisUrl).hostname,
        port: Number(new URL(redisUrl).port) || 6379,
        password: new URL(redisUrl).password || undefined,
      },
      defaultJobOptions: {
        attempts: SEARCH_QUEUE_CONFIG.maxAttempts,
        backoff: SEARCH_QUEUE_CONFIG.backoff,
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    searchQueue.on('error', (err) => {
      logger.error('Search queue error', { error: err.message });
    });
  }

  return searchQueue;
}

/**
 * Adds a booking search job to the queue.
 * @returns The BullMQ job ID.
 */
export async function enqueueSearchJob(bookingRequestId: string): Promise<string> {
  const queue = getSearchQueue();
  const job = await queue.add(
    'search',
    { bookingRequestId },
    { jobId: `search-${bookingRequestId}` },
  );
  logger.info('Search job enqueued', { bookingRequestId, jobId: job.id });
  return job.id!;
}

/**
 * Removes a search job from the queue by its job ID.
 */
export async function removeSearchJob(jobId: string): Promise<void> {
  const queue = getSearchQueue();
  const job = await queue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info('Search job removed', { jobId });
  }
}

export { SEARCH_QUEUE_CONFIG, getSearchQueue };
