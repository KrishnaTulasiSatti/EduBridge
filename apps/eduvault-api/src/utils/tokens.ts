import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { VaultRole } from '@eduvault/shared';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: VaultRole;
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'eduvault',
    audience: 'eduvault-web',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'eduvault', audience: 'eduvault-web' }) as AccessTokenPayload;
}

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time string comparison via hashes (also hides length differences). */
export function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(Buffer.from(hashToken(a), 'hex'), Buffer.from(hashToken(b), 'hex'));
}

// No 0/O/1/I/L so codes are easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Human-friendly random code, e.g. `K7QMX4TZRA` (10 chars ≈ 49 bits). */
export function humanCode(length = 10) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
