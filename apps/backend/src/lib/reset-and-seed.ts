/**
 * reset-and-seed.ts
 * Trunca todas las tablas y recarga los datos iniciales.
 * Uso local:  npx ts-node -e "require('./src/lib/reset-and-seed').resetAndSeed()"
 * Remoto:     POST /api/admin/reset-and-seed  (solo NODE_ENV !== 'production')
 */

import { PrismaClient } from '@prisma/client';
import { main as seed } from './seed';

const prisma = new PrismaClient();

export async function resetAndSeed() {
  console.log('🗑️  Truncating all tables...');

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      booking_attempts,
      appointments,
      invoices,
      payments,
      notifications,
      document_files,
      booking_requests,
      applicant_profiles,
      refresh_tokens,
      audit_logs,
      compliance_reviews,
      connector_capabilities,
      connectors,
      procedure_requirements,
      procedures,
      organizations,
      users
    RESTART IDENTITY CASCADE
  `);

  console.log('✅ Tables truncated');
  await seed();
}

// Correr directamente si se llama como script
if (require.main === module) {
  resetAndSeed()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
