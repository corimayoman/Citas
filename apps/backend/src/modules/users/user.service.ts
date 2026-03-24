import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { auditService } from '../audit/audit.service';
import { NotificationChannel } from '@prisma/client';

export const userService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true, email: true, role: true, isEmailVerified: true,
        mfaEnabled: true, consentGiven: true, consentDate: true,
        createdAt: true,
        notificationChannel: true,
        notificationPhone: true,
        applicantProfiles: { where: { deletedAt: null } },
      },
    });
    if (!user) throw new AppError(404, 'Usuario no encontrado', 'USER_NOT_FOUND');
    return user;
  },

  async updateProfile(userId: string, data: { email?: string; notificationChannel?: NotificationChannel; notificationPhone?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, role: true },
    });
    await auditService.log({ userId, action: 'UPDATE', entityType: 'User', entityId: userId, after: data });
    return user;
  },

  async createApplicantProfile(userId: string, data: {
    firstName: string; lastName: string; documentType: string;
    documentNumber: string; nationality: string; birthDate: Date;
    email?: string; phone?: string; address?: object; isDefault?: boolean;
  }) {
    if (data.isDefault) {
      await prisma.applicantProfile.updateMany({
        where: { userId }, data: { isDefault: false },
      });
    }
    const profile = await prisma.applicantProfile.create({ data: { ...data, userId } });
    await auditService.log({ userId, action: 'CREATE', entityType: 'ApplicantProfile', entityId: profile.id });
    return profile;
  },

  async getApplicantProfiles(userId: string) {
    return prisma.applicantProfile.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  },

  async deleteApplicantProfile(userId: string, profileId: string) {
    const profile = await prisma.applicantProfile.findFirst({ where: { id: profileId, userId } });
    if (!profile) throw new AppError(404, 'Perfil no encontrado', 'PROFILE_NOT_FOUND');
    await prisma.applicantProfile.update({ where: { id: profileId }, data: { deletedAt: new Date() } });
    await auditService.log({ userId, action: 'DELETE', entityType: 'ApplicantProfile', entityId: profileId });
  },

  async requestDataDeletion(userId: string) {
    // GDPR: schedule data deletion
    const retentionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await prisma.user.update({ where: { id: userId }, data: { dataRetentionDate: retentionDate } });
    await auditService.log({ userId, action: 'DATA_DELETE', entityType: 'User', entityId: userId });
    return { scheduledFor: retentionDate };
  },
};
