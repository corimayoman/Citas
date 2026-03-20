import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { bookingService } from './booking.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = req.query as Record<string, string>;
    const result = await bookingService.getUserBookings(req.user!.userId, parseInt(page || '1'), parseInt(limit || '20'));
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.getBookingById(req.params.id, req.user!.userId);
    res.json({ data: booking });
  } catch (err) { next(err); }
});

const createSchema = z.object({
  applicantProfileId: z.string().uuid(),
  procedureId: z.string().uuid(),
  formData: z.record(z.unknown()),
  preferredDateFrom: z.string().optional(),
  preferredDateTo: z.string().optional(),
  preferredTimeSlot: z.enum(['morning', 'afternoon']).optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body);
    const booking = await bookingService.createDraft(req.user!.userId, data);
    res.status(201).json({ data: booking });
  } catch (err) { next(err); }
});

router.post('/:id/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.validateBooking(req.params.id, req.user!.userId);
    res.json({ data: booking });
  } catch (err) { next(err); }
});

router.post('/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await bookingService.executeBooking(req.params.id, req.user!.userId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// Called after PRE_CONFIRMED payment to move to CONFIRMED and send details
router.post('/:id/confirm-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await bookingService.confirmAfterPayment(req.params.id, req.user!.userId);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

export default router;
