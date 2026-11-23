import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Request } from 'express';
import type { LoginInput, RegisterInput } from '@edubridge/shared';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { RefreshToken } from './refreshToken.model';
import { User, type UserDoc } from './user.model';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// Used to keep login timing similar whether or not the email exists.
let dummyHash: string | undefined;
async function getDummyHash() {
  dummyHash ??= await argon2.hash('dummy-password-for-timing', ARGON_OPTS);
  return dummyHash;
}

export const hashPassword = (password: string) => argon2.hash(password, ARGON_OPTS);

const sessionExpired = () => AppError.unauthorized('Session expired, please sign in again');

async function issueTokens(user: UserDoc, req: Request, family: string = crypto.randomUUID()) {
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  return { accessToken, refreshToken };
}

type ParsedRegister = Omit<RegisterInput, 'phone'> & { phone?: string };

export async function register(input: ParsedRegister, req: Request) {
  const exists = await User.exists({ email: input.email });
  if (exists) throw AppError.conflict('An account with this email already exists');

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    // Volunteers handle sensitive documents, so an admin must activate them first.
    status: input.role === 'VOLUNTEER' ? 'PENDING_APPROVAL' : 'ACTIVE',
    consentAcceptedAt: new Date(),
  });

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    resourceType: 'User',
    resourceId: user.id,
    metadata: { role: user.role },
    req,
  });

  if (user.status !== 'ACTIVE') return { user, tokens: null };
  return { user, tokens: await issueTokens(user, req) };
}

export async function login(input: LoginInput, req: Request) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash +failedLoginAttempts +lockedUntil');

  if (!user) {
    await argon2.verify(await getDummyHash(), input.password);
    await audit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      resourceType: 'User',
      metadata: { email: input.email, reason: 'UNKNOWN_EMAIL' },
      req,
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${mins} minute(s).`);
  }

  const ok = await argon2.verify(user.passwordHash, input.password);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const locked = user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
    if (locked) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit({
      actorId: user.id,
      actorRole: user.role,
      action: locked ? AUDIT_ACTIONS.ACCOUNT_LOCKED : AUDIT_ACTIONS.LOGIN_FAILED,
      resourceType: 'User',
      resourceId: user.id,
      metadata: { reason: 'WRONG_PASSWORD' },
      req,
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (user.status === 'PENDING_APPROVAL') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Your volunteer account is awaiting administrator approval.');
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    resourceType: 'User',
    resourceId: user.id,
    req,
  });
  return { user, tokens: await issueTokens(user, req) };
}

export async function refresh(rawToken: string | undefined, req: Request) {
  if (!rawToken) throw AppError.unauthorized('No active session');
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw sessionExpired();

  // Reuse of an already-rotated token means it was likely stolen: revoke the whole session family.
  if (stored.usedAt) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
    await audit({
      actorId: String(stored.user),
      action: AUDIT_ACTIONS.REFRESH_TOKEN_REUSE,
      resourceType: 'Session',
      resourceId: stored.family,
      req,
    });
    throw sessionExpired();
  }

  const user = await User.findById(stored.user);
  if (!user || user.status !== 'ACTIVE') throw sessionExpired();

  // Claim the token atomically so two parallel refresh calls cannot both succeed.
  const claimed = await RefreshToken.findOneAndUpdate({ _id: stored._id, usedAt: null }, { usedAt: new Date() });
  if (!claimed) throw sessionExpired();

  return { user, tokens: await issueTokens(user, req, stored.family) };
}

export async function logout(rawToken: string | undefined, req: Request) {
  if (!rawToken) return;
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored) return;
  await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
  await audit({
    actorId: String(stored.user),
    action: AUDIT_ACTIONS.LOGOUT,
    resourceType: 'Session',
    resourceId: stored.family,
    req,
  });
}
