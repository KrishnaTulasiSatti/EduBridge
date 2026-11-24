import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import {
  normalizePersonName,
  type SponsorPanConfirmResponse,
  type SponsorPanStartResponse,
} from '@edubridge/shared';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { blindIndex, decryptField, encryptField } from '../../utils/fieldCrypto';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { panClient } from './panClient';
import { User } from './user.model';

/**
 * Sponsor PAN check before sign-up:
 *   1. start:   the PAN registry matches PAN + name + date of birth and emails an OTP to the holder.
 *   2. confirm: the OTP is checked; EduBridge returns a short-lived signed "PAN token".
 *   3. register: a sponsor account can only be created with a valid PAN token, one account per PAN.
 */

const PAN_TOKEN_AUDIENCE = 'edubridge-sponsor-pan';
const PAN_TOKEN_TTL = '30m';

export const maskPan = (pan: string) => `${'X'.repeat(6)}${pan.slice(6)}`;

interface PanTokenPayload {
  /** The PAN, encrypted (the token is visible to the browser). */
  panEnc: string;
  fullName: string;
  holderType: string;
  reference: string;
  verifiedAt: string;
}

const START_ERRORS: Record<string, string> = {
  INVALID_FORMAT: 'This PAN is not in a valid format.',
  NOT_FOUND: 'No PAN record was found with this number. Check the PAN and try again.',
  INACTIVE: 'This PAN is not active. Please use an active PAN.',
  NAME_MISMATCH: 'The name does not match the name on this PAN. Enter it exactly as printed on your PAN card.',
  DOB_MISMATCH: 'The date of birth does not match the PAN record.',
};

const START_FIELDS: Record<string, string> = {
  INVALID_FORMAT: 'pan',
  NOT_FOUND: 'pan',
  INACTIVE: 'pan',
  NAME_MISMATCH: 'fullName',
  DOB_MISMATCH: 'dateOfBirth',
};

const CONFIRM_ERRORS: Record<string, string> = {
  EXPIRED: 'This code has expired. Please request a new one.',
  TOO_MANY_ATTEMPTS: 'Too many wrong codes. Please request a new one.',
  ALREADY_USED: 'This code was already used. Please request a new one.',
  INACTIVE: 'This PAN is not active. Please use an active PAN.',
};

async function panAlreadyUsed(pan: string) {
  return User.exists({ 'panVerification.panHash': blindIndex(pan) });
}

export async function startSponsorPan(input: { pan: string; fullName: string; dateOfBirth: string }, req: Request): Promise<SponsorPanStartResponse> {
  if (await panAlreadyUsed(input.pan)) {
    throw AppError.conflict('This PAN is already linked to an EduBridge sponsor account. Sign in instead.');
  }

  const res = await panClient.verify({ pan: input.pan, name: input.fullName, dateOfBirth: input.dateOfBirth });

  await audit({
    action: res.result === 'OTP_SENT' ? AUDIT_ACTIONS.SPONSOR_PAN_OTP_SENT : AUDIT_ACTIONS.SPONSOR_PAN_CHECK_FAILED,
    resourceType: 'PanVerification',
    resourceId: res.result === 'OTP_SENT' ? res.reference : undefined,
    metadata: { maskedPan: maskPan(input.pan), result: res.result },
    req,
  });

  if (res.result !== 'OTP_SENT') {
    const message = START_ERRORS[res.result] ?? 'The PAN could not be verified.';
    throw new AppError(422, `PAN_${res.result}`, message, { [START_FIELDS[res.result] ?? 'pan']: [message] });
  }
  return { reference: res.reference, otpSentTo: res.otpSentTo, expiresAt: res.expiresAt };
}

export async function confirmSponsorPan(input: { reference: string; otp: string }, req: Request): Promise<SponsorPanConfirmResponse> {
  const res = await panClient.confirm(input.reference, input.otp);

  if (res.result === 'INVALID_OTP') {
    const message = `The code is not correct. ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'try' : 'tries'} left.`;
    throw new AppError(422, 'PAN_INVALID_OTP', message, { otp: [message] });
  }
  if (res.result !== 'VERIFIED') {
    await audit({
      action: AUDIT_ACTIONS.SPONSOR_PAN_CHECK_FAILED,
      resourceType: 'PanVerification',
      resourceId: input.reference,
      metadata: { result: res.result },
      req,
    });
    throw new AppError(422, `PAN_${res.result}`, CONFIRM_ERRORS[res.result] ?? 'The PAN could not be verified.');
  }

  await audit({
    action: AUDIT_ACTIONS.SPONSOR_PAN_VERIFIED,
    resourceType: 'PanVerification',
    resourceId: res.reference,
    metadata: { maskedPan: maskPan(res.pan), holderType: res.holderType },
    req,
  });

  const payload: PanTokenPayload = {
    panEnc: encryptField(res.pan),
    fullName: res.fullName,
    holderType: res.holderType,
    reference: res.reference,
    verifiedAt: res.verifiedAt,
  };
  const panToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'edubridge',
    audience: PAN_TOKEN_AUDIENCE,
    expiresIn: PAN_TOKEN_TTL,
  });
  return { panToken, maskedPan: maskPan(res.pan), fullName: res.fullName };
}

/** Checks a PAN token at sign-up and returns what to store on the sponsor's account. */
export async function readPanToken(token: string | undefined, fullName: string) {
  if (!token) {
    const message = 'Verify your PAN before creating a sponsor account.';
    throw new AppError(400, 'PAN_VERIFICATION_REQUIRED', message, { panToken: [message] });
  }
  let payload: PanTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'edubridge',
      audience: PAN_TOKEN_AUDIENCE,
    }) as PanTokenPayload;
  } catch {
    const message = 'Your PAN verification has expired. Please verify your PAN again.';
    throw new AppError(400, 'PAN_VERIFICATION_EXPIRED', message, { panToken: [message] });
  }
  if (normalizePersonName(fullName) !== normalizePersonName(payload.fullName)) {
    const message = 'Your name must match the name on your PAN card.';
    throw new AppError(400, 'PAN_NAME_MISMATCH', message, { fullName: [message] });
  }

  const pan = decryptField(payload.panEnc);
  if (await panAlreadyUsed(pan)) {
    throw AppError.conflict('This PAN is already linked to an EduBridge sponsor account. Sign in instead.');
  }
  return {
    panEncrypted: encryptField(pan),
    panHash: blindIndex(pan),
    maskedPan: maskPan(pan),
    holderType: payload.holderType,
    registryReference: payload.reference,
    verifiedAt: new Date(payload.verifiedAt),
  };
}

/** For tests: a PAN token as if the registry had verified this PAN. */
export function issuePanTokenForTests(pan: string, fullName: string) {
  if (env.NODE_ENV !== 'test') throw new Error('Only available in tests');
  const payload: PanTokenPayload = {
    panEnc: encryptField(pan),
    fullName,
    holderType: 'Individual',
    reference: `TEST-${pan}`,
    verifiedAt: new Date().toISOString(),
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'edubridge', audience: PAN_TOKEN_AUDIENCE, expiresIn: PAN_TOKEN_TTL });
}
