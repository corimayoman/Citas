import { bookingService } from '../booking.service';
import { prisma } from '../../../lib/prisma';
import { connectorRegistry } from '../../connectors/connector.registry';
import { notificationService } from '../../notifications/notification.service';
import { auditService } from '../../audit/audit.service';
import * as cryptoLib from '../../../lib/crypto';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    applicantProfile: { findFirst: jest.fn() },
    procedure: { findUnique: jest.fn() },
    bookingRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    // Execute callback immediately using the same mock client
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const { prisma: mockClient } = jest.requireMock('../../../lib/prisma');
      return fn(mockClient);
    }),
  },
}));

jest.mock('../../connectors/connector.registry', () => ({
  connectorRegistry: { get: jest.fn() },
}));

jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('../../../lib/crypto', () => ({
  encrypt: jest.fn().mockReturnValue('encrypted-data'),
}));

jest.mock('../search.queue', () => ({
  enqueueSearchJob: jest.fn().mockResolvedValue('job-123'),
}));

import { enqueueSearchJob } from '../search.queue';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('bookingService.createDraft', () => {
  const userId = 'user-1';
  const data = {
    applicantProfileId: 'profile-1',
    procedureId: 'proc-1',
    formData: { field: 'value' },
  };

  it('happy path: crea booking con status SEARCHING', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1', documentType: 'DNI', nationality: 'ES', birthDate: new Date('1990-01-01') });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: 'proc-1', connector: null, formSchema: { fields: [] }, eligibilityRules: null });
    (mockPrisma.bookingRequest.create as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      status: 'SEARCHING',
    });
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      status: 'SEARCHING',
      searchJobId: 'job-123',
    });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    const result = await bookingService.createDraft(userId, data);

    expect(result.status).toBe('SEARCHING');
    expect(result.searchJobId).toBe('job-123');
    expect(mockPrisma.bookingRequest.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SEARCHING' }),
      })
    );
    expect(enqueueSearchJob).toHaveBeenCalledWith('booking-1');
    expect(mockPrisma.bookingRequest.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'booking-1' },
        data: { searchJobId: 'job-123' },
      })
    );
  });

  it('perfil inexistente lanza AppError 404', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: 'proc-1', formSchema: { fields: [] }, eligibilityRules: null });

    await expect(bookingService.createDraft(userId, data))
      .rejects.toMatchObject({ statusCode: 404, code: 'PROFILE_NOT_FOUND' });
  });

  it('trámite inexistente lanza AppError 404', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1', documentType: 'DNI', nationality: 'ES', birthDate: new Date('1990-01-01') });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.createDraft(userId, data))
      .rejects.toMatchObject({ statusCode: 404, code: 'PROCEDURE_NOT_FOUND' });
  });

  it('rechaza booking si faltan campos requeridos del formulario', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1', documentType: 'DNI', nationality: 'ES', birthDate: new Date('1990-01-01') });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({
      id: 'proc-1', connector: null,
      formSchema: { fields: [{ name: 'naf', label: 'NAF', required: true }] },
      eligibilityRules: null,
    });

    await expect(bookingService.createDraft(userId, { ...data, formData: {} }))
      .rejects.toMatchObject({ statusCode: 422, code: 'ELIGIBILITY_FAILED' });
  });

  it('rechaza booking si solicitante es menor de edad', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({
      id: 'profile-1', documentType: 'DNI', nationality: 'ES',
      birthDate: new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000),
    });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({
      id: 'proc-1', connector: null,
      formSchema: { fields: [] },
      eligibilityRules: { minAge: 18 },
    });

    await expect(bookingService.createDraft(userId, data))
      .rejects.toMatchObject({ statusCode: 422, code: 'ELIGIBILITY_FAILED' });
  });

  it('rechaza booking si preferredDateFrom está a menos de 24h', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1', documentType: 'DNI', nationality: 'ES', birthDate: new Date('1990-01-01') });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: 'proc-1', connector: null, formSchema: { fields: [] }, eligibilityRules: null });

    const tooSoonDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h from now

    await expect(bookingService.createDraft(userId, { ...data, preferredDateFrom: tooSoonDate }))
      .rejects.toMatchObject({ statusCode: 422, code: 'DATE_TOO_SOON' });

    expect(mockPrisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('acepta booking si preferredDateFrom está a más de 24h', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1', documentType: 'DNI', nationality: 'ES', birthDate: new Date('1990-01-01') });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: 'proc-1', connector: null, formSchema: { fields: [] }, eligibilityRules: null });
    (mockPrisma.bookingRequest.create as jest.Mock).mockResolvedValue({ id: 'booking-1', status: 'SEARCHING' });
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({ id: 'booking-1', status: 'SEARCHING', searchJobId: 'job-123' });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    const validDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h from now

    const result = await bookingService.createDraft(userId, { ...data, preferredDateFrom: validDate });
    expect(result.status).toBe('SEARCHING');
  });

  it('rechaza booking si el conector está SUSPENDED', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1', documentType: 'DNI', nationality: 'ES', birthDate: new Date('1990-01-01') });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({
      id: 'proc-1',
      connector: { id: 'conn-1', status: 'SUSPENDED', slug: 'extranjeria' },
      formSchema: { fields: [] },
      eligibilityRules: null,
    });
    (mockPrisma.bookingRequest.create as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      status: 'SEARCHING',
    });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    await expect(bookingService.createDraft(userId, data))
      .rejects.toMatchObject({ statusCode: 503, code: 'CONNECTOR_SUSPENDED' });
    expect(enqueueSearchJob).not.toHaveBeenCalled();
  });
});

