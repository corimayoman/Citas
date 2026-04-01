/**
 * DataPurgeCronJob — BullMQ repeatable job that purges sensitive formData
 * from bookings older than 30 days.
 *
 * Runs once daily. For each BookingRequest WHERE:
 *   - status IN ('CONFIRMED', 'EXPIRED', 'COMPLETED')
 *   - completedAt < NOW() - 30 days (for CONFIRMED/COMPLETED)
 *   - updatedAt  < NOW() - 30 days (for EXPIRED)
 *   - formData has NOT already been purged
 *
 * Actions:
 *   1. Replace formData with { _purged: true, purgedAt: <ISO string> }
 *   2. Log each purge in AuditLog with action DATA_DELETE
 *
 * Requirements: 11.3
 */

import { Queue, Worker, Job } from 'bullmq';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getBullMQConnection } from '../../lib/redis';
import { auditService } from '../audit/audit.service';

// ── Constants ────────────────────────────────────────────────────────────────

export const DATA_PURGE_QUEUE_NAME = 'data-purge';
const CRON_DAILY = '0 3 * * *'; // every day at 03:00
const PURGE_AFTER_DAYS = 30;

// ── Job processor ────────────────────────────────────────────────────────────

export async function processDataPurge(_job: Job): Promise<void> {
  logger.info('DataPurge: starting sweep');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PURGE_AFTER_DAYS);

  // Find bookings eligible for purge:
  // CONFIRMED/COMPLETED: completedAt older than 30 days
  // EXPIRED: updatedAt older than 30 days
  const eligibleBookings = await prisma.bookingRequest.findMany({
    where: {
      OR: [
        {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          completedAt: { lt: cutoffDate },
        },
        {
          status: 'EXPIRED',
          updatedAt: { lt: cutoffDate },
        },
      ],
      // Exclude already-purged records by checking formData is not the purge marker.
      // Prisma JSON filtering: formData must NOT contain _purged = true
      NOT: {
        formData: { path: ['_purged'], equals: true },
      },
    },
    select: { id: true, userId: true, status: true },
  });

  if (eligibleBookings.length === 0) {
    logger.info('DataPurge: no bookings eligible for purge');
    return;
  }

  logger.info(`DataPurge: found ${eligibleBookings.length} booking(s) to purge`);

  const purgedAt = new Date().toISOString();
  let purgedCount = 0;

  for (const booking of eligibleBookings) {
    try {
      await prisma.bookingRequest.update({
        where: { id: booking.id },
        data: {
          formData: { _purged: true, purgedAt },
        },
      });

      await auditService.log({
        action: AuditAction.DATA_DELETE,
        entityType: 'BookingRequest',
        entityId: booking.id,
        userId: booking.userId,
        metadata: {
          trigger: 'data-purge-cron',
          reason: 'SENSITIVE_DATA_RETENTION_EXPIRED',
          bookingStatus: booking.status,
          purgedAt,
        },
      });

      purgedCount++;
    } catch (err) {
      logger.error('DataPurge: failed to purge booking', {
        bookingId: booking.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`DataPurge: purged ${purgedCount}/${eligibleBookings.length} booking(s)`);
}

// ── Start function ───────────────────────────────────────────────────────────

export function startDataPurgeCron(): { queue: Queue; worker: Worker } {
  const queue = new Queue(DATA_PURGE_QUEUE_NAME, {
    ...getBullMQConnection(),
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  // Add repeatable job (once daily at 03:00)
  queue.add('data-purge-sweep', {}, {
    repeat: { pattern: CRON_DAILY },
    jobId: 'data-purge-sweep-repeatable',
  });

  const worker = new Worker(
    DATA_PURGE_QUEUE_NAME,
    processDataPurge,
    { ...getBullMQConnection(), concurrency: 1 },
  );

  worker.on('error', (err) => {
    logger.error('DataPurge worker error', { error: err.message });
  });

  worker.on('completed', (job) => {
    logger.info('DataPurge sweep completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('DataPurge sweep failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info('DataPurge cron started', {
    queue: DATA_PURGE_QUEUE_NAME,
    schedule: CRON_DAILY,
  });

  return { queue, worker };
}
