/**
 * AutoCancellationCronJob — BullMQ repeatable job that cancels unpaid bookings.
 *
 * Runs every 5 minutes. For each PRE_CONFIRMED booking whose paymentDeadline
 * has passed:
 *   1. Get the connector for the booking's procedure
 *   2. If the connector has a cancel() method, call cancel(confirmationCode)
 *   3. If cancellation succeeds → EXPIRED + notify user
 *   4. If cancellation fails → ERROR + alert operations
 *   5. If no connector or no cancel method → EXPIRED + notify user
 *   6. Log each cancellation in AuditLog
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { Queue, Worker, Job } from 'bullmq';
import { AuditAction, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getBullMQConnection } from '../../lib/redis';
import { connectorRegistry } from '../connectors/connector.registry';
import { notificationService } from '../notifications/notification.service';
import { auditService } from '../audit/audit.service';

// ── Constants ────────────────────────────────────────────────────────────────

export const AUTO_CANCEL_QUEUE_NAME = 'auto-cancellation';
const CRON_EVERY_5_MIN = '*/5 * * * *';

// ── Job processor ────────────────────────────────────────────────────────────

export async function processAutoCancellation(_job: Job): Promise<void> {
  logger.info('AutoCancellation: starting sweep');

  // 1. Find all PRE_CONFIRMED bookings with expired paymentDeadline
  const expiredBookings = await prisma.bookingRequest.findMany({
    where: {
      status: 'PRE_CONFIRMED',
      paymentDeadline: { lt: new Date() },
    },
    include: {
      procedure: { include: { connector: true } },
      appointment: true,
    },
  });

  if (expiredBookings.length === 0) {
    logger.info('AutoCancellation: no expired bookings found');
    return;
  }

  logger.info(`AutoCancellation: found ${expiredBookings.length} expired booking(s)`);

  for (const booking of expiredBookings) {
    await cancelExpiredBooking(booking);
  }
}

// ── Per-booking cancellation logic ───────────────────────────────────────────

async function cancelExpiredBooking(
  booking: Awaited<ReturnType<typeof prisma.bookingRequest.findMany>>[number] & {
    procedure: { connector: { id: string; slug: string; name: string } | null; name: string };
    appointment: { confirmationCode: string | null } | null;
  },
): Promise<void> {
  const bookingId = booking.id;
  const connector = booking.procedure.connector;
  const confirmationCode =
    booking.appointment?.confirmationCode ?? booking.externalRef ?? null;

  logger.info('AutoCancellation: processing booking', {
    bookingId,
    connectorSlug: connector?.slug,
    confirmationCode,
  });

  try {
    // 2. Try to cancel on the portal if connector supports it
    let portalCancelSuccess = true;
    let portalCancelAttempted = false;

    if (connector && confirmationCode) {
      const adapter = connectorRegistry.get(connector.slug);

      if (adapter?.cancel) {
        portalCancelAttempted = true;
        try {
          portalCancelSuccess = await adapter.cancel(confirmationCode);
        } catch (err) {
          portalCancelSuccess = false;
          logger.error('AutoCancellation: portal cancel threw', {
            bookingId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (portalCancelAttempted && !portalCancelSuccess) {
      // 4. Cancellation failed → ERROR + alert operations
      await prisma.bookingRequest.update({
        where: { id: bookingId },
        data: { status: 'ERROR' },
      });

      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'BookingRequest',
        entityId: bookingId,
        before: { status: 'PRE_CONFIRMED' },
        after: { status: 'ERROR', reason: 'AUTO_CANCEL_FAILED' },
        metadata: { trigger: 'auto-cancellation', confirmationCode },
      });

      // Alert operations (OPERATOR / ADMIN)
      await notifyOperators(bookingId, booking.procedure.name, connector!.name);

      // Notify the user that their booking has an issue
      await notificationService.send({
        userId: booking.userId,
        title: 'Problema con la cancelación de tu cita',
        body:
          `Hubo un problema al intentar cancelar automáticamente tu cita para "${booking.procedure.name}". ` +
          `Nuestro equipo de operaciones ha sido notificado y está trabajando para resolverlo. ` +
          `Te contactaremos con más información.`,
        metadata: {
          bookingId,
          reason: 'AUTO_CANCEL_FAILED',
        },
      });

      logger.error('AutoCancellation: portal cancel failed, moved to ERROR', {
        bookingId,
      });
      return;
    }

    // 3 & 5. Cancellation succeeded (or no cancel needed) → EXPIRED + notify user
    await prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { status: 'EXPIRED' },
    });

    // 6. Audit log
    await auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'BookingRequest',
      entityId: bookingId,
      before: { status: 'PRE_CONFIRMED' },
      after: { status: 'EXPIRED', reason: 'PAYMENT_DEADLINE_EXPIRED' },
      metadata: {
        trigger: 'auto-cancellation',
        portalCancelAttempted,
        portalCancelSuccess,
        confirmationCode,
      },
    });

    // Notify user
    await notificationService.send({
      userId: booking.userId,
      title: 'Cita cancelada por falta de pago',
      body:
        `Tu cita para "${booking.procedure.name}" fue cancelada automáticamente ` +
        `porque no se completó el pago antes del plazo límite. ` +
        `Podés crear una nueva solicitud si lo necesitás.`,
      metadata: {
        bookingId,
        reason: 'PAYMENT_DEADLINE_EXPIRED',
      },
    });

    logger.info('AutoCancellation: booking expired successfully', {
      bookingId,
      portalCancelAttempted,
    });
  } catch (err) {
    logger.error('AutoCancellation: unexpected error processing booking', {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Notify operators on cancellation failure ─────────────────────────────────

async function notifyOperators(
  bookingId: string,
  procedureName: string,
  connectorName: string,
): Promise<void> {
  const operators = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.OPERATOR, UserRole.ADMIN] },
      isActive: true,
    },
    select: { id: true },
  });

  const title = 'Error en cancelación automática';
  const body =
    `La cancelación automática de la reserva ${bookingId} ` +
    `(trámite: "${procedureName}", conector: "${connectorName}") falló en el portal. ` +
    `Se requiere intervención manual para liberar el slot.`;

  await Promise.allSettled(
    operators.map((op) =>
      notificationService.send({
        userId: op.id,
        title,
        body,
        metadata: { bookingId, type: 'AUTO_CANCEL_FAILURE' },
      }),
    ),
  );
}

// ── Start function ───────────────────────────────────────────────────────────

export function startAutoCancellationCron(): { queue: Queue; worker: Worker } {
  const queue = new Queue(AUTO_CANCEL_QUEUE_NAME, {
    ...getBullMQConnection(),
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  // Add repeatable job (every 5 minutes)
  queue.add('auto-cancel-sweep', {}, {
    repeat: { pattern: CRON_EVERY_5_MIN },
    jobId: 'auto-cancel-sweep-repeatable',
  });

  const worker = new Worker(
    AUTO_CANCEL_QUEUE_NAME,
    processAutoCancellation,
    { ...getBullMQConnection(), concurrency: 1 },
  );

  worker.on('error', (err) => {
    logger.error('AutoCancellation worker error', { error: err.message });
  });

  worker.on('completed', (job) => {
    logger.info('AutoCancellation sweep completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('AutoCancellation sweep failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info('AutoCancellation cron started', {
    queue: AUTO_CANCEL_QUEUE_NAME,
    schedule: CRON_EVERY_5_MIN,
  });

  return { queue, worker };
}
