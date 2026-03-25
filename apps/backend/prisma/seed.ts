/**
 * Prisma seed entrypoint — delega a src/lib/seed.ts
 * Uso: npx ts-node prisma/seed.ts  o  npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { main } from '../src/lib/seed';

const prisma = new PrismaClient();

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
