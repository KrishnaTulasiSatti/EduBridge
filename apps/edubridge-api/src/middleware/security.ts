import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env, isProd } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Security headers for a JSON API. Nothing here is ever rendered as a page, so the
 * content security policy allows nothing and no site may frame a response.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

/** API responses carry personal data: browsers and proxies must not keep copies. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};

/** In production every request must arrive over HTTPS (behind the host's TLS proxy). */
export const requireHttps: RequestHandler = (req, _res, next) => {
  if (isProd && !req.secure) return next(new AppError(403, 'HTTPS_REQUIRED', 'Use HTTPS to connect to EduBridge'));
  next();
};

/** A general per-IP ceiling for every API route; sign-in has its own, stricter limit. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 100_000 : 900,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes.' } },
});

function hasOperatorKey(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKey(v, depth + 1));
  return Object.entries(value).some(([k, v]) => k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || hasOperatorKey(v, depth + 1));
}

/**
 * Rejects request bodies and query strings with MongoDB operator keys (`$where`, `$gt`…), dotted
 * paths or prototype keys. Zod already strips unknown keys; this is a second, global line of defence.
 */
export const rejectOperatorInjection: RequestHandler = (req, _res, next) => {
  if (hasOperatorKey(req.body) || hasOperatorKey(req.query)) {
    return next(AppError.badRequest('The request contains characters that are not allowed'));
  }
  next();
};
