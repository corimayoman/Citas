import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { notificationService } from './notification.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: notifications });
  } catch (err) { next(err); }
});

router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markRead(req.params.id, req.user!.userId);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllRead(req.user!.userId);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

export default router;
