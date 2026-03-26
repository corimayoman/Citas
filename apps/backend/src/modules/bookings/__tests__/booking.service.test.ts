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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
  // Evitar que _runSearchLoop corra en background durante tests
  jest.spyOn(bookingService, '_runSearchLoop').mockResolvedValue(undefined);
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
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1' });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: 'proc-1', connector: null });
    (mockPrisma.bookingRequest.create as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      status: 'SEARCHING',
    });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    const result = await bookingService.createDraft(userId, data);

    expect(result.status).toBe('SEARCHING');
    expect(mockPrisma.bookingRequest.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SEARCHING' }),
      })
    );
  });

  it('perfil inexistente lanza AppError 404', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue({ id: 'proc-1' });

    await expect(bookingService.createDraft(userId, data))
      .rejects.toMatchObject({ statusCode: 404, code: 'PROFILE_NOT_FOUND' });
  });

  it('trámite inexistente lanza AppError 404', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1' });
    (mockPrisma.procedure.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.createDraft(userId, data))
      .rejects.toMatchObject({ statusCode: 404, code: 'PROCEDURE_NOT_FOUND' });
  });
});

describe('bookingService.confirmAfterPayment', () => {
  const userId = 'user-1';
  const bookingId = 'booking-1';

  it('booking PRE_CONFIRMED → actualiza a CONFIRMED', async () => {
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

    expect(mockPrisma.bookingRequest.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bookingId },
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      })
    );
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
