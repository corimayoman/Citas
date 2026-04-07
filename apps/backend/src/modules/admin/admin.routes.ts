import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { auditService } from '../audit/audit.service';
import { circuitBreakerService } from '../connectors/circuit-breaker.service';
import { connectorRegistry } from '../connectors/connector.registry';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'OPERATOR', 'COMPLIANCE_OFFICER'));

// Dashboard stats
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, bookings, payments, procedures] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.bookingRequest.groupBy({ by: ['status'], _count: true }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
      prisma.procedure.count({ where: { isActive: true } }),
    ]);
    res.json({ data: { users, bookings, totalRevenue: payments._sum.amount, procedures } });
  } catch (err) { next(err); }
});

// All bookings
router.get('/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [bookings, total] = await Promise.all([
      prisma.bookingRequest.findMany({
        where: { ...(status && { status: status as any }) },
        include: {
          user: { select: { email: true } },
          procedure: { select: { name: true } },
          applicantProfile: { select: { firstName: true, lastName: true } },
          payment: { select: { status: true, amount: true } },
        },
        skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bookingRequest.count({ where: { ...(status && { status: status as any }) } }),
    ]);
    res.json({ data: bookings, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

// Audit logs
router.get('/audit-logs', authorize('ADMIN', 'COMPLIANCE_OFFICER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, userId, entityType, action } = req.query as Record<string, string>;
    const result = await auditService.getLogs({
      userId, entityType, action: action as any,
      page: parseInt(page || '1'), limit: parseInt(limit || '50'),
    });
    res.json({ data: result });
  } catch (err) { next(err); }
});


// All users
router.get('/users', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, email: true, role: true, isActive: true, createdAt: true, _count: { select: { bookingRequests: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: users });
  } catch (err) { next(err); }
});

// Connector health metrics (ADMIN only)
router.get('/connectors/health', authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const connectors = await prisma.connector.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        lastHealthCheck: true,
        errorRate: true,
        avgResponseTimeMs: true,
        suspendedReason: true,
        suspendedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ data: connectors });
  } catch (err) { next(err); }
});

// Reset and seed — bloqueado en producción real, permitido en QA
// POST /api/admin/reset-and-seed
router.post('/reset-and-seed', authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  const env = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || '';
  if (env === 'production') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }
  try {
    const { resetAndSeed } = await import('../../lib/reset-and-seed');
    await resetAndSeed();
    res.json({ data: { ok: true, message: 'Database reset and seeded successfully' } });
  } catch (err) { next(err); }
});

// Reactivate a suspended connector (ADMIN only)
router.post('/connectors/:id/reactivate', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectorId = req.params.id;
    await circuitBreakerService.reactivate(connectorId, req.user!.userId);
    res.json({ data: { ok: true, message: 'Connector reactivated successfully' } });
  } catch (err) { next(err); }
});

// Manual health check for a connector (ADMIN only)
router.post('/connectors/:id/health-check', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectorId = req.params.id;
    const connector = await prisma.connector.findUnique({
      where: { id: connectorId },
      select: { slug: true },
    });
    if (!connector) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    const adapter = connectorRegistry.get(connector.slug);
    if (!adapter) {
      res.status(404).json({ error: 'Connector adapter not found in registry' });
      return;
    }

    const start = Date.now();
    const ok = await adapter.healthCheck();
    const responseTimeMs = Date.now() - start;

    if (ok) {
      await prisma.connector.update({
        where: { id: connectorId },
        data: { lastHealthCheck: new Date() },
      });
    }

    res.json({ data: { ok, responseTimeMs } });
  } catch (err) { next(err); }
});

// Dry-run: test getAvailability without booking (ADMIN only)
router.post('/connectors/:id/dry-run', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectorId = req.params.id;
    const { procedureId, fromDate, toDate } = req.query as Record<string, string>;

    const connector = await prisma.connector.findUnique({
      where: { id: connectorId },
      select: { slug: true },
    });
    if (!connector) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    const adapter = connectorRegistry.get(connector.slug);
    if (!adapter) {
      res.status(404).json({ error: 'Connector adapter not found in registry' });
      return;
    }

    if (!adapter.getAvailability) {
      res.status(400).json({ error: 'Connector does not support availability checks' });
      return;
    }

    try {
      const slots = await adapter.getAvailability(procedureId, fromDate, toDate);
      res.json({ data: { ok: true, slots, count: slots.length } });
    } catch (err: any) {
      res.json({ data: { ok: false, error: err.message || 'Unknown error' } });
    }
  } catch (err) { next(err); }
});

export default router;
