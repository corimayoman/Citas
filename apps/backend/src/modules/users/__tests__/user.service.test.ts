import { userService } from '../user.service';
import { prisma } from '../../../lib/prisma';
import { auditService } from '../../audit/audit.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    applicantProfile: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../audit/audit.service', () => ({
  auditService: { log: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('userService.getProfile', () => {
  it('usuario existente retorna datos', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      isEmailVerified: true,
      mfaEnabled: false,
      consentGiven: true,
      consentDate: new Date(),
      createdAt: new Date(),
      applicantProfiles: [],
    };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const result = await userService.getProfile('user-1');

    expect(result).toEqual(mockUser);
  });

  it('usuario inexistente lanza AppError 404', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.getProfile('no-existe'))
      .rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
  });
});

describe('userService.createApplicantProfile', () => {
  const userId = 'user-1';
  const profileData = {
    firstName: 'Juan',
    lastName: 'Pérez',
    documentType: 'DNI',
    documentNumber: '12345678',
    nationality: 'AR',
    birthDate: new Date('1990-01-01'),
  };

  it('happy path: crea perfil', async () => {
    const mockProfile = { id: 'profile-1', ...profileData, userId };
    (mockPrisma.applicantProfile.create as jest.Mock).mockResolvedValue(mockProfile);
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    const result = await userService.createApplicantProfile(userId, profileData);

    expect(result).toEqual(mockProfile);
    expect(mockPrisma.applicantProfile.create as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('con isDefault=true desactiva otros perfiles primero', async () => {
    const mockProfile = { id: 'profile-2', ...profileData, userId, isDefault: true };
    (mockPrisma.applicantProfile.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.applicantProfile.create as jest.Mock).mockResolvedValue(mockProfile);
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    await userService.createApplicantProfile(userId, { ...profileData, isDefault: true });

    expect(mockPrisma.applicantProfile.updateMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        data: { isDefault: false },
      })
    );
  });
});

describe('userService.deleteApplicantProfile', () => {
  it('soft delete: actualiza deletedAt', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue({ id: 'profile-1' });
    (mockPrisma.applicantProfile.update as jest.Mock).mockResolvedValue({});
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    await userService.deleteApplicantProfile('user-1', 'profile-1');

    expect(mockPrisma.applicantProfile.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it('perfil inexistente lanza AppError 404', async () => {
    (mockPrisma.applicantProfile.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(userService.deleteApplicantProfile('user-1', 'no-existe'))
      .rejects.toMatchObject({ statusCode: 404, code: 'PROFILE_NOT_FOUND' });
  });
});
