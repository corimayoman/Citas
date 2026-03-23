import { connectorRegistry } from '../connector.registry';
import { MockConnector } from '../adapters/mock.connector';

describe('ConnectorRegistry', () => {
  it('get("mock-connector-001"): retorna el MockConnector registrado por defecto', () => {
    const connector = connectorRegistry.get('mock-connector-001');
    expect(connector).toBeInstanceOf(MockConnector);
  });

  it('get("organismo-mock"): retorna el MockConnector por slug', () => {
    const connector = connectorRegistry.get('organismo-mock');
    expect(connector).toBeInstanceOf(MockConnector);
  });

  it('get("inexistente"): retorna undefined', () => {
    const connector = connectorRegistry.get('inexistente');
    expect(connector).toBeUndefined();
  });
});

describe('MockConnector.getAvailability', () => {
  it('retorna array de TimeSlots con estructura correcta', async () => {
    const connector = new MockConnector();
    const slots = await connector.getAvailability('proc-1', '2025-06-02', '2025-06-04');

    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);

    const slot = slots[0];
    expect(slot).toHaveProperty('date');
    expect(slot).toHaveProperty('time');
    expect(slot).toHaveProperty('available');
    expect(slot).toHaveProperty('slotId');
    expect(typeof slot.date).toBe('string');
    expect(typeof slot.time).toBe('string');
    expect(typeof slot.available).toBe('boolean');
  });

  it('no incluye fines de semana', async () => {
    const connector = new MockConnector();
    // 2025-06-07 es sábado, 2025-06-08 es domingo
    const slots = await connector.getAvailability('proc-1', '2025-06-07', '2025-06-08');
    expect(slots).toHaveLength(0);
  });
});

describe('MockConnector.book', () => {
  it('retorna BookingResult con success=true y confirmationCode', async () => {
    const connector = new MockConnector();
    const result = await connector.book({
      selectedDate: '2025-06-10',
      selectedTime: '10:00',
      applicantName: 'Juan Pérez',
      procedureName: 'Trámite Test',
    });

    expect(result.success).toBe(true);
    expect(result.confirmationCode).toBeDefined();
    expect(typeof result.confirmationCode).toBe('string');
    expect(result.confirmationCode).toMatch(/^MOCK-/);
  });
});
