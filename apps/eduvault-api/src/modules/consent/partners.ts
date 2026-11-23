import type { RequestHandler } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { safeEqual } from '../../utils/tokens';

/**
 * Registered partner services that may request student documents.
 * Partners authenticate server-to-server with a client ID and secret (HTTP Basic),
 * and may only send students back to redirect URIs registered here.
 */
export interface Partner {
  id: string;
  name: string;
  description: string;
  secret: string;
  redirectUris: string[];
}

const partners: Partner[] = [
  {
    id: env.EDUBRIDGE_CLIENT_ID,
    name: 'EduBridge',
    description: 'Educational sponsorship platform',
    secret: env.EDUBRIDGE_CLIENT_SECRET,
    redirectUris: env.EDUBRIDGE_REDIRECT_URIS.split(',').map((s) => s.trim()).filter(Boolean),
  },
];

export const findPartner = (id: string) => partners.find((p) => p.id === id);

export function publicPartner(id: string) {
  const p = findPartner(id);
  return p ? { id: p.id, name: p.name, description: p.description } : { id, name: id, description: '' };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      partner?: Partner;
    }
  }
}

export const authenticatePartner: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const fail = () => next(new AppError(401, 'INVALID_CLIENT', 'Partner authentication failed'));
  if (!header.startsWith('Basic ')) return fail();
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 1) return fail();
  const partner = findPartner(decoded.slice(0, sep));
  // Compare even when the partner is unknown so timing does not reveal valid client IDs.
  const ok = safeEqual(decoded.slice(sep + 1), partner?.secret ?? 'unknown-partner-secret');
  if (!partner || !ok) return fail();
  req.partner = partner;
  next();
};
