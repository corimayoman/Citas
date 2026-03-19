import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { paymentService } from './payment.service';

const router = Router();

// Stripe webhook — raw body required
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    await paymentService.handleWebhook(req.body, sig);
    res.json({ received: true });
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await paymentService.getUserPayments(req.user!.userId);
    res.json({ data: payments });
  } catch (err) { next(err); }
});

router.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingRequestId } = z.object({ bookingRequestId: z.string().uuid() }).parse(req.body);
    const result = await paymentService.createCheckoutSession(req.user!.userId, bookingRequestId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

export default router;
