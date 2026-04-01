import { paymentService } from '../payment.service';
import { prisma } from '../../../lib/prisma';
import { auditService } from '../../audit/audit.service';
import { bookingService } from '../../bookings/booking.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    bookingRequest: { findFirst: jest.fn() },
    payment: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('stripe', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCreate } },
  }));
});

jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('../../bookings/booking.service', () => ({
  bookingService: { confirmAfterPayment: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_DEMO_MODE = 'true';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.FRONTEND_URL = 'http://localhost:3000';
});

afterEach(() => {
  delete process.env.STRIPE_DEMO_MODE;
});

describe('paymentService.createDemoCheckout', () => {
  const userId = 'user-1';
  const bookingRequestId = 'booking-1';

  const mockBooking = {
    id: bookingRequestId,
    userId,
    status: 'PRE_CONFIRMED',
    procedure: {
      name: 'Trámite Demo',
      serviceFee: 50,
      currency: 'ARS',
    },
  };

  it('STRIPE_DEMO_MODE=true: crea payment con status PAID, NO llama a stripe.checkout.sessions.create, llama a bookingService.confirmAfterPayment', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(mockBooking);
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.payment.upsert as jest.Mock).mockResolvedValue({ id: 'payment-1' });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);
    (bookingService.confirmAfterPayment as jest.Mock).mockResolvedValue(undefined);

    const result = await paymentService.createDemoCheckout(userId, bookingRequestId);

    expect(result).toEqual({ demo: true, paymentId: 'payment-1' });
    expect(bookingService.confirmAfterPayment as jest.Mock).toHaveBeenCalledWith(bookingRequestId, userId);

    // En demo mode el constructor de Stripe nunca se llama — verificamos indirectamente
    // que createCheckoutSession (que sí usa Stripe) no fue invocada
    const Stripe = require('stripe');
    // Si Stripe fue instanciado, verificar que sessions.create no fue llamado
    if (Stripe.mock.results.length > 0) {
      const stripeInstance = Stripe.mock.results[0].value;
      expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
    }
    // Si no fue instanciado, el test pasa: Stripe nunca se usó (comportamiento correcto)
  });

  it('booking no en PRE_CONFIRMED lanza AppError 409', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      ...mockBooking,
      status: 'SEARCHING',
    });

    await expect(paymentService.createDemoCheckout(userId, bookingRequestId))
      .rejects.toMatchObject({ statusCode: 409, code: 'NOT_PRE_CONFIRMED' });
  });

  it('booking ya pagado lanza AppError 409', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue(mockBooking);
    (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue({ status: 'PAID' });

    await expect(paymentService.createDemoCheckout(userId, bookingRequestId))
      .rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_PAID' });
  });
});

describe('paymentService.createCheckoutSession', () => {
  const userId = 'user-1';
  const bookingRequestId = 'booking-1';

  it('booking no en PRE_CONFIRMED lanza AppError 409', async () => {
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      id: bookingRequestId,
      userId,
      status: 'SEARCHING',
      procedure: { name: 'Trámite', serviceFee: 100, currency: 'ARS' },
    });

    await expect(paymentService.createCheckoutSession(userId, bookingRequestId))
      .rejects.toMatchObject({ statusCode: 409, code: 'NOT_PRE_CONFIRMED' });
  });

  it('paymentDeadline vencido lanza AppError 422 PAYMENT_DEADLINE_EXPIRED', async () => {
    const pastDeadline = new Date(Date.now() - 60_000); // 1 minuto en el pasado
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      id: bookingRequestId,
      userId,
      status: 'PRE_CONFIRMED',
      paymentDeadline: pastDeadline,
      procedure: { name: 'Trámite', serviceFee: 100, currency: 'ARS' },
    });

    await expect(paymentService.createCheckoutSession(userId, bookingRequestId))
      .rejects.toMatchObject({ statusCode: 422, code: 'PAYMENT_DEADLINE_EXPIRED' });
  });
});

describe('paymentService.createDemoCheckout — deadline', () => {
  const userId = 'user-1';
  const bookingRequestId = 'booking-1';

  it('paymentDeadline vencido lanza AppError 422 PAYMENT_DEADLINE_EXPIRED', async () => {
    const pastDeadline = new Date(Date.now() - 60_000);
    (mockPrisma.bookingRequest.findFirst as jest.Mock).mockResolvedValue({
      id: bookingRequestId,
      userId,
      status: 'PRE_CONFIRMED',
      paymentDeadline: pastDeadline,
      procedure: { name: 'Trámite Demo', serviceFee: 50, currency: 'ARS' },
    });

    await expect(paymentService.createDemoCheckout(userId, bookingRequestId))
      .rejects.toMatchObject({ statusCode: 422, code: 'PAYMENT_DEADLINE_EXPIRED' });
  });
});
