import type { RequestHandler } from 'express';
import type { Role } from '@edubridge/shared';
import { User } from '../modules/auth/user.model';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

/*
 * Access tokens live 15 minutes. So that suspending an account (or changing a role) takes effect
 * at once rather than when the token expires, the account is re-checked, cached for a few seconds.
 */
const ACCOUNT_CACHE_MS = 10_000;
const accountCache = new Map<string, { status: string; role: Role; at: number }>();

/** Drops the cached account state, e.g. right after an admin changes it. */
export const forgetAccount = (userId: string) => accountCache.delete(userId);

async function currentAccount(id: string) {
  const hit = accountCache.get(id);
  if (hit && Date.now() - hit.at < ACCOUNT_CACHE_MS) return hit;
  const u = await User.findById(id).select('status role').lean();
  if (!u) {
    accountCache.delete(id);
    return null;
  }
  const entry = { status: u.status as string, role: u.role as Role, at: Date.now() };
  if (accountCache.size > 5000) accountCache.clear();
  accountCache.set(id, entry);
  return entry;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    return next(new AppError(401, 'TOKEN_INVALID', 'Session expired, please sign in again'));
  }
  try {
    const account = await currentAccount(payload.sub);
    if (!account || account.status !== 'ACTIVE' || account.role !== payload.role) {
      return next(new AppError(401, 'TOKEN_INVALID', 'Session expired, please sign in again'));
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
};

/** Role-Based Access Control guard. Use after `authenticate`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
