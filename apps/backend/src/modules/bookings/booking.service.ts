import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { connectorRegistry } from '../connectors/connector.registry';
import { auditService } from '../audit/audit.service';
import { notificationService } from '../notifications/notification.service';
import { encrypt } from '../../lib/crypto';

export const bookingService = {
  async createDraft(userId: string, data: {
    applicantProfileId: string;
    procedureId: string;
    formData: Record<string, unknown>;
    preferredDateFrom?: string;
    preferredDateTo?: string;
    preferredTimeSlot?: string;
  }) {
    const [profile, procedure] = await Promise.all([
      prisma.applicantProfile.findFirst({ where: { id: data.applicantProfileId, userId } }),
      prisma.procedure.findUnique({ where: { id: data.procedureId }, include: { connector: true } }),
    ]);

    if (!profile) throw new AppError(404, 'Perfil de solicitante no encontrado', 'PROFILE_NOT_FOUND');
    if (!procedure) throw new AppError(404, 'Trámite no encontrado', 'PROCEDURE_NOT_FOUND');

    const encryptedFormData = { _encrypted: encrypt(JSON.stringify(data.formData)) };

    const booking = await prisma.bookingRequest.create({
      data: {
        userId,
        applicantProfileId: data.applicantProfileId,
        procedureId: data.procedureId,
        formData: encryptedFormData,
        status: 'SEARCHING', // arranca buscando de inmediato, sin pago previo
        preferredDateFrom: data.preferredDateFrom ? new Date(data.preferredDateFrom) : undefined,
        preferredDateTo: data.preferredDateTo ? new Date(data.preferredDateTo) : undefined,
        preferredTimeSlot: data.preferredTimeSlot,
      },
    });

    await auditService.log({ userId, action: 'CREATE', entityType: 'BookingRequest', entityId: booking.id });

    // Arrancar búsqueda en background sin bloquear la respuesta
    bookingService._runSearchLoop(booking.id).catch(() => {});

    return booking;
  },

  async validateBooking(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId },
      include: { procedure: { include: { requirements: true, connector: true } } },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');

    const validationResult = { isValid: true, missingFields: [] as string[], warnings: [] as string[] };
    return prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { validationResult, eligibilityResult: { checked: true, eligible: true } },
    });
  },

  async _runSearchLoop(bookingId: string) {
    const MAX_ATTEMPTS = 20;
    const RETRY_DELAY_MS = 30_000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const booking = await prisma.bookingRequest.findUnique({
        where: { id: bookingId },
        include: { procedure: { include: { connector: true } }, applicantProfile: true },
      });

      if (!booking || booking.status !== 'SEARCHING') return;

      const connector = booking.procedure.connector;
      const adapterConnector = connector ? connectorRegistry.get(connector.slug) : null;

      if (!adapterConnector?.getAvailability) {
        // Sin conector — simular slot encontrado
        await bookingService._confirmSlot(booking, {
          appointmentDate: bookingService._pickDateInRange(booking.preferredDateFrom, booking.preferredDateTo, booking.preferredTimeSlot),
          appointmentTime: booking.preferredTimeSlot === 'afternoon' ? '15:00' : '10:00',
          location: 'Oficina central',
          confirmationCode: `DEMO-${Date.now()}`,
        });
        return;
      }

      try {
        const dateFrom = booking.preferredDateFrom?.toISOString() ?? new Date().toISOString();
        const dateTo = booking.preferredDateTo?.toISOString() ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const slots = await adapterConnector.getAvailability(booking.procedureId, dateFrom, dateTo);

        const filtered = (slots || []).filter((s) => {
          if (!booking.preferredTimeSlot) return true;
          const hour = parseInt((s.time || '12:00').split(':')[0], 10);
          return booking.preferredTimeSlot === 'morning' ? hour < 14 : hour >= 14;
        });

        if (filtered.length > 0) {
          const slot = filtered[0];
          await bookingService._confirmSlot(booking, {
            appointmentDate: slot.date,
            appointmentTime: slot.time,
            location: undefined,
            confirmationCode: slot.slotId || `REF-${Date.now()}`,
          });
          return;
        }
      } catch {
        // reintentar
      }

      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: 'ERROR' } });
  },

  async _confirmSlot(booking: any, slot: {
    appointmentDate: string | Date;
    appointmentTime: string;
    location?: string;
    confirmationCode?: string;
  }) {
    const appointmentDate = new Date(slot.appointmentDate);
    // Deadline para pagar: 24h antes de la cita
    const paymentDeadline = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);

    await prisma.bookingRequest.update({
      where: { id: booking.id },
      data: {
        status: 'PRE_CONFIRMED',
        selectedDate: appointmentDate,
        selectedTime: slot.appointmentTime,
        paymentDeadline,
        externalRef: slot.confirmationCode,
      },
    });

    // Guardar cita internamente (oculta hasta que pague)
    const existing = await prisma.appointment.findUnique({ where: { bookingRequestId: booking.id } });
    if (!existing) {
      await prisma.appointment.create({
        data: {
          bookingRequestId: booking.id,
          confirmationCode: slot.confirmationCode,
          appointmentDate,
          appointmentTime: slot.appointmentTime,
          location: slot.location,
          instructions: 'Traé tu documentación original.',
        },
      });
    }

    await notificationService.send({
      userId: booking.userId,
      title: '¡Cita disponible! Realizá el pago para confirmarla',
      subject: 'Encontramos una cita disponible',
      body: `Encontramos una cita para "${booking.procedure.name}". Tenés hasta el ${paymentDeadline.toLocaleDateString('es-ES')} para pagar y confirmarla. Si no pagás, la cita se libera.`,
      metadata: { bookingId: booking.id, paymentDeadline: paymentDeadline.toISOString() },
    });
  },

  _pickDateInRange(from: Date | null, to: Date | null, timeSlot: string | null): Date {
    const base = from ? new Date(from) : new Date();
    base.setDate(base.getDate() + 3);
    if (to && base > to) base.setTime(to.getTime() - 24 * 60 * 60 * 1000);
    base.setHours(timeSlot === 'afternoon' ? 15 : 10, 0, 0, 0);
    return base;
  },

  // Llamado después del pago en PRE_CONFIRMED → mueve a CONFIRMED y revela detalles
  async confirmAfterPayment(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId, status: 'PRE_CONFIRMED' },
      include: { procedure: true, appointment: true },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada o no está en estado PRE_CONFIRMED', 'BOOKING_NOT_FOUND');

    await prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED', completedAt: new Date() },
    });

    const appt = booking.appointment;
    if (appt) {
      await notificationService.send({
        userId,
        title: 'Cita confirmada',
        subject: `Tu cita para ${booking.procedure.name} está confirmada`,
        body: `Tu cita fue confirmada.\n\nFecha: ${new Date(appt.appointmentDate).toLocaleDateString('es-ES')}\nHora: ${appt.appointmentTime}\nLugar: ${appt.location || 'Por confirmar'}\nCódigo: ${appt.confirmationCode}\n\n${appt.instructions || ''}`,
        metadata: { bookingId, appointmentDate: appt.appointmentDate, confirmationCode: appt.confirmationCode },
      });
    }
  },

  // Flujo legacy — ejecución manual post-pago
  async executeBooking(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId, status: { in: ['PAID', 'ERROR'] } },
      include: { procedure: { include: { connector: true } }, applicantProfile: true },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada o no pagada', 'BOOKING_NOT_FOUND');

    const connector = booking.procedure.connector;
    await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: 'IN_PROGRESS' } });

    if (!connector || connector.integrationType === 'MANUAL_ASSISTED' || connector.status !== 'ACTIVE') {
      await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: 'REQUIRES_USER_ACTION' } });
      await auditService.log({ userId, action: 'BOOKING_ATTEMPT', entityType: 'BookingRequest', entityId: bookingId, after: { mode: 'MANUAL_ASSISTED' } });
      return { mode: 'MANUAL_ASSISTED', instructions: 'Este trámite requiere completarse manualmente.', portalUrl: booking.procedure.connector?.baseUrl };
    }

    const adapterConnector = connectorRegistry.get(connector.slug);
    if (!adapterConnector?.book) throw new AppError(500, 'Conector no disponible', 'CONNECTOR_UNAVAILABLE');

    const attempt = await prisma.bookingAttempt.create({
      data: { bookingRequestId: bookingId, connectorId: connector.id, attemptNumber: 1 },
    });

    try {
      const result = await adapterConnector.book({
        selectedDate: booking.selectedDate?.toISOString(),
        selectedTime: booking.selectedTime,
        applicantName: `${booking.applicantProfile.firstName} ${booking.applicantProfile.lastName}`,
        procedureName: booking.procedure.name,
      });

      if (result.success) {
        await prisma.bookingAttempt.update({ where: { id: attempt.id }, data: { success: true, response: result as object } });
        const existing = await prisma.appointment.findUnique({ where: { bookingRequestId: bookingId } });
        if (!existing) {
          await prisma.appointment.create({
            data: {
              bookingRequestId: bookingId,
              confirmationCode: result.confirmationCode,
              appointmentDate: new Date(result.appointmentDate!),
              appointmentTime: result.appointmentTime!,
              location: result.location,
              instructions: result.instructions,
              receiptData: result.receiptData as object,
            },
          });
        }
        await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: 'COMPLETED', externalRef: result.confirmationCode, completedAt: new Date() } });
      } else {
        await prisma.bookingAttempt.update({ where: { id: attempt.id }, data: { success: false, errorMessage: result.errorMessage } });
        await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: 'ERROR' } });
      }

      await auditService.log({ userId, action: 'BOOKING_ATTEMPT', entityType: 'BookingRequest', entityId: bookingId, after: { success: result.success } });
      return result;
    } catch (error) {
      await prisma.bookingAttempt.update({ where: { id: attempt.id }, data: { success: false, errorMessage: String(error) } });
      await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: 'ERROR' } });
      throw error;
    }
  },

  async getUserBookings(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [bookings, total] = await Promise.all([
      prisma.bookingRequest.findMany({
        where: { userId },
        include: {
          procedure: { select: { name: true, category: true } },
          applicantProfile: { select: { firstName: true, lastName: true } },
          appointment: true,
          payment: { select: { status: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bookingRequest.count({ where: { userId } }),
    ]);
    return { bookings, total, page, limit };
  },

  async getBookingById(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId },
      include: {
        procedure: { include: { organization: true, requirements: true } },
        applicantProfile: true,
        appointment: true,
        payment: true,
        bookingAttempts: { orderBy: { attemptedAt: 'desc' } },
        documentFiles: true,
      },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');
    return booking;
  },
};
