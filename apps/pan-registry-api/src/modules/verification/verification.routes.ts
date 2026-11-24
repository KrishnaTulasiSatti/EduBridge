import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { safeEqual } from '../../utils/crypto';
import { confirmVerification, startVerification } from './verification.service';

/** Partners authenticate server-to-server with a client ID and secret (HTTP Basic). */
const partners = [{ id: env.EDUBRIDGE_CLIENT_ID, secret: env.EDUBRIDGE_CLIENT_SECRET }];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      partnerId?: string;
    }
  }
}

const authenticatePartner: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const fail = () => next(new AppError(401, 'INVALID_CLIENT', 'Partner authentication failed'));
  if (!header.startsWith('Basic ')) return fail();
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 1) return fail();
  const partner = partners.find((p) => p.id === decoded.slice(0, sep));
  // Compare even when the partner is unknown so timing does not reveal valid client IDs.
  const ok = safeEqual(decoded.slice(sep + 1), partner?.secret ?? 'unknown-partner-secret');
  if (!partner || !ok) return fail();
  req.partnerId = partner.id;
  next();
};

const verifySchema = z.object({
  pan: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

const confirmSchema = z.object({
  reference: z.string().trim().min(8).max(64),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const partnerRouter = Router();

partnerRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 10_000 : 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes.' } },
  }),
);
partnerRouter.use(authenticatePartner);

partnerRouter.post('/pan/verify', validateBody(verifySchema), async (req, res) => {
  res.json(await startVerification(req.partnerId!, req.body));
});

partnerRouter.post('/pan/confirm', validateBody(confirmSchema), async (req, res) => {
  res.json(await confirmVerification(req.partnerId!, req.body.reference, req.body.otp));
});
