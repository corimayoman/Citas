import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export const notificationService = {
  async send(params: {
    userId: string;
    title: string;
    subject?: string;
    body: string;
    channel?: NotificationChannel;
    metadata?: Record<string, unknown>;
  }) {
    const isDemoMode = process.env.STRIPE_DEMO_MODE === 'true';
    const channel = params.channel ?? NotificationChannel.EMAIL;

    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        channel,
        title: params.title,
        subject: params.subject,
        body: params.body,
        metadata: params.metadata as object,
        status: isDemoMode ? NotificationStatus.SENT : NotificationStatus.PENDING,
        sentAt: isDemoMode ? new Date() : undefined,
      },
    });

    if (isDemoMode) {
      logger.info(`[DEMO] Notification sent to user ${params.userId}: ${params.title}`);
    } else {
      // TODO: integrate real email/SMS provider
      logger.warn(`Notification queued (no provider configured): ${params.title}`);
    }

    return notification;
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
