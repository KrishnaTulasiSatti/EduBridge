import { Router, type CookieOptions, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema, sponsorPanConfirmSchema, sponsorPanStartSchema } from '@edubridge/shared';
import { env, isProd } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import * as authService from './auth.service';
import { confirmSponsorPan, startSponsorPan } from './sponsorPan.service';
import { User, toPublicUser } from './user.model';

export const REFRESH_COOKIE = 'eb_refresh';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/api/auth',
};

/**
 * A session cookie (no maxAge/expires): the browser deletes it when it is closed, which signs the user out.
 * The refresh token itself still expires on the server after REFRESH_TOKEN_TTL_DAYS as a backstop.
 */
function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, cookieOptions);
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

authRouter.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { user, tokens } = await authService.register(req.body, req);
  if (!tokens) {
    res.status(201).json({ user: toPublicUser(user), accessToken: null, pendingApproval: true });
    return;
  }
  setRefreshCookie(res, tokens.refreshToken);
  res.status(201).json({ user: toPublicUser(user), accessToken: tokens.accessToken });
});

/** Sponsor sign-up, step 1: match PAN, name and date of birth with the PAN registry; it emails an OTP. */
authRouter.post('/sponsor-pan/start', authLimiter, validateBody(sponsorPanStartSchema), async (req, res) => {
  res.json(await startSponsorPan(req.body, req));
});

/** Sponsor sign-up, step 2: check the OTP; returns a short-lived PAN token used by /register. */
authRouter.post('/sponsor-pan/confirm', authLimiter, validateBody(sponsorPanConfirmSchema), async (req, res) => {
  res.json(await confirmSponsorPan(req.body, req));
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { user, tokens } = await authService.login(req.body, req);
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ user: toPublicUser(user), accessToken: tokens.accessToken });
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const { user, tokens } = await authService.refresh(req.cookies?.[REFRESH_COOKIE], req);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ user: toPublicUser(user), accessToken: tokens.accessToken });
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
  res.json({ user: toPublicUser(user) });
});
