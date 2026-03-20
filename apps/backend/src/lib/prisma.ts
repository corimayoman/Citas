import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('error', (e: unknown) => logger.error('Prisma error', e));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('warn', (e: unknown) => logger.warn('Prisma warning', e));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
