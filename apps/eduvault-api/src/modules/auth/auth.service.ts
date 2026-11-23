import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Request } from 'express';
import type { InstitutionStatus, IssuerRegisterInput, LoginInput, StudentRegisterInput, VaultUser } from '@eduvault/shared';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { hashToken, randomToken, signAccessToken } from '../../utils/tokens';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { Institution } from '../institutions/institution.model';
import { StudentRecord } from '../records/models';
import { RefreshToken } from './refreshToken.model';
import { User, type UserDoc } from './user.model';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

let dummyHash: string | undefined;
async function getDummyHash() {
  dummyHash ??= await argon2.hash('dummy-password-for-timing', ARGON_OPTS);
  return dummyHash;
}

export const hashPassword = (password: string) => argon2.hash(password, ARGON_OPTS);
const sessionExpired = () => AppError.unauthorized('Session expired, please sign in again');

export async function toVaultUser(u: UserDoc): Promise<VaultUser> {
  const inst = u.institution ? await Institution.findById(u.institution).select('name status') : null;
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    status: u.status,
    designation: u.designation ?? undefined,
    institution: inst ? { id: inst.id, name: inst.name, status: inst.status as InstitutionStatus } : undefined,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString(),
  };
}

async function issueTokens(user: UserDoc, req: Request, family: string = crypto.randomUUID()) {
  const refreshToken = randomToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });
  return { accessToken: signAccessToken({ sub: user.id, role: user.role }), refreshToken };
}

async function assertEmailFree(email: string) {
  if (await User.exists({ email })) throw AppError.conflict('An account with this email already exists');
}

/* ------------------------------------------------------------ Students */

const invalidCode = () =>
  AppError.badRequest('This activation code is not valid or has already been used. Ask your institution for a new one.', {
    activationCode: ['Code not recognised'],
  });

/** Students register with the one-time activation code their institution gave them. */
export async function registerStudent(input: StudentRegisterInput & { activationCode: string }, req: Request) {
  await assertEmailFree(input.email);
  const codeHash = hashToken(input.activationCode);
  if (!(await StudentRecord.exists({ activationCodeHash: codeHash, account: null }))) throw invalidCode();

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: 'STUDENT',
    status: 'ACTIVE',
    termsAcceptedAt: new Date(),
  });

  // Claim the code atomically so it can only ever be used once.
  const record = await StudentRecord.findOneAndUpdate(
    { activationCodeHash: codeHash, account: null },
    { $set: { account: user._id, linkedAt: new Date() }, $unset: { activationCodeHash: 1 } },
    { new: true },
  );
  if (!record) {
    await user.deleteOne();
    throw invalidCode();
  }

  await audit({ actorId: user.id, actorRole: 'STUDENT', action: AUDIT_ACTIONS.USER_REGISTERED, resourceType: 'User', resourceId: user.id, metadata: { role: 'STUDENT' }, req });
  await audit({ actorId: user.id, actorRole: 'STUDENT', action: AUDIT_ACTIONS.ENROLMENT_LINKED, resourceType: 'StudentRecord', resourceId: record.id, metadata: { institution: String(record.institution), rollNumber: record.rollNumber }, req });
  return { user, tokens: await issueTokens(user, req) };
}

/* ------------------------------------------------------------- Issuers */

/** An institution registers as an issuer. Nothing can be issued until an EduVault admin approves it. */
export async function registerIssuer(input: IssuerRegisterInput & { institution: { code: string; website?: string } }, req: Request) {
  await assertEmailFree(input.email);
  if (await Institution.exists({ code: input.institution.code })) {
    throw AppError.badRequest('An institution with this code is already registered', { 'institution.code': ['Already registered'] });
  }

  const institution = await Institution.create({ ...input.institution, status: 'PENDING' });
  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: 'ISSUER',
    status: 'PENDING_APPROVAL',
    institution: institution._id,
    designation: input.designation,
    termsAcceptedAt: new Date(),
  });
  institution.contact = user._id;
  await institution.save();

  await audit({ actorId: user.id, actorRole: 'ISSUER', action: AUDIT_ACTIONS.INSTITUTION_REGISTERED, resourceType: 'Institution', resourceId: institution.id, metadata: { name: institution.name, code: institution.code }, req });
  return { user };
}

/* --------------------------------------------------------------- Login */

export async function login(input: LoginInput, req: Request) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash +failedLoginAttempts +lockedUntil');

  if (!user) {
    await argon2.verify(await getDummyHash(), input.password);
    await audit({ action: AUDIT_ACTIONS.LOGIN_FAILED, resourceType: 'User', metadata: { email: input.email, reason: 'UNKNOWN_EMAIL' }, req });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${mins} minute(s).`);
  }

  if (!(await argon2.verify(user.passwordHash, input.password))) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const locked = user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
    if (locked) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit({ actorId: user.id, actorRole: user.role, action: locked ? AUDIT_ACTIONS.ACCOUNT_LOCKED : AUDIT_ACTIONS.LOGIN_FAILED, resourceType: 'User', resourceId: user.id, metadata: { reason: 'WRONG_PASSWORD' }, req });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (user.status === 'PENDING_APPROVAL') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Your institution is awaiting approval by an EduVault administrator.');
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact EduVault support.');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  await audit({ actorId: user.id, actorRole: user.role, action: AUDIT_ACTIONS.LOGIN_SUCCESS, resourceType: 'User', resourceId: user.id, req });
  return { user, tokens: await issueTokens(user, req) };
}

export async function refresh(rawToken: string | undefined, req: Request) {
  if (!rawToken) throw AppError.unauthorized('No active session');
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw sessionExpired();

  if (stored.usedAt) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
    await audit({ actorId: String(stored.user), action: AUDIT_ACTIONS.REFRESH_TOKEN_REUSE, resourceType: 'Session', resourceId: stored.family, req });
    throw sessionExpired();
  }

  const user = await User.findById(stored.user);
  if (!user || user.status !== 'ACTIVE') throw sessionExpired();

  const claimed = await RefreshToken.findOneAndUpdate({ _id: stored._id, usedAt: null }, { usedAt: new Date() });
  if (!claimed) throw sessionExpired();

  return { user, tokens: await issueTokens(user, req, stored.family) };
}

export async function logout(rawToken: string | undefined, req: Request) {
  if (!rawToken) return;
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored) return;
  await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
  await audit({ actorId: String(stored.user), action: AUDIT_ACTIONS.LOGOUT, resourceType: 'Session', resourceId: stored.family, req });
}

/** Ends every session of a user, e.g. when an account or institution is suspended. */
export async function revokeAllSessions(userIds: string[]) {
  await RefreshToken.updateMany({ user: { $in: userIds }, revokedAt: null }, { revokedAt: new Date() });
}
