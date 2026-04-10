/**
 * Property tests — auth.service
 * Task 1.2 — Property 1: Idempotencia de la suite de auth
 * Requirement 5.7
 *
 * Estos tests verifican invariantes universales que deben cumplirse
 * para cualquier combinación de inputs válidos, no solo para ejemplos concretos.
 */

// Mock crypto before auth.service is imported — crypto.ts throws at module load
// if ENCRYPTION_KEY is missing, so we must intercept it early.
jest.mock('../../../lib/crypto', () => ({
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-secret'),
  hashSensitive: jest.fn().mockImplementation((v: string) => `hashed:${v}`),
}));

import { authService } from '../auth.service';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { auditService } from '../../audit/audit.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn() }));
jest.mock('../../audit/audit.service', () => ({ auditService: { log: jest.fn() } }));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
});

// ---------------------------------------------------------------------------
// Generadores de datos arbitrarios
// ---------------------------------------------------------------------------

function randomEmail(seed: number): string {
  return `user${seed}@example${seed % 5}.com`;
}

function randomPassword(seed: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
  let pwd = '';
  for (let i = 0; i < 8 + (seed % 12); i++) {
    pwd += chars[(seed * (i + 7)) % chars.length];
  }
  return pwd;
}

function randomConsentVersion(seed: number): string {
  return `v${1 + (seed % 5)}.${seed % 10}`;
}

// ---------------------------------------------------------------------------
// Property 1: Idempotencia — registrar el mismo email dos veces siempre falla
// con EMAIL_EXISTS, independientemente del email o password usados.
// ---------------------------------------------------------------------------

describe('Property 1 — register: email duplicado siempre lanza EMAIL_EXISTS', () => {
  const SAMPLES = 20;

  it(`se cumple para ${SAMPLES} combinaciones arbitrarias de email/password`, async () => {
    for (let seed = 0; seed < SAMPLES; seed++) {
      jest.clearAllMocks();

      const email = randomEmail(seed);
      const password = randomPassword(seed);
      const consent = randomConsentVersion(seed);

      // Simular que el email ya existe
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: `existing-${seed}`, email });

      await expect(authService.register(email, password, consent))
        .rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_EXISTS' });

      // Nunca debe intentar crear el usuario
      expect(mockPrisma.user.create as jest.Mock).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: login con password incorrecto siempre lanza INVALID_CREDENTIALS,
// sin importar qué password se use ni cuál sea el hash almacenado.
// ---------------------------------------------------------------------------

describe('Property 2 — login: password incorrecto siempre lanza INVALID_CREDENTIALS', () => {
  const SAMPLES = 20;

  it(`se cumple para ${SAMPLES} combinaciones arbitrarias de password`, async () => {
    for (let seed = 0; seed < SAMPLES; seed++) {
      jest.clearAllMocks();

      const email = randomEmail(seed);
      const wrongPassword = randomPassword(seed);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: `user-${seed}`,
        email,
        passwordHash: `hash-${seed}`,
        isActive: true,
        mfaEnabled: false,
      });
      // bcrypt.compare siempre retorna false → password incorrecto
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(email, wrongPassword))
        .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

      // Nunca debe generar tokens
      expect(jwt.sign as jest.Mock).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create as jest.Mock).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3: refreshToken expirado siempre lanza INVALID_REFRESH_TOKEN,
// sin importar cuánto tiempo haya pasado desde la expiración.
// ---------------------------------------------------------------------------

describe('Property 3 — refreshToken: token expirado siempre lanza INVALID_REFRESH_TOKEN', () => {
  const SAMPLES = 20;

  it(`se cumple para ${SAMPLES} tiempos de expiración distintos`, async () => {
    for (let seed = 0; seed < SAMPLES; seed++) {
      jest.clearAllMocks();

      // Expirado hace entre 1ms y 365 días
      const msAgo = 1 + seed * 24 * 60 * 60 * 1000;
      (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        token: `token-${seed}`,
        userId: `user-${seed}`,
        revokedAt: null,
        expiresAt: new Date(Date.now() - msAgo),
      });

      await expect(authService.refreshToken(`token-${seed}`))
        .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });

      expect(jwt.sign as jest.Mock).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Property 4: logout siempre llama a updateMany con revokedAt,
// independientemente del token que se pase.
// ---------------------------------------------------------------------------

describe('Property 4 — logout: siempre revoca el token recibido', () => {
  const SAMPLES = 20;

  it(`se cumple para ${SAMPLES} tokens distintos`, async () => {
    for (let seed = 0; seed < SAMPLES; seed++) {
      jest.clearAllMocks();

      const token = `refresh-token-${seed}-${Math.random().toString(36).slice(2)}`;
      (mockPrisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await authService.logout(token);

      expect(mockPrisma.refreshToken.updateMany as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    }
  });
});
