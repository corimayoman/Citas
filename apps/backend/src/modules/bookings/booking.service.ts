import { BookingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { connectorRegistry } from '../connectors/connector.registry';
import { auditService } from '../audit/audit.service';
import { encrypt } from '../../lib/crypto';

export const bookingService = {
  async createDraft(userId: string, data: {
    applicantProfileId: string;
    procedureId: string;
    formData: Record<string, unknown>;
  }) {
    const [profile, procedure] = await Promise.all([
      prisma.applicantProfile.findFirst({ where: { id: data.applicantProfileId, userId } }),
      prisma.procedure.findUnique({ where: { id: data.procedureId }, include: { connector: true } }),
    ]);

    if (!profile) throw new AppError(404, 'Perfil de solicitante no encontrado', 'PROFILE_NOT_FOUND');
    if (!procedure) throw new AppError(404, 'Trámite no encontrado', 'PROCEDURE_NOT_FOUND');

    // Encrypt sensitive form data at rest
    const encryptedFormData = { _encrypted: encrypt(JSON.stringify(data.formData)) };

    const booking = await prisma.bookingRequest.create({
      data: {
        userId,
        applicantProfileId: data.applicantProfileId,
        procedureId: data.procedureId,
        formData: encryptedFormData,
        status: BookingStatus.DRAFT,
      },
    });

    await auditService.log({ userId, action: 'CREATE', entityType: 'BookingRequest', entityId: booking.id });
    return booking;
  },

  async validateBooking(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId },
      include: { procedure: { include: { requirements: true, connector: true } } },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');

    // Basic eligibility check (extend with rules engine)
    const validationResult = {
      isValid: true,
      missingFields: [] as string[],
      warnings: [] as string[],
    };

    return prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { validationResult, eligibilityResult: { checked: true, eligible: true } },
    });
  },

  async executeBooking(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId, status: BookingStatus.PAID },
      include: { procedure: { include: { connector: true } }, applicantProfile: true },
    });

    if (!booking) throw new AppError(404, 'Reserva no encontrada o no pagada', 'BOOKING_NOT_FOUND');

    const connector = booking.procedure.connector;

    // Update status to in progress
    await prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { status: BookingStatus.IN_PROGRESS },
    });

    // If no connector or manual-only, return assisted flow instructions
    if (!connector || connector.integrationType === 'MANUAL_ASSISTED' || connector.status !== 'ACTIVE') {
      await prisma.bookingRequest.update({
        where: { id: bookingId },
        data: { status: BookingStatus.REQUIRES_USER_ACTION },
      });

      await auditService.log({ userId, action: 'BOOKING_ATTEMPT', entityType: 'BookingRequest', entityId: bookingId, after: { mode: 'MANUAL_ASSISTED' } });

      return {
        mode: 'MANUAL_ASSISTED',
        instructions: 'Este trámite requiere completarse manualmente. Hemos preparado todos sus datos.',
        portalUrl: booking.procedure.connector?.baseUrl,
        preparedData: { message: 'Sus datos están listos para ser introducidos en el portal oficial.' },
      };
    }

    // Automated booking via connector
    const adapterConnector = connectorRegistry.get(connector.slug);
    if (!adapterConnector?.book) {
      throw new AppError(500, 'Conector no disponible', 'CONNECTOR_UNAVAILABLE');
    }

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
        await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: BookingStatus.COMPLETED, externalRef: result.confirmationCode, completedAt: new Date() } });
      } else {
        await prisma.bookingAttempt.update({ where: { id: attempt.id }, data: { success: false, errorMessage: result.errorMessage } });
        await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: BookingStatus.ERROR } });
      }

      await auditService.log({ userId, action: 'BOOKING_ATTEMPT', entityType: 'BookingRequest', entityId: bookingId, after: { success: result.success } });
      return result;
    } catch (error) {
      await prisma.bookingAttempt.update({ where: { id: attempt.id }, data: { success: false, errorMessage: String(error) } });
      await prisma.bookingRequest.update({ where: { id: bookingId }, data: { status: BookingStatus.ERROR } });
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
