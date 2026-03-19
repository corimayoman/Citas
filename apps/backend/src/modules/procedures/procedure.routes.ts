import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { country, organizationId, category, search, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [procedures, total] = await Promise.all([
      prisma.procedure.findMany({
        where: {
          isActive: true,
          ...(organizationId && { organizationId }),
          ...(category && { category }),
          ...(search && { name: { contains: search, mode: 'insensitive' } }),
          ...(country && { organization: { country } }),
        },
        include: {
          organization: { select: { id: true, name: true, country: true, region: true } },
          connector: { select: { id: true, integrationType: true, status: true, canBook: true } },
          _count: { select: { requirements: true } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { name: 'asc' },
      }),
      prisma.procedure.count({ where: { isActive: true } }),
    ]);

    res.json({ data: procedures, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const procedure = await prisma.procedure.findUnique({
      where: { id: req.params.id },
      include: {
        organization: true,
        requirements: { orderBy: { order: 'asc' } },
        connector: true,
      },
    });
    if (!procedure) { res.status(404).json({ error: { message: 'Trámite no encontrado' } }); return; }
    res.json({ data: procedure });
  } catch (err) { next(err); }
});

const procedureSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  category: z.string(),
  estimatedTime: z.number().optional(),
  serviceFee: z.number().optional(),
  currency: z.string().default('EUR'),
  formSchema: z.record(z.unknown()),
  eligibilityRules: z.record(z.unknown()).optional(),
  slaHours: z.number().optional(),
  legalBasis: z.string().optional(),
  connectorId: z.string().uuid().optional(),
});

router.post('/', authenticate, authorize('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = procedureSchema.parse(req.body);
    const procedure = await prisma.procedure.create({ data });
    res.status(201).json({ data: procedure });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = procedureSchema.partial().parse(req.body);
    const procedure = await prisma.procedure.update({ where: { id: req.params.id }, data });
    res.json({ data: procedure });
  } catch (err) { next(err); }
});

export default router;
