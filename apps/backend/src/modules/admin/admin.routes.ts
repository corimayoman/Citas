import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { auditService } from '../audit/audit.service';

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

// Reset and seed — solo disponible si NODE_ENV !== 'production'
// POST /api/admin/reset-and-seed
router.post('/reset-and-seed', authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }
  try {
    const { resetAndSeed } = await import('../../lib/reset-and-seed');
    await resetAndSeed();
    res.json({ data: { ok: true, message: 'Database reset and seeded successfully' } });
  } catch (err) { next(err); }
});

export default router;
