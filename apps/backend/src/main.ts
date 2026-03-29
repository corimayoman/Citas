import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { swaggerSpec } from './lib/swagger';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import organizationRoutes from './modules/organizations/organization.routes';
import procedureRoutes from './modules/procedures/procedure.routes';
import connectorRoutes from './modules/connectors/connector.routes';
import bookingRoutes from './modules/bookings/booking.routes';
import paymentRoutes from './modules/payments/payment.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import adminRoutes from './modules/admin/admin.routes';
import complianceRoutes from './modules/compliance/compliance.routes';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust first proxy hop (Railway reverse proxy)
app.set('trust proxy', 1);

// ─── Stripe webhook — MUST be before ANY middleware (helmet, compression, rate-limit, json parser) ──
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  const { paymentService } = await import('./modules/payments/payment.service');
  try {
    const sig = req.headers['stripe-signature'] as string;
    await paymentService.handleWebhook(req.body, sig);
    res.json({ received: true });
  } catch (err) { next(err); }
});

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());

// ─── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/', authLimiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Swagger docs ─────────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/procedures', procedureRoutes);
app.use('/api/connectors', connectorRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/compliance', complianceRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const { checkEnvironmentVariables } = await import('./lib/env-check');
  const envCheck = checkEnvironmentVariables();
  res.json({
    status: envCheck.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    env: {
      ok: envCheck.ok,
      missingRequired: envCheck.missing.length,
      missingOptional: envCheck.warnings.length,
    },
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    // Validate environment variables before anything else
    const { checkEnvironmentVariables } = await import('./lib/env-check');
    const envCheck = checkEnvironmentVariables();
    if (!envCheck.ok) {
      logger.error('Server cannot start — missing required environment variables. See errors above.');
      process.exit(1);
    }

    await prisma.$connect();
    logger.info('Database connected');

    // Auto-seed if DB is empty (first boot or after reset)
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      logger.info('Empty database detected — running seed...');
      const { resetAndSeed } = await import('./lib/reset-and-seed');
      await resetAndSeed();
      logger.info('Seed completed');
    }

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Swagger docs: http://localhost:${PORT}/api/docs`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

bootstrap();

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
