import Stripe from 'stripe';
import { PaymentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { auditService } from '../audit/audit.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export const paymentService = {
  async createCheckoutSession(userId: string, bookingRequestId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingRequestId, userId },
      include: { procedure: true },
    });

    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');
    if (!booking.procedure.serviceFee) throw new AppError(400, 'Este trámite no tiene coste de servicio', 'NO_FEE');

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
      const session = event.data.object as Stripe.CheckoutSession;
      const { bookingRequestId, userId } = session.metadata!;

      await prisma.payment.update({
        where: { stripeSessionId: session.id },
        data: {
          status: PaymentStatus.PAID,
          stripePaymentId: session.payment_intent as string,
          paidAt: new Date(),
        },
      });

      await prisma.bookingRequest.update({
        where: { id: bookingRequestId },
        data: { status: 'PAID' },
      });

      // Generate invoice
      const payment = await prisma.payment.findUnique({ where: { stripeSessionId: session.id } });
      if (payment) {
        const invoiceNumber = `INV-${Date.now()}`;
        await prisma.invoice.create({
          data: {
            paymentId: payment.id,
            invoiceNumber,
            data: { session, payment },
          },
        });
      }

      await auditService.log({ userId, action: 'PAYMENT', entityType: 'Payment', after: { status: 'PAID', sessionId: session.id } });
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      await prisma.payment.updateMany({
        where: { stripePaymentId: charge.payment_intent as string },
        data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
      });
    }
  },

  async getUserPayments(userId: string) {
    return prisma.payment.findMany({
      where: { userId },
      include: { invoice: true, bookingRequest: { select: { id: true, procedure: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
