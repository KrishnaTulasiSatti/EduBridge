import { Router, type CookieOptions, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { issuerRegisterSchema, loginSchema, studentRegisterSchema } from '@eduvault/shared';
import { env, isProd } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import * as authService from './auth.service';
import { User } from './user.model';

// Different name from EduBridge's cookie: browsers share localhost cookies across ports.
export const REFRESH_COOKIE = 'ev_refresh';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/api/auth',
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 });
}
function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes.' } },
});

export const authRouter = Router();

authRouter.post('/register/student', authLimiter, validateBody(studentRegisterSchema), async (req, res) => {
  const { user, tokens } = await authService.registerStudent(req.body, req);
  setRefreshCookie(res, tokens.refreshToken);
  res.status(201).json({ user: await authService.toVaultUser(user), accessToken: tokens.accessToken });
});

authRouter.post('/register/institution', authLimiter, validateBody(issuerRegisterSchema), async (req, res) => {
  const { user } = await authService.registerIssuer(req.body, req);
  res.status(201).json({ user: await authService.toVaultUser(user), accessToken: null, pendingApproval: true });
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { user, tokens } = await authService.login(req.body, req);
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ user: await authService.toVaultUser(user), accessToken: tokens.accessToken });
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const { user, tokens } = await authService.refresh(req.cookies?.[REFRESH_COOKIE], req);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ user: await authService.toVaultUser(user), accessToken: tokens.accessToken });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], req);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthorized();
  res.json({ user: await authService.toVaultUser(user) });
});
