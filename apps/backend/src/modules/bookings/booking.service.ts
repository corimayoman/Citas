import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { connectorRegistry } from '../connectors/connector.registry';
import { auditService } from '../audit/audit.service';
import { notificationService } from '../notifications/notification.service';
import { encrypt } from '../../lib/crypto';
import { citaDisponibleHtml, citaConfirmadaHtml } from '../../lib/email-templates';
import { enqueueSearchJob } from './search.queue';

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
      prisma.applicantProfile.findFirst({ where: { id: data.applicantProfileId, userId }, select: { id: true, documentType: true, nationality: true, birthDate: true } }),
      prisma.procedure.findUnique({ where: { id: data.procedureId }, include: { connector: true } }),
    ]);

    if (!profile) throw new AppError(404, 'Perfil de solicitante no encontrado', 'PROFILE_NOT_FOUND');
    if (!procedure) throw new AppError(404, 'Trámite no encontrado', 'PROCEDURE_NOT_FOUND');

    // ── Validar regla de 24 horas ──
    if (data.preferredDateFrom) {
      const preferredDate = new Date(data.preferredDateFrom);
      const minAllowedDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (preferredDate < minAllowedDate) {
        throw new AppError(422, 'La fecha preferida debe ser al menos 24 horas en el futuro', 'DATE_TOO_SOON');
      }
    }

    // ── Validar elegibilidad antes de crear el booking ──
    const formData = data.formData ?? {};
    const rules = (procedure.eligibilityRules ?? {}) as Record<string, unknown>;
    const formSchema = (procedure.formSchema as { fields?: Array<{ name: string; label: string; required?: boolean }> }) ?? {};
    const errors: string[] = [];
    const missingFields: string[] = [];

    // Campos requeridos del formulario
    for (const field of formSchema.fields ?? []) {
      if (field.required && !formData[field.name]) {
        missingFields.push(field.name);
        errors.push(`Campo requerido: ${field.label}`);
      }
    }

    // Edad mínima
    if (rules.minAge && profile.birthDate) {
      const age = Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < (rules.minAge as number)) {
        errors.push(`Edad mínima requerida: ${rules.minAge} años (el solicitante tiene ${age})`);
      }
    }

    // Tipo de documento
    if (Array.isArray(rules.requiredDocuments) && rules.requiredDocuments.length > 0) {
      const docType = profile.documentType?.toUpperCase();
      const allowed = (rules.requiredDocuments as string[]).map(d => d.toUpperCase());
      if (!allowed.includes(docType)) {
        errors.push(`Tipo de documento no válido: ${profile.documentType}. Se requiere: ${(rules.requiredDocuments as string[]).join(', ')}`);
      }
    }

    // Nacionalidad
    if (Array.isArray(rules.allowedNationalities) && rules.allowedNationalities.length > 0) {
      const nat = profile.nationality?.toUpperCase();
      if (!(rules.allowedNationalities as string[]).map(n => n.toUpperCase()).includes(nat)) {
        errors.push(`Nacionalidad no habilitada para este trámite: ${profile.nationality}`);
      }
    }
    if (Array.isArray(rules.excludedNationalities)) {
      const nat = profile.nationality?.toUpperCase();
      if ((rules.excludedNationalities as string[]).map(n => n.toUpperCase()).includes(nat)) {
        errors.push(`Nacionalidad excluida de este trámite: ${profile.nationality}`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(422, `No se puede crear la reserva: ${errors.join('; ')}`, 'ELIGIBILITY_FAILED', { errors, missingFields });
    }

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

    // Verificar que el conector no esté SUSPENDED antes de encolar
    if (procedure.connector) {
      const connector = procedure.connector;
      if (connector.status === 'SUSPENDED') {
        throw new AppError(503, 'El conector está temporalmente suspendido', 'CONNECTOR_SUSPENDED');
      }
    }

    // Encolar búsqueda en BullMQ en vez de ejecutar _runSearchLoop directamente
    const searchJobId = await enqueueSearchJob(booking.id);
    await prisma.bookingRequest.update({
      where: { id: booking.id },
      data: { searchJobId },
    });

    return { ...booking, searchJobId };
  },

  async validateBooking(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId },
      include: {
        procedure: { include: { requirements: true, connector: true } },
        applicantProfile: true,
      },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada', 'BOOKING_NOT_FOUND');

    const errors: string[] = [];
    const warnings: string[] = [];
    const missingFields: string[] = [];
    const profile = booking.applicantProfile;
    const procedure = booking.procedure;
    const formData = (booking.formData ?? {}) as Record<string, unknown>;
    const rules = (procedure.eligibilityRules ?? {}) as Record<string, unknown>;

    // 1. Validate required form fields against formSchema
    const formSchema = (procedure.formSchema as { fields?: Array<{ name: string; label: string; required?: boolean }> }) ?? {};
    for (const field of formSchema.fields ?? []) {
      if (field.required && !formData[field.name]) {
        missingFields.push(field.name);
        errors.push(`Campo requerido: ${field.label}`);
      }
    }

    // 2. Validate eligibilityRules against applicant profile
    if (rules.minAge && profile.birthDate) {
      const age = Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < (rules.minAge as number)) {
        errors.push(`Edad mínima requerida: ${rules.minAge} años (el solicitante tiene ${age})`);
      }
    }

    if (rules.maxAge && profile.birthDate) {
      const age = Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age > (rules.maxAge as number)) {
        errors.push(`Edad máxima permitida: ${rules.maxAge} años (el solicitante tiene ${age})`);
      }
    }

    if (Array.isArray(rules.requiredDocuments) && rules.requiredDocuments.length > 0) {
      const docType = profile.documentType?.toUpperCase();
      const allowed = (rules.requiredDocuments as string[]).map(d => d.toUpperCase());
      if (!allowed.includes(docType)) {
        errors.push(`Tipo de documento no válido: ${profile.documentType}. Se requiere: ${(rules.requiredDocuments as string[]).join(', ')}`);
      }
    }

    if (Array.isArray(rules.allowedNationalities) && rules.allowedNationalities.length > 0) {
      const nat = profile.nationality?.toUpperCase();
      const allowed = (rules.allowedNationalities as string[]).map(n => n.toUpperCase());
      if (!allowed.includes(nat)) {
        errors.push(`Nacionalidad no habilitada para este trámite: ${profile.nationality}`);
      }
    }

    if (Array.isArray(rules.excludedNationalities)) {
      const nat = profile.nationality?.toUpperCase();
      const excluded = (rules.excludedNationalities as string[]).map(n => n.toUpperCase());
      if (excluded.includes(nat)) {
        errors.push(`Nacionalidad excluida de este trámite: ${profile.nationality}`);
      }
    }

    // 3. Validate ProcedureRequirements
    for (const req of procedure.requirements) {
      if (!req.isRequired) {
        warnings.push(`Documento opcional: ${req.name}${req.description ? ` — ${req.description}` : ''}`);
        continue;
      }
      // For 'field' type requirements, check formData
      if (req.type === 'field') {
        const fieldName = req.name.toLowerCase().replace(/\s+/g, '_');
        if (!formData[fieldName] && !formData[req.name]) {
          errors.push(`Requisito obligatorio no completado: ${req.name}`);
        }
      }
      // For 'document' type, we note it as required (actual file upload validation is separate)
      if (req.type === 'document') {
        warnings.push(`Documento requerido para la cita: ${req.name}${req.description ? ` — ${req.description}` : ''}`);
      }
    }

    const isEligible = errors.length === 0;
    const validationResult = { isValid: isEligible && missingFields.length === 0, missingFields, errors, warnings };
    const eligibilityResult = { checked: true, eligible: isEligible, errors, warnings };

    return prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { validationResult, eligibilityResult },
    });
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

    // Audit: SEARCHING → PRE_CONFIRMED
    await auditService.log({
      userId: booking.userId,
      action: 'UPDATE',
      entityType: 'BookingRequest',
      entityId: booking.id,
      before: { status: 'SEARCHING' },
      after: { status: 'PRE_CONFIRMED', selectedDate: appointmentDate.toISOString(), selectedTime: slot.appointmentTime, externalRef: slot.confirmationCode },
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
      html: citaDisponibleHtml({
        procedureName: booking.procedure.name,
        paymentDeadline: paymentDeadline.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        bookingId: booking.id,
      }),
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

    // Audit: PRE_CONFIRMED → CONFIRMED
    await auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'BookingRequest',
      entityId: bookingId,
      before: { status: 'PRE_CONFIRMED' },
      after: { status: 'CONFIRMED' },
    });

    const appt = booking.appointment;
    if (appt) {
      await notificationService.send({
        userId,
        title: 'Cita confirmada',
        subject: `Tu cita para ${booking.procedure.name} está confirmada`,
        body: `Tu cita fue confirmada.\n\nFecha: ${new Date(appt.appointmentDate).toLocaleDateString('es-ES')}\nHora: ${appt.appointmentTime}\nLugar: ${appt.location || 'Por confirmar'}\nCódigo: ${appt.confirmationCode}\n\n${appt.instructions || ''}`,
        metadata: { bookingId, appointmentDate: appt.appointmentDate, confirmationCode: appt.confirmationCode },
        html: citaConfirmadaHtml({
          procedureName: booking.procedure.name,
          appointmentDate: new Date(appt.appointmentDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          appointmentTime: appt.appointmentTime,
          location: appt.location || 'Por confirmar',
          confirmationCode: appt.confirmationCode || '',
          instructions: appt.instructions || 'Traé tu documentación original.',
          bookingId,
        }),
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

  async cancelBooking(bookingId: string, userId: string) {
    const booking = await prisma.bookingRequest.findFirst({
      where: { id: bookingId, userId, status: { in: ['SEARCHING', 'PRE_CONFIRMED', 'DRAFT'] } },
    });
    if (!booking) throw new AppError(404, 'Reserva no encontrada o no se puede cancelar', 'BOOKING_NOT_FOUND');

    await prisma.bookingRequest.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    await auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'BookingRequest',
      entityId: bookingId,
      before: { status: booking.status },
      after: { status: 'CANCELLED' },
    });

    return { cancelled: true };
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

    // Audit: personal data access (READ)
    await auditService.log({
      userId,
      action: 'READ',
      entityType: 'BookingRequest',
      entityId: bookingId,
      metadata: { accessedFields: ['formData', 'applicantProfile'] },
    });

    // Ocultar detalles sensibles de la cita hasta que se confirme el pago
    if (booking.status === 'PRE_CONFIRMED' && booking.appointment) {
      return {
        ...booking,
        appointment: {
          ...booking.appointment,
          confirmationCode: null,
          location: null,
        },
      };
    }

    return booking;
  },
};
