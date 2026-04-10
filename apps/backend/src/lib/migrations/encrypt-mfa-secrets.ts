/**
 * Migration: encrypt-mfa-secrets
 *
 * One-time script that encrypts all plaintext mfaSecret values in the database.
 *
 * Background:
 *   Prior to the security hardening PR, mfaSecret was stored as plaintext base32.
 *   After the PR, setupMfa() encrypts with AES-256-GCM (format: "iv:tag:data").
 *   Existing users with plaintext secrets will fail login until migrated.
 *
 * Detection:
 *   Encrypted values have exactly 2 colons (iv:tag:data).
 *   Plaintext TOTP secrets are base32 — they never contain colons.
 *
 * Safety:
 *   - Idempotent: already-encrypted values are skipped.
 *   - Dry-run mode (default): prints what would change, touches nothing.
 *   - Pass --apply to write changes.
 *
 * Usage:
 *   # Preview (safe, no writes):
 *   npx ts-node src/lib/migrations/encrypt-mfa-secrets.ts
 *
 *   # Apply:
 *   APPLY=true npx ts-node src/lib/migrations/encrypt-mfa-secrets.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.env.APPLY !== 'true';

function isAlreadyEncrypted(value: string): boolean {
  // Encrypted format: "hex:hex:hex" — always contains exactly 2 colons
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}

async function run(): Promise<void> {
  console.log(`\n🔐 MFA Secret Migration — ${DRY_RUN ? 'DRY RUN (no writes)' : '⚠️  APPLY MODE'}\n`);

  // Load all users that have a mfaSecret set
  const users = await prisma.user.findMany({
    where: { mfaSecret: { not: null } },
    select: { id: true, email: true, mfaSecret: true, mfaEnabled: true },
  });

  console.log(`Found ${users.length} user(s) with mfaSecret.\n`);

  let skipped = 0;
  let migrated = 0;
  let errors = 0;

  for (const user of users) {
    const secret = user.mfaSecret!;

    if (isAlreadyEncrypted(secret)) {
      console.log(`  ✅ SKIP  ${user.email} — already encrypted`);
      skipped++;
      continue;
    }

    // Plaintext base32 secret — needs encryption
    try {
      const encryptedSecret = encrypt(secret);

      if (DRY_RUN) {
        console.log(`  🔍 WOULD encrypt  ${user.email} (mfaEnabled: ${user.mfaEnabled})`);
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaSecret: encryptedSecret },
        });
        console.log(`  ✅ ENCRYPTED  ${user.email}`);
      }

      migrated++;
    } catch (err) {
      console.error(`  ❌ ERROR  ${user.email}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`  Skipped (already encrypted): ${skipped}`);
  console.log(`  ${DRY_RUN ? 'Would migrate' : 'Migrated'}:               ${migrated}`);
  console.log(`  Errors:                      ${errors}`);

  if (DRY_RUN && migrated > 0) {
    console.log(`\n  Run with APPLY=true to apply changes.\n`);
  } else if (!DRY_RUN && errors === 0) {
    console.log(`\n  ✅ Migration completed successfully.\n`);
  } else if (errors > 0) {
    console.log(`\n  ⚠️  ${errors} error(s) occurred. Check logs above.\n`);
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
