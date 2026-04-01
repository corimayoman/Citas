/**
 * Circuit Breaker Service
 *
 * Manages connector health using Redis for fast failure counters
 * and Prisma for persisting SUSPENDED status.
 *
 * Redis keys per connector:
 *   cb:{connectorId}:failures  – failure count (integer, with TTL = windowMs)
 *
 * When the failure count reaches the threshold within the window,
 * the connector is suspended in the database and operators are notified.
 */

import { ConnectorStatus, AuditAction, UserRole } from '@prisma/client';
import { getRedisClient } from '../../lib/redis';
import { prisma } from '../../lib/prisma';
import { auditService } from '../audit/audit.service';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../lib/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  /** Number of failures within the window to trigger suspension (default: 5) */
  failureThreshold: number;
  /** Time window in milliseconds for counting failures (default: 300_000 = 5 min) */
  windowMs: number;
}

export interface CircuitBreakerStatus {
  connectorId: string;
  isOpen: boolean;
  failures: number;
  suspendedReason: string | null;
  suspendedAt: Date | null;
  connectorStatus: ConnectorStatus;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 300_000, // 5 minutes
};

const KEY_PREFIX = 'cb';

function failuresKey(connectorId: string): string {
  return `${KEY_PREFIX}:${connectorId}:failures`;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const circuitBreakerService = {
  config: { ...DEFAULT_CONFIG },

  /**
   * Record a failure for a connector. If the failure count reaches the
   * threshold within the configured window, the connector is suspended.
   */
  async recordFailure(connectorId: string, reason: string): Promise<void> {
    const redis = getRedisClient();
    const key = failuresKey(connectorId);
    const windowSeconds = Math.ceil(this.config.windowMs / 1000);

    // Increment the counter; if the key is new, INCR creates it with value 1.
    const failures = await redis.incr(key);

    // Set TTL only on the first failure (when counter becomes 1) so the
    // window starts from the first failure.
    if (failures === 1) {
      await redis.expire(key, windowSeconds);
    }

    logger.warn(
      `CircuitBreaker: connector ${connectorId} failure #${failures} — ${reason}`,
    );

    if (failures >= this.config.failureThreshold) {
      await this.suspend(connectorId, reason);
    }
  },

  /**
   * Record a success for a connector, resetting the failure counter.
   */
  async recordSuccess(connectorId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(failuresKey(connectorId));
  },

  /**
   * Returns true if the circuit is open (connector should NOT be used).
   */
  async isOpen(connectorId: string): Promise<boolean> {
    const connector = await prisma.connector.findUnique({
      where: { id: connectorId },
      select: { status: true },
    });

    return connector?.status === ConnectorStatus.SUSPENDED;
  },

  /**
   * Suspend a connector: persist SUSPENDED status in DB, log to AuditLog,
   * and notify OPERATOR / ADMIN users.
   */
  async suspend(connectorId: string, reason: string): Promise<void> {
    const now = new Date();

    // Update connector status in DB
    const connector = await prisma.connector.update({
      where: { id: connectorId },
      data: {
        status: ConnectorStatus.SUSPENDED,
        suspendedReason: reason,
        suspendedAt: now,
      },
    });

    // Reset Redis counter (circuit is now open, no need to keep counting)
    const redis = getRedisClient();
    await redis.del(failuresKey(connectorId));

    // Audit log
    await auditService.log({
      action: AuditAction.CONNECTOR_TOGGLE,
      entityType: 'Connector',
      entityId: connectorId,
      before: { status: 'ACTIVE' } as object,
      after: { status: 'SUSPENDED', reason, suspendedAt: now.toISOString() } as object,
      metadata: { reason } as object,
    });

    logger.error(
      `CircuitBreaker: connector ${connectorId} (${connector.name}) SUSPENDED — ${reason}`,
    );

    // Notify all OPERATOR and ADMIN users
    await this._notifyOperators(connectorId, connector.name, reason);

    // Cascade: move SEARCHING bookings to ERROR and notify affected users (Req 7.6)
    await this._cascadeSearchingToError(connectorId, connector.name);
  },

  /**
   * Reactivate a suspended connector. Only callable by an admin.
   */
  async reactivate(connectorId: string, adminUserId: string): Promise<void> {
    const connector = await prisma.connector.update({
      where: { id: connectorId },
      data: {
        status: ConnectorStatus.ACTIVE,
        suspendedReason: null,
        suspendedAt: null,
      },
    });

    // Reset Redis counter
    const redis = getRedisClient();
    await redis.del(failuresKey(connectorId));

    // Audit log
    await auditService.log({
      userId: adminUserId,
      action: AuditAction.CONNECTOR_TOGGLE,
      entityType: 'Connector',
      entityId: connectorId,
      before: { status: 'SUSPENDED' } as object,
      after: { status: 'ACTIVE' } as object,
      metadata: { reactivatedBy: adminUserId } as object,
    });

    logger.info(
      `CircuitBreaker: connector ${connectorId} (${connector.name}) reactivated by ${adminUserId}`,
    );
  },

  /**
   * Get the current circuit breaker status for a connector.
   */
  async getStatus(connectorId: string): Promise<CircuitBreakerStatus> {
    const redis = getRedisClient();

    const [connector, rawFailures] = await Promise.all([
      prisma.connector.findUnique({
        where: { id: connectorId },
        select: { status: true, suspendedReason: true, suspendedAt: true },
      }),
      redis.get(failuresKey(connectorId)),
    ]);

    const failures = rawFailures ? parseInt(rawFailures, 10) : 0;
    const connectorStatus = connector?.status ?? ConnectorStatus.ACTIVE;

    return {
      connectorId,
      isOpen: connectorStatus === ConnectorStatus.SUSPENDED,
      failures,
      suspendedReason: connector?.suspendedReason ?? null,
      suspendedAt: connector?.suspendedAt ?? null,
      connectorStatus,
    };
  },

  /**
   * Send a notification to all users with OPERATOR or ADMIN role.
   */
  async _notifyOperators(
    connectorId: string,
    connectorName: string,
    reason: string,
  ): Promise<void> {
    const operators = await prisma.user.findMany({
      where: {
        role: { in: [UserRole.OPERATOR, UserRole.ADMIN] },
        isActive: true,
      },
      select: { id: true },
    });

    const title = `Conector suspendido: ${connectorName}`;
    const body =
      `El conector "${connectorName}" (${connectorId}) ha sido suspendido automáticamente.\n` +
      `Motivo: ${reason}\n` +
      `Se requiere revisión manual para reactivarlo.`;

    await Promise.allSettled(
      operators.map((op) =>
        notificationService.send({
          userId: op.id,
          title,
          body,
          metadata: { connectorId, reason, type: 'CIRCUIT_BREAKER_SUSPENSION' },
        }),
      ),
    );
  },

  /**
   * Cascade SEARCHING → ERROR when a connector is suspended (Req 7.6).
   * Finds all SEARCHING bookings for this connector, moves them to ERROR,
   * and notifies the affected users.
   */
  async _cascadeSearchingToError(
    connectorId: string,
    connectorName: string,
  ): Promise<void> {
    // Find all SEARCHING bookings whose procedure uses this connector
    const affectedBookings = await prisma.bookingRequest.findMany({
      where: {
        status: 'SEARCHING',
        procedure: { connectorId },
      },
      select: { id: true, userId: true, procedure: { select: { name: true } } },
    });

    if (affectedBookings.length === 0) return;

    const bookingIds = affectedBookings.map((b) => b.id);

    // Bulk-update all affected bookings to ERROR
    await prisma.bookingRequest.updateMany({
      where: { id: { in: bookingIds } },
      data: { status: 'ERROR' },
    });

    // Audit: SEARCHING → ERROR for each cascaded booking
    await Promise.allSettled(
      affectedBookings.map((booking) =>
        auditService.log({
          userId: booking.userId,
          action: AuditAction.UPDATE,
          entityType: 'BookingRequest',
          entityId: booking.id,
          before: { status: 'SEARCHING' } as object,
          after: { status: 'ERROR', reason: 'CONNECTOR_SUSPENDED' } as object,
          metadata: { trigger: 'circuit-breaker-cascade', connectorId } as object,
        }),
      ),
    );

    logger.info(
      `CircuitBreaker: moved ${affectedBookings.length} SEARCHING booking(s) to ERROR for connector ${connectorId}`,
    );

    // Notify each affected user
    await Promise.allSettled(
      affectedBookings.map((booking) =>
        notificationService.send({
          userId: booking.userId,
          title: 'Búsqueda de cita interrumpida',
          body:
            `La búsqueda de cita para "${booking.procedure.name}" fue interrumpida ` +
            `porque el servicio del portal (${connectorName}) está temporalmente no disponible. ` +
            `Te notificaremos cuando se restablezca el servicio.`,
          metadata: {
            bookingId: booking.id,
            connectorId,
            reason: 'CONNECTOR_SUSPENDED',
          },
        }),
      ),
    );
  },
};
