import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { userService } from './user.service';

const router = Router();
router.use(authenticate);

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getProfile(req.user!.userId);
    res.json({ data: user });
  } catch (err) { next(err); }
});

router.get('/me/profiles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profiles = await userService.getApplicantProfiles(req.user!.userId);
    res.json({ data: profiles });
  } catch (err) { next(err); }
});

const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: z.string(),
  documentNumber: z.string().min(1),
  nationality: z.string(),
  birthDate: z.string().transform(d => new Date(d)),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  isDefault: z.boolean().optional(),
});

router.post('/me/profiles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = profileSchema.parse(req.body);
    const profile = await userService.createApplicantProfile(req.user!.userId, data);
    res.status(201).json({ data: profile });
  } catch (err) { next(err); }
});

router.delete('/me/profiles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.deleteApplicantProfile(req.user!.userId, req.params.id);
    res.json({ data: { message: 'Perfil eliminado' } });
  } catch (err) { next(err); }
});

router.post('/me/gdpr/delete-request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await userService.requestDataDeletion(req.user!.userId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

export default router;
