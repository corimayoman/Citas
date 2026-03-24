import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import { sendSms } from '../../lib/sms';

export const notificationService = {
  async send(params: {
    userId: string;
    title: string;
    subject?: string;
    body: string;
    channel?: NotificationChannel;
    metadata?: Record<string, unknown>;
  }) {
    const isDemoMode = process.env.NOTIFICATIONS_DEMO_MODE === 'true'
      || (process.env.STRIPE_DEMO_MODE === 'true' && !process.env.SMTP_HOST);

    // Si no se fuerza un canal, usar la preferencia del usuario
    const channel = params.channel ?? await notificationService._getPreferredChannel(params.userId);

    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        channel,
        title: params.title,
        subject: params.subject,
        body: params.body,
        metadata: params.metadata as object,
        status: NotificationStatus.PENDING,
      },
    });

    if (isDemoMode) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      logger.info(`[DEMO] Notification sent to user ${params.userId} via ${channel}: ${params.title}`);
      return { ...notification, status: NotificationStatus.SENT };
    }

    try {
      if (channel === NotificationChannel.EMAIL) {
        await notificationService._sendEmail(params.userId, {
          subject: params.subject ?? params.title,
          body: params.body,
        });
      } else if (channel === NotificationChannel.SMS) {
        await notificationService._sendSms(params.userId, params.body);
      } else {
        logger.warn(`Channel ${channel} not implemented — notification ${notification.id} queued`);
        return notification;
      }

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      return { ...notification, status: NotificationStatus.SENT };
    } catch (err) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED },
      });
      logger.error(`Failed to send notification ${notification.id}: ${err}`);
      return { ...notification, status: NotificationStatus.FAILED };
    }
  },

  /** Devuelve el canal preferido del usuario (EMAIL por defecto) */
  async _getPreferredChannel(userId: string): Promise<NotificationChannel> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationChannel: true },
    });
    return user?.notificationChannel ?? NotificationChannel.EMAIL;
  },

  /** Envía email via SMTP */
  async _sendEmail(userId: string, params: { subject: string; body: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new Error(`User ${userId} not found`);
    await sendMail({
      to: user.email,
      subject: params.subject,
      text: params.body,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${params.body}</pre>`,
    });
  },

  /** Envía SMS via Twilio usando el teléfono de preferencia del usuario */
  async _sendSms(userId: string, body: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPhone: true },
    });
    if (!user?.notificationPhone) {
      throw new Error(`User ${userId} has no notificationPhone configured`);
    }
    await sendSms({ to: user.notificationPhone, body });
  },

  async markRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  },

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};
