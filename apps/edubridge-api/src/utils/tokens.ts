import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@edubridge/shared';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: 'edubridge',
    audience: 'edubridge-web',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'edubridge',
    audience: 'edubridge-web',
    algorithms: ['HS256'],
  }) as AccessTokenPayload;
}

/** Opaque refresh token: random bytes given to the client, only its SHA-256 hash is stored. */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
