import Stripe from 'stripe';
import { PaymentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { auditService } from '../audit/audit.service';
import { bookingService } from '../bookings/booking.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export const paymentService = {
  async createCheckoutSession(userId: string, bookingRequestId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingRequestId, userId },
      include: { procedure: true },
    });

    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');
    if (!booking.procedure.serviceFee) throw new AppError(400, 'Este trámite no tiene coste de servicio', 'NO_FEE');
    if (booking.status !== 'PRE_CONFIRMED') throw new AppError(409, 'La reserva no tiene una cita disponible para confirmar', 'NOT_PRE_CONFIRMED');

    if (booking.paymentDeadline && new Date(booking.paymentDeadline) < new Date()) {
      throw new AppError(422, 'El plazo de pago ha vencido', 'PAYMENT_DEADLINE_EXPIRED');
    }

    const existingPayment = await prisma.payment.findUnique({ where: { bookingRequestId } });
    if (existingPayment?.status === PaymentStatus.PAID) {
      throw new AppError(409, 'Esta reserva ya está pagada', 'ALREADY_PAID');
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: booking.procedure.currency.toLowerCase(),
          product_data: { name: `Gestión: ${booking.procedure.name}` },
          unit_amount: Math.round(Number(booking.procedure.serviceFee) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/bookings/${bookingRequestId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/bookings/${bookingRequestId}/checkout`,
      metadata: { bookingRequestId, userId },
    });

    const payment = await prisma.payment.upsert({
      where: { bookingRequestId },
      create: {
        userId,
        bookingRequestId,
        stripeSessionId: session.id,
        amount: booking.procedure.serviceFee,
        currency: booking.procedure.currency,
        status: PaymentStatus.PENDING,
        description: `Gestión de trámite: ${booking.procedure.name}`,
      },
      update: { stripeSessionId: session.id, status: PaymentStatus.PENDING },
    });

    await auditService.log({ userId, action: 'PAYMENT', entityType: 'Payment', entityId: payment.id, after: { status: 'PENDING' } });
    return { sessionId: session.id, url: session.url };
  },

  async handleWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch {
      throw new AppError(400, 'Webhook signature inválida', 'INVALID_WEBHOOK');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { bookingRequestId, userId } = session.metadata!;

      await prisma.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: PaymentStatus.PAID,
          stripePaymentId: session.payment_intent as string,
          paidAt: new Date(),
        },
      });

      // Generar factura
      const payment = await prisma.payment.findFirst({ where: { stripeSessionId: session.id } });
      if (payment) {
        const invoiceNumber = `INV-${Date.now()}`;
        await prisma.invoice.create({
          data: {
            paymentId: payment.id,
            invoiceNumber,
            data: JSON.parse(JSON.stringify({ session, payment })),
          },
        });
      }

      await auditService.log({ userId, action: 'PAYMENT', entityType: 'Payment', after: { status: 'PAID', sessionId: session.id } });

      // Confirmar cita y revelar detalles al usuario
      await bookingService.confirmAfterPayment(bookingRequestId, userId);
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      await prisma.payment.updateMany({
        where: { stripePaymentId: charge.payment_intent as string },
        data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
      });
    }
  },

  async createDemoCheckout(userId: string, bookingRequestId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingRequestId, userId },
      include: { procedure: true },
    });

    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');

    // Solo se puede pagar cuando hay una cita encontrada (PRE_CONFIRMED)
    if (booking.status !== 'PRE_CONFIRMED') {
      throw new AppError(409, 'La reserva no tiene una cita disponible para confirmar', 'NOT_PRE_CONFIRMED');
    }

    if (booking.paymentDeadline && new Date(booking.paymentDeadline) < new Date()) {
      throw new AppError(422, 'El plazo de pago ha vencido', 'PAYMENT_DEADLINE_EXPIRED');
    }

    const existingPayment = await prisma.payment.findUnique({ where: { bookingRequestId } });
    if (existingPayment?.status === PaymentStatus.PAID) {
      throw new AppError(409, 'Esta reserva ya está pagada', 'ALREADY_PAID');
    }

    const payment = await prisma.payment.upsert({
      where: { bookingRequestId },
      create: {
        userId,
        bookingRequestId,
        stripeSessionId: `demo_${Date.now()}`,
        amount: booking.procedure.serviceFee ?? 0,
        currency: booking.procedure.currency,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        description: `[DEMO] Gestión de trámite: ${booking.procedure.name}`,
      },
      update: { status: PaymentStatus.PAID, paidAt: new Date() },
    });

    await auditService.log({ userId, action: 'PAYMENT', entityType: 'Payment', entityId: payment.id, after: { status: 'DEMO_PAID' } });

    // Confirmar la cita y revelar detalles
    await bookingService.confirmAfterPayment(bookingRequestId, userId);

    return { demo: true, paymentId: payment.id };
  },

  async getUserPayments(userId: string) {
    return prisma.payment.findMany({
      where: { userId },
      include: { invoice: true, bookingRequest: { select: { id: true, procedure: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Fallback confirmation: verify session directly with Stripe when webhook didn't arrive
  async confirmBySession(userId: string, sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new AppError(402, 'El pago no fue completado', 'PAYMENT_NOT_COMPLETED');
    }

    const { bookingRequestId } = session.metadata!;

    // Idempotent: if already confirmed, just return
    const existing = await prisma.payment.findFirst({ where: { stripeSessionId: sessionId } });
    if (existing?.status === PaymentStatus.PAID) {
      return { alreadyConfirmed: true, bookingRequestId };
    }

    await prisma.payment.updateMany({
      where: { stripeSessionId: sessionId },
      data: {
        status: PaymentStatus.PAID,
        stripePaymentId: session.payment_intent as string,
        paidAt: new Date(),
      },
    });

    await auditService.log({ userId, action: 'PAYMENT', entityType: 'Payment', after: { status: 'PAID', sessionId, source: 'confirm-session-fallback' } });

    await bookingService.confirmAfterPayment(bookingRequestId, userId);

    return { confirmed: true, bookingRequestId };
  },
};
