/**
 * Booking State Machine
 *
 * Defines valid status transitions for BookingRequest and provides a
 * validation helper used across booking.service.ts and search.worker.ts.
 *
 * Valid state graph:
 *
 *   DRAFT ──────────────────────────────────────┐
 *   SEARCHING ──→ PRE_CONFIRMED ──→ CONFIRMED   │
 *   SEARCHING ──→ ERROR                          │
 *   PRE_CONFIRMED ──→ PAID ──→ IN_PROGRESS       │
 *   IN_PROGRESS ──→ COMPLETED                    │
 *   IN_PROGRESS ──→ REQUIRES_USER_ACTION         │
 *   IN_PROGRESS ──→ ERROR                        │
 *   Any cancellable state ──→ CANCELLED          │
 *   CONFIRMED ──→ COMPLETED ◄───────────────────┘
 */

import { AppError } from '../../middleware/errorHandler';

// ── Types ────────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'DRAFT'
  | 'SEARCHING'
  | 'PRE_CONFIRMED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR'
  | 'PAID'
  | 'IN_PROGRESS'
  | 'REQUIRES_USER_ACTION';

// ── Transition map ───────────────────────────────────────────────────────────

/**
 * Maps each status to the set of statuses it is allowed to transition into.
 * Any transition not listed here is invalid.
 */
export const VALID_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  DRAFT:                ['SEARCHING', 'CANCELLED'],
  SEARCHING:            ['PRE_CONFIRMED', 'ERROR', 'CANCELLED'],
  PRE_CONFIRMED:        ['CONFIRMED', 'PAID', 'CANCELLED', 'ERROR'],
  PAID:                 ['IN_PROGRESS', 'CONFIRMED', 'ERROR'],
  IN_PROGRESS:          ['COMPLETED', 'REQUIRES_USER_ACTION', 'ERROR'],
  CONFIRMED:            ['COMPLETED', 'CANCELLED'],
  REQUIRES_USER_ACTION: ['IN_PROGRESS', 'CANCELLED', 'ERROR'],
  COMPLETED:            [],   // terminal
  CANCELLED:            [],   // terminal
  ERROR:                ['SEARCHING', 'CANCELLED'], // can retry
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the transition from `from` → `to` is valid.
 */
export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly BookingStatus[]).includes(to);
}

/**
 * Throws an AppError if the transition from `from` → `to` is not in the
 * allowed transition map. Use this before updating a booking's status.
 */
export function assertValidTransition(
  from: BookingStatus,
  to: BookingStatus,
  bookingId?: string,
): void {
  if (!isValidTransition(from, to)) {
    throw new AppError(
      409,
      `Transición de estado inválida: ${from} → ${to}${bookingId ? ` (booking: ${bookingId})` : ''}`,
      'INVALID_STATUS_TRANSITION',
      { from, to, bookingId },
    );
  }
}

/**
 * Returns true if the status is terminal (no further transitions allowed).
 */
export function isTerminalStatus(status: BookingStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}

/**
 * Returns the list of statuses that can be cancelled.
 */
export const CANCELLABLE_STATUSES: readonly BookingStatus[] = (
  Object.entries(VALID_TRANSITIONS) as [BookingStatus, readonly BookingStatus[]][]
)
  .filter(([, targets]) => targets.includes('CANCELLED'))
  .map(([status]) => status);
