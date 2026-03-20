/**
 * Mock connector — example implementation for development and testing.
 * Demonstrates the connector interface without connecting to any real portal.
 */
import { IConnector, ConnectorMetadata, TimeSlot, BookingResult } from '../connector.interface';

export class MockConnector implements IConnector {
  readonly metadata: ConnectorMetadata = {
    id: 'mock-connector-001',
    name: 'Organismo Mock (Demo)',
    organizationSlug: 'organismo-mock',
    country: 'ES',
    region: 'Madrid',
    integrationType: 'OFFICIAL_API',
    canCheckAvailability: true,
    canBook: true,
    canCancel: true,
    canReschedule: false,
    legalBasis: 'API pública oficial del organismo mock',
    termsOfServiceUrl: 'https://mock.organismo.gob.es/api/terms',
    complianceLevel: 'LOW',
  };

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async getAvailability(procedureId: string, fromDate: string, toDate: string): Promise<TimeSlot[]> {
    // Simulate available slots
    const slots: TimeSlot[] = [];
    const from = new Date(fromDate);
    const to = new Date(toDate);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
      const dateStr = d.toISOString().split('T')[0];
      ['09:00', '09:30', '10:00', '10:30', '11:00'].forEach((time, i) => {
        slots.push({
          date: dateStr,
          time,
          available: i !== 2, // simulate one unavailable slot
          slotId: `${dateStr}-${time}-${procedureId}`,
        });
      });
    }
    return slots;
  }

  async book(bookingData: Record<string, unknown>): Promise<BookingResult> {
    // Simulate successful booking — use provided date/time or generate defaults
    const confirmationCode = `MOCK-${Date.now()}`;
    const appointmentDate = (bookingData.selectedDate as string) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const appointmentTime = (bookingData.selectedTime as string) || '10:00';
    return {
      success: true,
      confirmationCode,
      appointmentDate,
      appointmentTime,
      location: 'Calle Ejemplo 123, Madrid',
      instructions: 'Traiga su DNI original y una copia. Llegue 10 minutos antes.',
      receiptData: {
        confirmationCode,
        issuedAt: new Date().toISOString(),
        applicant: bookingData.applicantName,
        procedure: bookingData.procedureName,
      },
    };
  }

  async cancel(confirmationCode: string): Promise<boolean> {
    console.log(`Mock: cancelling appointment ${confirmationCode}`);
    return true;
  }
}
