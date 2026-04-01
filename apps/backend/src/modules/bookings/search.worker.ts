/**
 * SearchWorker — BullMQ worker that processes booking search jobs.
 *
 * Replaces the legacy `_runSearchLoop` in BookingService.
 * Each job represents a single search attempt for a booking request.
 *
 * Flow:
 *   1. Verify booking is still in SEARCHING status
 *   2. Check circuit breaker for the connector
 *   3. Call getAvailability() on the connector
 *   4. Filter slots by user preferences (morning < 14h, afternoon >= 14h)
 *   5. If slot found → book() → PRE_CONFIRMED
 *   6. If no slot → throw so BullMQ retries with backoff
 *   7. Record each attempt in BookingAttempt
 *   8. CircuitBreakerError → record failure, move to ERROR
 *   9. Max attempts reached → ERROR + notify user
 */

import { Worker, Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { connectorRegistry } from '../connectors/connector.registry';
import { circuitBreakerService } from '../connectors/circuit-breaker.service';
import { CircuitBreakerError } from '../connectors/adapters/base-real.connector';
import { bookingService } from './booking.service';
import { notificationService } from '../notifications/notification.service';
import { auditService } from '../audit/audit.service';
import { SEARCH_QUEUE_NAME, SEARCH_QUEUE_CONFIG } from './search.queue';

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchJobData {
  bookingRequestId: string;
}

// ── Worker processor ─────────────────────────────────────────────────────────

async function processSearchJob(job: Job<SearchJobData>): Promise<void> {
  const { bookingRequestId } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  logger.info('SearchWorker: processing job', {
    bookingRequestId,
    attemptNumber,
    jobId: job.id,
  });

  // 1. Load booking with procedure + connector + profile
  const booking = await prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    include: {
      procedure: { include: { connector: true } },
      applicantProfile: true,
    },
  });

  if (!booking) {
    logger.warn('SearchWorker: booking not found, skipping', { bookingRequestId });
    return;
  }

  // 1b. Verify booking is still SEARCHING
  if (booking.status !== 'SEARCHING') {
    logger.info('SearchWorker: booking not in SEARCHING status, skipping', {
      bookingRequestId,
      currentStatus: booking.status,
    });
    return;
  }

  const connector = booking.procedure.connector;
  if (!connector) {
    logger.warn('SearchWorker: no connector associated with procedure', {
      bookingRequestId,
      procedureId: booking.procedureId,
    });
    return;
  }

  const adapterConnector = connectorRegistry.get(connector.slug);
  if (!adapterConnector?.getAvailability) {
    logger.warn('SearchWorker: connector adapter not found or missing getAvailability', {
      bookingRequestId,
      connectorSlug: connector.slug,
    });
    return;
  }

  // 2. Check circuit breaker
  const circuitOpen = await circuitBreakerService.isOpen(connector.id);
  if (circuitOpen) {
    logger.warn('SearchWorker: circuit breaker open, moving to ERROR', {
      bookingRequestId,
      connectorId: connector.id,
    });
    await prisma.bookingRequest.update({
      where: { id: bookingRequestId },
      data: { status: 'ERROR' },
    });
    await auditService.log({
      userId: booking.userId,
      action: 'UPDATE',
      entityType: 'BookingRequest',
      entityId: bookingRequestId,
      before: { status: 'SEARCHING' },
      after: { status: 'ERROR', reason: 'CONNECTOR_SUSPENDED' },
    });
    await notificationService.send({
      userId: booking.userId,
      title: 'Búsqueda cancelada',
      body: `La búsqueda de cita para "${booking.procedure.name}" fue cancelada porque el servicio del portal está temporalmente no disponible. Te notificaremos cuando se restablezca.`,
      metadata: { bookingId: bookingRequestId, reason: 'CONNECTOR_SUSPENDED' },
    });
    return;
  }

  // 3. Call getAvailability and measure response time
  const startTime = Date.now();
  let httpStatusCode: number | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const dateFrom = booking.preferredDateFrom?.toISOString() ?? new Date().toISOString();
    const dateTo = booking.preferredDateTo?.toISOString()
      ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const slots = await adapterConnector.getAvailability(
      booking.procedureId,
      dateFrom,
      dateTo,
    );

    const responseTimeMs = Date.now() - startTime;
    httpStatusCode = 200;

    // 4. Filter slots by user preferences
    const filtered = (slots || []).filter((s) => {
      if (!s.available) return false;
      if (!booking.preferredTimeSlot) return true;
      const hour = parseInt((s.time || '12:00').split(':')[0], 10);
      return booking.preferredTimeSlot === 'morning' ? hour < 14 : hour >= 14;
    });

    if (filtered.length > 0) {
      // 5. Slot found → book it
      const slot = filtered[0];

      if (adapterConnector.book) {
        const bookResult = await adapterConnector.book({
          selectedDate: slot.date,
          selectedTime: slot.time,
          applicantName: `${booking.applicantProfile.firstName} ${booking.applicantProfile.lastName}`,
          procedureName: booking.procedure.name,
        });

        if (bookResult.success) {
          success = true;

          // Record successful attempt
          await prisma.bookingAttempt.create({
            data: {
              bookingRequestId,
              connectorId: connector.id,
              attemptNumber,
              success: true,
              response: bookResult as object,
              responseTimeMs,
              httpStatusCode,
            },
          });

          // Move to PRE_CONFIRMED via existing _confirmSlot
          await bookingService._confirmSlot(
            { ...booking, procedure: booking.procedure },
            {
              appointmentDate: bookResult.appointmentDate ?? slot.date,
              appointmentTime: bookResult.appointmentTime ?? slot.time,
              location: bookResult.location,
              confirmationCode: bookResult.confirmationCode ?? slot.slotId ?? `REF-${Date.now()}`,
            },
          );

          await circuitBreakerService.recordSuccess(connector.id);
          return;
        } else {
          // Book failed — record and continue to retry
          errorMessage = bookResult.errorMessage ?? 'Booking failed on portal';
        }
      } else {
        // Connector can't book — use _confirmSlot directly
        success = true;

        await prisma.bookingAttempt.create({
          data: {
            bookingRequestId,
            connectorId: connector.id,
            attemptNumber,
            success: true,
            responseTimeMs,
            httpStatusCode,
          },
        });

        await bookingService._confirmSlot(
          { ...booking, procedure: booking.procedure },
          {
            appointmentDate: slot.date,
            appointmentTime: slot.time,
            confirmationCode: slot.slotId ?? `REF-${Date.now()}`,
          },
        );

        await circuitBreakerService.recordSuccess(connector.id);
        return;
      }
    }

    // 6. No slot found (or book failed) — record attempt and throw to trigger retry
    await prisma.bookingAttempt.create({
      data: {
        bookingRequestId,
        connectorId: connector.id,
        attemptNumber,
        success: false,
        errorMessage: errorMessage ?? 'No matching slots found',
        responseTimeMs,
        httpStatusCode,
      },
    });

    await circuitBreakerService.recordSuccess(connector.id);

    throw new Error('No matching slots found — will retry');
  } catch (err) {
    const responseTimeMs = Date.now() - startTime;

    // 8. CircuitBreakerError → record failure and move to ERROR
    if (err instanceof CircuitBreakerError) {
      logger.error('SearchWorker: CircuitBreakerError detected', {
        bookingRequestId,
        reason: err.reason,
      });

      await prisma.bookingAttempt.create({
        data: {
          bookingRequestId,
          connectorId: connector.id,
          attemptNumber,
          success: false,
          errorMessage: err.message,
          responseTimeMs,
          httpStatusCode: httpStatusCode ?? 0,
        },
      });

      await circuitBreakerService.recordFailure(connector.id, err.reason);

      await prisma.bookingRequest.update({
        where: { id: bookingRequestId },
        data: { status: 'ERROR' },
      });

      // Audit: SEARCHING → ERROR (CircuitBreakerError)
      await auditService.log({
        userId: booking.userId,
        action: 'UPDATE',
        entityType: 'BookingRequest',
        entityId: bookingRequestId,
        before: { status: 'SEARCHING' },
        after: { status: 'ERROR', reason: err.reason },
      });

      await notificationService.send({
        userId: booking.userId,
        title: 'Búsqueda cancelada',
        body: `La búsqueda de cita para "${booking.procedure.name}" fue cancelada debido a un problema con el portal. Te notificaremos cuando se restablezca el servicio.`,
        metadata: { bookingId: bookingRequestId, reason: err.reason },
      });

      // Don't rethrow — job should not retry
      return;
    }

    // For "No matching slots" error we already recorded the attempt above.
    // For other unexpected errors, record the attempt now.
    if (!(err instanceof Error && err.message === 'No matching slots found — will retry')) {
      await prisma.bookingAttempt.create({
        data: {
          bookingRequestId,
          connectorId: connector.id,
          attemptNumber,
          success: false,
          errorMessage: err instanceof Error ? err.message : String(err),
          responseTimeMs,
          httpStatusCode: httpStatusCode ?? 0,
        },
      });
    }

    // Re-throw so BullMQ retries with backoff
    throw err;
  }
}

