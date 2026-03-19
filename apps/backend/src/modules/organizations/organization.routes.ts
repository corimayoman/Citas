import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { country, region, search } = req.query as Record<string, string>;
    const orgs = await prisma.organization.findMany({
      where: {
        isActive: true,
        ...(country && { country }),
        ...(region && { region }),
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      include: { _count: { select: { procedures: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: orgs });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: { procedures: { where: { isActive: true } } },
    });
    if (!org) { res.status(404).json({ error: { message: 'Organismo no encontrado' } }); return; }
    res.json({ data: org });
  } catch (err) { next(err); }
});

const orgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  country: z.string(),
  region: z.string().optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
});

router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = orgSchema.parse(req.body);
    const org = await prisma.organization.create({ data });
    res.status(201).json({ data: org });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = orgSchema.partial().parse(req.body);
    const org = await prisma.organization.update({ where: { id: req.params.id }, data });
    res.json({ data: org });
  } catch (err) { next(err); }
});

export default router;