describe('bookingService.confirmAfterPayment', () => {
  const userId = 'user-1';
  const bookingId = 'booking-1';

  it('booking PRE_CONFIRMED → actualiza a CONFIRMED con completedAt', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      id: bookingId,
      userId,
      status: 'PRE_CONFIRMED',
      procedure: { name: 'Trámite X' },
      appointment: {
        appointmentDate: new Date('2025-06-01'),
        appointmentTime: '10:00',
        location: 'Oficina Central',
        confirmationCode: 'CONF-123',
        instructions: 'Traé tu DNI.',
      },
    });
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);

    const before = Date.now();
    await bookingService.confirmAfterPayment(bookingId, userId);
    const after = Date.now();

    const updateCall = (mockPrisma.bookingRequest.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: bookingId });
    expect(updateCall.data.status).toBe('CONFIRMED');
    expect(updateCall.data.completedAt).toBeInstanceOf(Date);
    expect(updateCall.data.completedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updateCall.data.completedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('notificación tras pago incluye fecha, hora, ubicación y código de confirmación', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      id: bookingId,
      userId,
      status: 'PRE_CONFIRMED',
      procedure: { name: 'Trámite X' },
      appointment: {
        appointmentDate: new Date('2025-06-01'),
        appointmentTime: '10:00',
        location: 'Oficina Central',
        confirmationCode: 'CONF-123',
        instructions: 'Traé tu DNI.',
      },
    });
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);

    await bookingService.confirmAfterPayment(bookingId, userId);

    expect(notificationService.send).toHaveBeenCalledTimes(1);
    const sendCall = (notificationService.send as jest.Mock).mock.calls[0][0];
    // Body must include fecha, hora, ubicación, código
    expect(sendCall.body).toContain('10:00');
    expect(sendCall.body).toContain('Oficina Central');
    expect(sendCall.body).toContain('CONF-123');
    // Body should contain a date representation of 2025-06-01
    expect(sendCall.body).toMatch(/2025|junio|jun/i);
    expect(sendCall.userId).toBe(userId);
    // HTML should also include the details
    expect(sendCall.html).toBeDefined();
    expect(sendCall.html).toContain('CONF-123');
    expect(sendCall.html).toContain('Oficina Central');
    expect(sendCall.html).toContain('10:00');
  });

  it('sin appointment no envía notificación', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      id: bookingId,
      userId,
      status: 'PRE_CONFIRMED',
      procedure: { name: 'Trámite X' },
      appointment: null,
    });
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});

    await bookingService.confirmAfterPayment(bookingId, userId);

    expect(mockPrisma.bookingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bookingId },
        data: expect.objectContaining({ status: 'CONFIRMED', completedAt: expect.any(Date) }),
      })
    );
    expect(notificationService.send).not.toHaveBeenCalled();
  });

  it('booking no encontrado lanza AppError 404', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.confirmAfterPayment(bookingId, userId))
      .rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  });

  it('booking en status SEARCHING lanza AppError (no está en PRE_CONFIRMED)', async () => {
    // confirmAfterPayment busca con status: 'PRE_CONFIRMED' en la query → retorna null si no coincide
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.confirmAfterPayment(bookingId, userId))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('bookingService._confirmSlot', () => {
  const booking = {
    id: 'booking-1',
    userId: 'user-1',
    procedure: { name: 'Trámite Y' },
    preferredDateFrom: null,
    preferredDateTo: null,
    preferredTimeSlot: null,
  };

  const slot = {
    appointmentDate: '2025-07-01',
    appointmentTime: '09:00',
    location: 'Sede Norte',
    confirmationCode: 'SLOT-001',
  };

  it('crea appointment si no existe', async () => {
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.appointment.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.appointment.create as jest.Mock).mockResolvedValue({ id: 'appt-1' });
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);

    await bookingService._confirmSlot(booking, slot);

    expect(mockPrisma.appointment.create as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('no duplica appointment si ya existe', async () => {
    (mockPrisma.bookingRequest.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.appointment.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-appt' });
    (notificationService.send as jest.Mock).mockResolvedValue(undefined);

    await bookingService._confirmSlot(booking, slot);

    expect(mockPrisma.appointment.create as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('bookingService.validateBooking', () => {
  const userId = 'user-1';
  const bookingId = 'booking-1';

  const makeBooking = (overrides: Record<string, unknown> = {}) => ({
    id: bookingId,
    userId,
    formData: { firstName: 'Juan', lastName: 'Pérez', documentNumber: '12345678A', phone: '600123456' },
    applicantProfile: {
      id: 'profile-1',
      firstName: 'Juan',
      lastName: 'Pérez',
      documentType: 'DNI',
      documentNumber: '12345678A',
      nationality: 'ES',
      birthDate: new Date('1990-01-15'),
    },
    procedure: {
      id: 'proc-1',
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'phone', label: 'Teléfono', type: 'tel', required: true },
        ],
      },
      eligibilityRules: { minAge: 18, requiredDocuments: ['DNI', 'NIE', 'Pasaporte'] },
      requirements: [],
      connector: null,
    },
    ...overrides,
  });

  it('booking no encontrado lanza AppError 404', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.validateBooking(bookingId, userId))
      .rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  });

  it('solicitante elegible: todos los campos completos, edad y documento válidos', async () => {
    const booking = makeBooking();
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.validationResult).toMatchObject({ isValid: true, errors: [], missingFields: [] });
    expect(result.eligibilityResult).toMatchObject({ checked: true, eligible: true, errors: [] });
  });

  it('rechaza solicitante menor de edad', async () => {
    const booking = makeBooking({
      applicantProfile: {
        ...makeBooking().applicantProfile,
        birthDate: new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000), // 15 años
      },
    });
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.eligibilityResult).toMatchObject({ eligible: false });
    expect(result.validationResult.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Edad mínima requerida: 18')])
    );
  });

  it('rechaza tipo de documento no permitido', async () => {
    const booking = makeBooking({
      applicantProfile: {
        ...makeBooking().applicantProfile,
        documentType: 'Cédula',
      },
    });
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.eligibilityResult).toMatchObject({ eligible: false });
    expect(result.validationResult.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Tipo de documento no válido: Cédula')])
    );
  });

  it('detecta campos requeridos faltantes en el formulario', async () => {
    const booking = makeBooking({
      formData: { firstName: 'Juan' }, // faltan lastName, documentNumber, phone
    });
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.validationResult.isValid).toBe(false);
    expect(result.validationResult.missingFields).toEqual(
      expect.arrayContaining(['lastName', 'documentNumber', 'phone'])
    );
  });

  it('rechaza nacionalidad excluida', async () => {
    const booking = makeBooking({
      procedure: {
        ...makeBooking().procedure,
        eligibilityRules: { excludedNationalities: ['XX'] },
      },
      applicantProfile: {
        ...makeBooking().applicantProfile,
        nationality: 'XX',
      },
    });
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.eligibilityResult).toMatchObject({ eligible: false });
    expect(result.validationResult.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Nacionalidad excluida')])
    );
  });

  it('genera warnings para requisitos de tipo document', async () => {
    const booking = makeBooking({
      procedure: {
        ...makeBooking().procedure,
        requirements: [
          { id: 'req-1', name: 'DNI original', description: 'En vigor', type: 'document', isRequired: true, order: 1 },
          { id: 'req-2', name: 'Foto carnet', description: null, type: 'document', isRequired: false, order: 2 },
        ],
      },
    });
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.validationResult.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DNI original'),
        expect.stringContaining('Foto carnet'),
      ])
    );
  });

  it('acumula múltiples errores cuando hay varios problemas', async () => {
    const booking = makeBooking({
      formData: {}, // todos los campos faltantes
      applicantProfile: {
        ...makeBooking().applicantProfile,
        documentType: 'Cédula',
        birthDate: new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000), // 10 años
      },
    });
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);
    (mockPrisma.bookingRequest.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...booking, ...data }));

    const result = await bookingService.validateBooking(bookingId, userId) as any;

    expect(result.validationResult.isValid).toBe(false);
    expect(result.eligibilityResult.eligible).toBe(false);
    // Al menos: 4 campos faltantes + edad + documento
    expect(result.validationResult.errors.length).toBeGreaterThanOrEqual(6);
  });
});

