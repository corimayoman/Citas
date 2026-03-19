import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { connectorRegistry } from './connector.registry';
import { auditService } from '../audit/audit.service';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const connectors = await prisma.connector.findMany({
      include: { organization: { select: { name: true, country: true } }, capabilities: true },
    });
    res.json({ data: connectors });
  } catch (err) { next(err); }
});

router.get('/registry', authenticate, authorize('ADMIN', 'OPERATOR'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ data: connectorRegistry.list() });
  } catch (err) { next(err); }
});

router.get('/:id/availability', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { procedureId, fromDate, toDate } = z.object({
      procedureId: z.string(),
      fromDate: z.string(),
      toDate: z.string(),
    }).parse(req.query);

    const connector = connectorRegistry.get(req.params.id);
    if (!connector) { res.status(404).json({ error: { message: 'Conector no encontrado' } }); return; }
    if (!connector.metadata.canCheckAvailability || !connector.getAvailability) {
      res.status(400).json({ error: { message: 'Este conector no soporta consulta de disponibilidad' } });
      return;
    }

    const slots = await connector.getAvailability(procedureId, fromDate, toDate);
    res.json({ data: slots });
  } catch (err) { next(err); }
});

router.post('/:id/toggle', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connector = await prisma.connector.findUnique({ where: { id: req.params.id } });
    if (!connector) { res.status(404).json({ error: { message: 'Conector no encontrado' } }); return; }

    const newStatus = connector.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await prisma.connector.update({
      where: { id: req.params.id },
      data: { status: newStatus },
    });

    await auditService.log({
      userId: req.user!.userId,
      action: 'CONNECTOR_TOGGLE',
      entityType: 'Connector',
      entityId: req.params.id,
      after: { status: newStatus },
    });

    res.json({ data: updated });
  } catch (err) { next(err); }
});

export default router;
