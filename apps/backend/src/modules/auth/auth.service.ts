import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { AuthPayload } from '../../middleware/auth';
import { auditService } from '../audit/audit.service';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = 30;

export const authService = {
  async register(email: string, password: string, consentVersion: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'El email ya está registrado', 'EMAIL_EXISTS');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        consentGiven: true,
        consentDate: new Date(),
        consentVersion,
      },
    });

    await auditService.log({ userId: user.id, action: 'CREATE', entityType: 'User', entityId: user.id });
    return { id: user.id, email: user.email, role: user.role };
  },

  async login(email: string, password: string, mfaToken?: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Credenciales inválidas', 'INVALID_CREDENTIALS');

    if (user.mfaEnabled) {
      if (!mfaToken) throw new AppError(200, 'MFA requerido', 'MFA_REQUIRED');
      const isValidMfa = authenticator.verify({ token: mfaToken, secret: user.mfaSecret! });
      if (!isValidMfa) throw new AppError(401, 'Código MFA inválido', 'INVALID_MFA');
    }

    const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const refreshToken = await prisma.refreshToken.create({
      data: {
        token: uuidv4(),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await auditService.log({ userId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id });
    return { accessToken, refreshToken: refreshToken.token, user: payload };
  },

  async refreshToken(token: string) {
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token inválido', 'INVALID_REFRESH_TOKEN');
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw new AppError(401, 'Usuario no encontrado', 'USER_NOT_FOUND');

    const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return { accessToken };
  },

  async logout(token: string) {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { revokedAt: new Date() },
    });
  },

  async setupMfa(userId: string) {
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    const otpauth = authenticator.keyuri(userId, 'GestorCitas', secret);
    return { secret, otpauth };
  },

  async enableMfa(userId: string, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) throw new AppError(400, 'MFA no configurado', 'MFA_NOT_SETUP');
    const valid = authenticator.verify({ token, secret: user.mfaSecret });
    if (!valid) throw new AppError(401, 'Código MFA inválido', 'INVALID_MFA');
    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return { enabled: true };
  },
};
