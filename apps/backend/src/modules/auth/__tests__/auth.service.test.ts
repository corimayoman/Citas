import { authService } from '../auth.service';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { auditService } from '../../audit/audit.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
}));

jest.mock('../../audit/audit.service', () => ({
  auditService: {
    log: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
});

describe('authService.register', () => {
  it('happy path: retorna id, email y role', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      role: 'USER',
    });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    const result = await authService.register('test@example.com', 'password123', 'v1');

    expect(result).toEqual({ id: 'user-1', email: 'test@example.com', role: 'USER' });
    expect(mockPrisma.user.create as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('email duplicado lanza AppError 409', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    await expect(authService.register('dup@example.com', 'pass', 'v1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_EXISTS' });
  });
});

describe('authService.login', () => {
  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
    passwordHash: 'hashed',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
  };

  it('credenciales válidas retorna accessToken y refreshToken', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (jwt.sign as jest.Mock).mockReturnValue('access-token-123');
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({ token: 'refresh-token-abc' });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);

    const result = await authService.login('user@example.com', 'password');

    expect(result.accessToken).toBe('access-token-123');
    expect(result.refreshToken).toBe('refresh-token-abc');
  });

  it('password inválido lanza AppError 401', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(authService.login('user@example.com', 'wrong'))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('usuario inexistente lanza AppError 401', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(authService.login('noexiste@example.com', 'pass'))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });
});

describe('authService.refreshToken', () => {
  const mockStoredToken = {
    token: 'valid-refresh',
    userId: 'user-1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
    isActive: true,
  };

  it('token válido retorna nuevo accessToken', async () => {
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockStoredToken);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (jwt.sign as jest.Mock).mockReturnValue('new-access-token');

    const result = await authService.refreshToken('valid-refresh');

    expect(result.accessToken).toBe('new-access-token');
  });

  it('token revocado lanza AppError 401', async () => {
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      ...mockStoredToken,
      revokedAt: new Date(),
    });

    await expect(authService.refreshToken('revoked-token'))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
  });

  it('token expirado lanza AppError 401', async () => {
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      ...mockStoredToken,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(authService.refreshToken('expired-token'))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
  });
});

describe('authService.logout', () => {
  it('llama a prisma.refreshToken.updateMany con revokedAt', async () => {
    (mockPrisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await authService.logout('some-token');

    expect(mockPrisma.refreshToken.updateMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'some-token' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );
  });
});
