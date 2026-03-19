import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { authenticate } from '../../middleware/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  consentVersion: z.string().default('1.0'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  mfaToken: z.string().optional(),
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registro de nuevo usuario
 *     security: []
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data.email, data.password, data.consentVersion);
    res.status(201).json({ data: user });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Inicio de sesión
 *     security: []
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password, data.mfaToken);
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const result = await authService.refreshToken(refreshToken);
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    await authService.logout(refreshToken);
    res.json({ data: { message: 'Sesión cerrada correctamente' } });
  } catch (err) { next(err); }
});

router.post('/mfa/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.setupMfa(req.user!.userId);
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.post('/mfa/enable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    const result = await authService.enableMfa(req.user!.userId, token);
    res.json({ data: result });
  } catch (err) { next(err); }
});

export default router;
