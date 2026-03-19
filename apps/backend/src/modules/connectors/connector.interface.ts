/**
 * Base interface that every connector adapter must implement.
 * A connector represents the integration layer with an official portal.
 * 
 * IMPORTANT: Connectors must NEVER:
 * - Bypass CAPTCHA or anti-bot systems
 * - Evade rate limiting
 * - Simulate human behavior to circumvent security controls
 * - Access portals in ways that violate their Terms of Service
 */

export interface TimeSlot {
  date: string;       // ISO date
  time: string;       // HH:mm
  available: boolean;
  slotId?: string;
}

export interface BookingResult {
  success: boolean;
  confirmationCode?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  location?: string;
  instructions?: string;
  receiptData?: Record<string, unknown>;
  errorMessage?: string;
}

export interface ConnectorMetadata {
  id: string;
  name: string;
  organizationSlug: string;
  country: string;
  region?: string;
  integrationType: 'OFFICIAL_API' | 'AUTHORIZED_INTEGRATION' | 'MANUAL_ASSISTED';
  canCheckAvailability: boolean;
  canBook: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  legalBasis?: string;
  termsOfServiceUrl?: string;
  complianceLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface IConnector {
  readonly metadata: ConnectorMetadata;

  /**
   * Check if the connector is healthy and reachable.
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get available time slots for a procedure.
   * Only available if canCheckAvailability is true.
   */
  getAvailability?(procedureId: string, fromDate: string, toDate: string): Promise<TimeSlot[]>;

  /**
   * Book an appointment.
   * Only available if canBook is true and integration type allows it.
   */
  book?(bookingData: Record<string, unknown>): Promise<BookingResult>;

  /**
   * Cancel an existing appointment.
   */
  cancel?(confirmationCode: string, reason?: string): Promise<boolean>;

  /**
   * Reschedule an existing appointment.
   */
  reschedule?(confirmationCode: string, newSlot: TimeSlot): Promise<BookingResult>;
}
