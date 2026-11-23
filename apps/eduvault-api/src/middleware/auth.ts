import type { RequestHandler } from 'express';
import type { VaultRole } from '@eduvault/shared';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: VaultRole };
    }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'TOKEN_INVALID', 'Session expired, please sign in again'));
  }
};

/** Role-Based Access Control guard. Use after `authenticate`. */
export const requireRole =
  (...roles: VaultRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
