import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { emailInterceptionService } from './email-interception.service';
import { logger } from '../../lib/logger';

const router = Router();

// SendGrid Inbound Parse sends multipart/form-data — use multer to parse it.
// We only need the text fields (from, to, subject, text, html), no file uploads.
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /webhooks/inbound-email
 *
 * Receives inbound emails from SendGrid Inbound Parse webhook.
 * No authentication — SendGrid doesn't send JWT tokens.
 * Always returns 200 so SendGrid doesn't retry.
 */
router.post(
  '/inbound-email',
  upload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from, to, subject, text, html } = req.body;

      // Basic validation: from, to, and subject are required
      if (!from || !to || !subject) {
        logger.warn('Inbound email webhook missing required fields', {
          hasFrom: !!from,
          hasTo: !!to,
          hasSubject: !!subject,
        });
        // Still return 200 to prevent SendGrid retries
        res.status(200).json({ received: true, processed: false, reason: 'missing_required_fields' });
        return;
      }

      await emailInterceptionService.processInboundEmail({
        from,
        to,
        subject,
        body: text || '',
        html: html || undefined,
      });

      res.status(200).json({ received: true, processed: true });
    } catch (err) {
      logger.error('Error processing inbound email webhook', { error: err });
      // Always return 200 to SendGrid to avoid infinite retries
      res.status(200).json({ received: true, processed: false, reason: 'processing_error' });
    }
  },
);

export default router;
