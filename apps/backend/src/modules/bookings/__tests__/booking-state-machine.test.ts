/**
 * Tests for the Booking State Machine
 * Validates all allowed and denied transitions.
 */

import {
  isValidTransition,
  assertValidTransition,
  isTerminalStatus,
  CANCELLABLE_STATUSES,
  VALID_TRANSITIONS,
  BookingStatus,
} from '../booking-state-machine';

// ── isValidTransition ─────────────────────────────────────────────────────────

describe('isValidTransition', () => {
  describe('allowed transitions', () => {
    const allowedCases: [BookingStatus, BookingStatus][] = [
      ['DRAFT', 'SEARCHING'],
      ['DRAFT', 'CANCELLED'],
      ['SEARCHING', 'PRE_CONFIRMED'],
      ['SEARCHING', 'ERROR'],
      ['SEARCHING', 'CANCELLED'],
      ['PRE_CONFIRMED', 'CONFIRMED'],
      ['PRE_CONFIRMED', 'PAID'],
      ['PRE_CONFIRMED', 'CANCELLED'],
      ['PRE_CONFIRMED', 'ERROR'],
      ['PAID', 'IN_PROGRESS'],
      ['PAID', 'CONFIRMED'],
      ['PAID', 'ERROR'],
      ['IN_PROGRESS', 'COMPLETED'],
      ['IN_PROGRESS', 'REQUIRES_USER_ACTION'],
      ['IN_PROGRESS', 'ERROR'],
      ['CONFIRMED', 'COMPLETED'],
      ['CONFIRMED', 'CANCELLED'],
      ['REQUIRES_USER_ACTION', 'IN_PROGRESS'],
      ['REQUIRES_USER_ACTION', 'CANCELLED'],
      ['REQUIRES_USER_ACTION', 'ERROR'],
      ['ERROR', 'SEARCHING'],
      ['ERROR', 'CANCELLED'],
    ];

    it.each(allowedCases)('%s → %s is allowed', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  });

  describe('denied transitions', () => {
    const deniedCases: [BookingStatus, BookingStatus][] = [
      // Terminal states cannot transition
      ['COMPLETED', 'CONFIRMED'],
      ['COMPLETED', 'CANCELLED'],
      ['COMPLETED', 'SEARCHING'],
      ['CANCELLED', 'SEARCHING'],
      ['CANCELLED', 'ERROR'],
      // Regressions
      ['PRE_CONFIRMED', 'SEARCHING'],
      ['CONFIRMED', 'SEARCHING'],
      ['CONFIRMED', 'PRE_CONFIRMED'],
      // Skipping states
      ['DRAFT', 'CONFIRMED'],
      ['DRAFT', 'COMPLETED'],
      ['SEARCHING', 'COMPLETED'],
      ['SEARCHING', 'CONFIRMED'],
    ];

    it.each(deniedCases)('%s → %s is denied', (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  });
});

// ── assertValidTransition ─────────────────────────────────────────────────────

describe('assertValidTransition', () => {
  it('does not throw for a valid transition', () => {
    expect(() => assertValidTransition('SEARCHING', 'PRE_CONFIRMED')).not.toThrow();
  });

  it('throws AppError with code INVALID_STATUS_TRANSITION for an invalid transition', () => {
    expect(() => assertValidTransition('COMPLETED', 'SEARCHING')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION', statusCode: 409 }),
    );
  });

  it('includes the bookingId in the error details when provided', () => {
    let caught: any;
    try {
      assertValidTransition('CANCELLED', 'ERROR', 'booking-abc');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.details?.bookingId).toBe('booking-abc');
    expect(caught.message).toContain('booking-abc');
  });

  it('includes from and to in the error message', () => {
    let caught: any;
    try {
      assertValidTransition('CONFIRMED', 'SEARCHING');
    } catch (e) {
      caught = e;
    }
    expect(caught.message).toContain('CONFIRMED');
    expect(caught.message).toContain('SEARCHING');
  });
});

// ── isTerminalStatus ──────────────────────────────────────────────────────────

describe('isTerminalStatus', () => {
  it('returns true for COMPLETED', () => {
    expect(isTerminalStatus('COMPLETED')).toBe(true);
  });

  it('returns true for CANCELLED', () => {
    expect(isTerminalStatus('CANCELLED')).toBe(true);
  });

  const nonTerminal: BookingStatus[] = [
    'DRAFT', 'SEARCHING', 'PRE_CONFIRMED', 'CONFIRMED',
    'PAID', 'IN_PROGRESS', 'REQUIRES_USER_ACTION', 'ERROR',
  ];

  it.each(nonTerminal)('%s is not terminal', (status) => {
    expect(isTerminalStatus(status)).toBe(false);
  });
});

// ── CANCELLABLE_STATUSES ──────────────────────────────────────────────────────

describe('CANCELLABLE_STATUSES', () => {
  it('includes all statuses that have CANCELLED in their transition list', () => {
    const expected = (Object.entries(VALID_TRANSITIONS) as [BookingStatus, readonly BookingStatus[]][])
      .filter(([, targets]) => targets.includes('CANCELLED'))
      .map(([s]) => s);

    expect([...CANCELLABLE_STATUSES].sort()).toEqual(expected.sort());
  });

  it('does not include terminal statuses', () => {
    expect(CANCELLABLE_STATUSES).not.toContain('COMPLETED');
    expect(CANCELLABLE_STATUSES).not.toContain('CANCELLED');
  });

  it('includes SEARCHING, PRE_CONFIRMED, DRAFT', () => {
    expect(CANCELLABLE_STATUSES).toContain('SEARCHING');
    expect(CANCELLABLE_STATUSES).toContain('PRE_CONFIRMED');
    expect(CANCELLABLE_STATUSES).toContain('DRAFT');
  });
});
