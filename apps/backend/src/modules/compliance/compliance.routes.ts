import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { complianceService } from './compliance.service';

const router = Router();
router.use(authenticate);

const reviewSchema = z.object({
  connectorId: z.string().uuid(),
  termsChecked: z.boolean(),
  robotsTxtChecked: z.boolean(),
  apiDocsChecked: z.boolean(),
  hasOfficialApi: z.boolean(),
  hasAuthorizedIntegration: z.boolean(),
  requiresCaptchaBypass: z.boolean(),
  requiresAntiBotEvasion: z.boolean(),
  requiresRateLimitEvasion: z.boolean(),
  requiresAuthBypass: z.boolean(),
  legalBasis: z.string().optional(),
  notes: z.string().optional(),
});

// Evaluate without saving (dry run)
router.post('/evaluate', authorize('ADMIN', 'COMPLIANCE_OFFICER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = reviewSchema.parse(req.body);
    const decision = complianceService.evaluate(data);
    res.json({ data: decision });
  } catch (err) { next(err); }
});

// Full review with persistence
router.post('/review', authorize('ADMIN', 'COMPLIANCE_OFFICER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = reviewSchema.parse(req.body);
    const result = await complianceService.reviewConnector(data, req.user!.userId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.get('/connector/:connectorId', authorize('ADMIN', 'COMPLIANCE_OFFICER', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviews = await complianceService.getConnectorCompliance(req.params.connectorId);
    res.json({ data: reviews });
  } catch (err) { next(err); }
});

export default router;