describe('bookingService.getBookingById', () => {
  const userId = 'user-1';
  const bookingId = 'booking-1';

  const baseAppointment = {
    id: 'appt-1',
    bookingRequestId: bookingId,
    confirmationCode: 'CONF-SECRET',
    appointmentDate: new Date('2025-07-01'),
    appointmentTime: '10:00',
    location: 'Oficina Central, Madrid',
    instructions: 'Traé tu documentación original.',
  };

  const makeFullBooking = (status: string) => ({
    id: bookingId,
    userId,
    status,
    procedure: { id: 'proc-1', name: 'Trámite X', organization: {}, requirements: [] },
    applicantProfile: { id: 'profile-1', firstName: 'Juan', lastName: 'Pérez' },
    appointment: { ...baseAppointment },
    payment: null,
    bookingAttempts: [],
    documentFiles: [],
  });

  it('booking no encontrado lanza AppError 404', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.getBookingById(bookingId, userId))
      .rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  });

  it('PRE_CONFIRMED: oculta confirmationCode y location del appointment', async () => {
    const booking = makeFullBooking('PRE_CONFIRMED');
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);

    const result = await bookingService.getBookingById(bookingId, userId) as any;

    expect(result.status).toBe('PRE_CONFIRMED');
    expect(result.appointment).toBeDefined();
    expect(result.appointment.confirmationCode).toBeNull();
    expect(result.appointment.location).toBeNull();
    // Los demás campos del appointment deben seguir presentes
    expect(result.appointment.appointmentDate).toEqual(new Date('2025-07-01'));
    expect(result.appointment.appointmentTime).toBe('10:00');
    expect(result.appointment.instructions).toBe('Traé tu documentación original.');
  });

  it('CONFIRMED: incluye todos los detalles del appointment', async () => {
    const booking = makeFullBooking('CONFIRMED');
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);

    const result = await bookingService.getBookingById(bookingId, userId) as any;

    expect(result.status).toBe('CONFIRMED');
    expect(result.appointment.confirmationCode).toBe('CONF-SECRET');
    expect(result.appointment.location).toBe('Oficina Central, Madrid');
  });

  it('SEARCHING: incluye todos los detalles del appointment si existe', async () => {
    const booking = makeFullBooking('SEARCHING');
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);

    const result = await bookingService.getBookingById(bookingId, userId) as any;

    expect(result.appointment.confirmationCode).toBe('CONF-SECRET');
    expect(result.appointment.location).toBe('Oficina Central, Madrid');
  });

  it('PRE_CONFIRMED sin appointment: retorna booking sin error', async () => {
    const booking = { ...makeFullBooking('PRE_CONFIRMED'), appointment: null };
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(booking);

    const result = await bookingService.getBookingById(bookingId, userId) as any;

    expect(result.status).toBe('PRE_CONFIRMED');
    expect(result.appointment).toBeNull();
  });
});
