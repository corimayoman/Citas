/**
 * reset-and-seed entrypoint — delega a src/lib/reset-and-seed.ts
 * Uso: npx ts-node prisma/reset-and-seed.ts  o  npm run db:reset
 */
import { PrismaClient } from '@prisma/client';
import { resetAndSeed } from '../src/lib/reset-and-seed';

const prisma = new PrismaClient();

resetAndSeed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