// ── Failed handler (max attempts reached) ────────────────────────────────────

async function onSearchJobFailed(
  job: Job<SearchJobData> | undefined,
  err: Error,
): Promise<void> {
  if (!job) return;

  const { bookingRequestId } = job.data;
  const isMaxAttempts = job.attemptsMade >= SEARCH_QUEUE_CONFIG.maxAttempts;

  if (!isMaxAttempts) return;

  // 9. Max attempts reached → ERROR + notify user
  logger.error('SearchWorker: max attempts reached', {
    bookingRequestId,
    attempts: job.attemptsMade,
    lastError: err.message,
  });

  try {
    const booking = await prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      include: { procedure: true },
    });

    if (booking && booking.status === 'SEARCHING') {
      await prisma.bookingRequest.update({
        where: { id: bookingRequestId },
        data: { status: 'ERROR' },
      });

      // Audit: SEARCHING → ERROR (max attempts reached)
      await auditService.log({
        userId: booking.userId,
        action: 'UPDATE',
        entityType: 'BookingRequest',
        entityId: bookingRequestId,
        before: { status: 'SEARCHING' },
        after: { status: 'ERROR', reason: 'MAX_ATTEMPTS_REACHED' },
      });

      await notificationService.send({
        userId: booking.userId,
        title: 'No se encontró cita disponible',
        body: `Lamentablemente, no pudimos encontrar una cita disponible para "${booking.procedure.name}" después de ${job.attemptsMade} intentos. Podés intentar crear una nueva solicitud con un rango de fechas más amplio.`,
        metadata: { bookingId: bookingRequestId, reason: 'MAX_ATTEMPTS_REACHED' },
      });
    }
  } catch (notifyErr) {
    logger.error('SearchWorker: failed to handle max attempts', {
      bookingRequestId,
      error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
    });
  }
}

// ── Start worker ─────────────────────────────────────────────────────────────

export function startSearchWorker(): Worker<SearchJobData> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsedUrl = new URL(redisUrl);

  const worker = new Worker<SearchJobData>(
    SEARCH_QUEUE_NAME,
    processSearchJob,
    {
      connection: {
        host: parsedUrl.hostname,
        port: Number(parsedUrl.port) || 6379,
        password: parsedUrl.password || undefined,
      },
      concurrency: SEARCH_QUEUE_CONFIG.concurrency,
    },
  );

  worker.on('failed', (job, err) => {
    onSearchJobFailed(job, err);
  });

  worker.on('error', (err) => {
    logger.error('SearchWorker: worker error', { error: err.message });
  });

  worker.on('completed', (job) => {
    logger.info('SearchWorker: job completed', {
      jobId: job.id,
      bookingRequestId: job.data.bookingRequestId,
    });
  });

  logger.info('SearchWorker started', { queue: SEARCH_QUEUE_NAME });

  return worker;
}
