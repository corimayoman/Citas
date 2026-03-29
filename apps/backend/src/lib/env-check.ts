/**
 * Environment variable health check.
 * Validates that all required env vars are present at startup.
 * Logs warnings for optional vars that are missing.
 */
import { logger } from './logger';

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const BACKEND_ENV_VARS: EnvVar[] = [
  // Database
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },

  // Auth
  { name: 'JWT_SECRET', required: true, description: 'Secret for signing JWT tokens' },
  { name: 'JWT_EXPIRES_IN', required: false, description: 'JWT TTL (default: 15m)' },

  // Encryption
  { name: 'ENCRYPTION_KEY', required: true, description: 'AES-256-GCM encryption key (64 hex chars)' },
  { name: 'HASH_SALT', required: true, description: 'Salt for one-way hashing' },

  // Frontend
  { name: 'FRONTEND_URL', required: true, description: 'Frontend origin for CORS and Stripe redirects' },

  // Stripe
  { name: 'STRIPE_SECRET_KEY', required: true, description: 'Stripe secret key' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: true, description: 'Stripe webhook signing secret (whsec_...)' },
  { name: 'STRIPE_DEMO_MODE', required: false, description: 'Set to "true" to bypass Stripe' },

  // Redis
  { name: 'REDIS_URL', required: true, description: 'Redis connection string for BullMQ' },

  // Email
  { name: 'SENDGRID_API_KEY', required: false, description: 'SendGrid API key for emails (SG....)' },
  { name: 'MAIL_FROM', required: false, description: 'Email sender address' },
  { name: 'NOTIFICATIONS_DEMO_MODE', required: false, description: 'Set to "true" to simulate notifications' },

  // SMS
  { name: 'TWILIO_ACCOUNT_SID', required: false, description: 'Twilio Account SID' },
  { name: 'TWILIO_AUTH_TOKEN', required: false, description: 'Twilio Auth Token' },
  { name: 'TWILIO_FROM_NUMBER', required: false, description: 'Twilio phone number (E.164)' },

  // S3
  { name: 'S3_ENDPOINT', required: false, description: 'S3-compatible endpoint' },
  { name: 'S3_BUCKET', required: false, description: 'S3 bucket name' },
  { name: 'S3_ACCESS_KEY', required: false, description: 'S3 access key' },
  { name: 'S3_SECRET_KEY', required: false, description: 'S3 secret key' },
  { name: 'S3_REGION', required: false, description: 'S3 region' },

  // Server
  { name: 'PORT', required: false, description: 'Server port (default: 3001)' },
  { name: 'LOG_LEVEL', required: false, description: 'Winston log level (default: info)' },
  { name: 'NODE_ENV', required: false, description: 'Environment (development/production)' },
];

export function checkEnvironmentVariables(): { ok: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of BACKEND_ENV_VARS) {
    const value = process.env[v.name];
    if (!value || value.trim() === '') {
      if (v.required) {
        missing.push(`${v.name} — ${v.description}`);
      } else {
        warnings.push(`${v.name} — ${v.description}`);
      }
    }
  }

  // Validate specific formats
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length !== 64) {
    missing.push('ENCRYPTION_KEY — must be exactly 64 hex characters');
  }
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
    warnings.push('STRIPE_SECRET_KEY — should start with sk_');
  }
  if (process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    warnings.push('STRIPE_WEBHOOK_SECRET — should start with whsec_');
  }
  if (process.env.SENDGRID_API_KEY && !process.env.SENDGRID_API_KEY.startsWith('SG.')) {
    warnings.push('SENDGRID_API_KEY — should start with SG.');
  }

  if (missing.length > 0) {
    logger.error(`❌ MISSING REQUIRED ENV VARS (${missing.length}):`);
    missing.forEach(m => logger.error(`   - ${m}`));
  }
  if (warnings.length > 0) {
    logger.warn(`⚠️  MISSING OPTIONAL ENV VARS (${warnings.length}):`);
    warnings.forEach(w => logger.warn(`   - ${w}`));
  }
  if (missing.length === 0) {
    logger.info('✅ All required environment variables are present');
  }

  return { ok: missing.length === 0, missing, warnings };
}

/** List of all env vars for documentation/reference */
export const ALL_BACKEND_ENV_VARS = BACKEND_ENV_VARS;
