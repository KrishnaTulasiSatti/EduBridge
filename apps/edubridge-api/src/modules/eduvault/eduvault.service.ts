import crypto from 'node:crypto';
import type { Request } from 'express';
import { Schema, model } from 'mongoose';
import type { IssuerRegistryEntry, RedeemResponse } from '@eduvault/shared';
import type { DocumentStatus } from '@edubridge/shared';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { hashToken } from '../../utils/tokens';
import { StudentDocument, StudentProfile } from '../applications/models';
import { requireDraft, toApplicationDTO } from '../applications/applications.service';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { User } from '../auth/user.model';
import { sha256, sniffMimeType, storage } from '../storage/storage';
import { VaultError, vaultClient } from './vaultClient';
import { assessMarksheet } from './verify';

/* ------------------------------------------------------------- Model */

/** Tracks an EduVault request started by a student, so the callback can be tied back to them. */
const vaultRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    requestId: { type: String, required: true },
    /** Only a hash of the anti-forgery `state` value is stored. */
    stateHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'DECLINED', 'FAILED'], default: 'PENDING' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
vaultRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
export const VaultRequest = model('VaultRequest', vaultRequestSchema);

export const callbackUrl = () => `${env.CLIENT_ORIGIN.split(',')[0].trim()}/dashboard/eduvault/callback`;

const fromVault = (err: unknown) => (err instanceof VaultError ? AppError.badRequest(err.message) : err);

/* ----------------------------------------------------------- Start */

export async function startImport(userId: string, req: Request) {
  const app = await requireDraft(userId);
  const profile = await StudentProfile.findOne({ user: userId });
  if (!profile?.education?.rollNumber || !profile.education.institutionName) {
    throw AppError.badRequest('Fill in your institution and roll number in the Education step first. They are compared with the marksheet.');
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const res = await vaultClient
    .createAccessRequest({
      documentType: 'MARKSHEET',
      purpose: `To verify your latest marksheet for EduBridge sponsorship application ${app.applicationNumber}.`,
      reference: app.applicationNumber,
      redirectUri: callbackUrl(),
      state,
    })
    .catch((e) => {
      throw fromVault(e);
    });

  await VaultRequest.create({
    user: userId,
    application: app._id,
    requestId: res.requestId,
    stateHash: hashToken(state),
    expiresAt: new Date(res.expiresAt),
  });
  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.EDUVAULT_REQUESTED, resourceType: 'Application', resourceId: app.id, req });
  return { consentUrl: res.consentUrl };
}

/* -------------------------------------------------------- Complete */

export async function completeImport(userId: string, input: { state: string; code?: string; error?: string }, req: Request) {
  // Claim the pending request atomically: each callback can complete at most once.
  const pending = await VaultRequest.findOneAndUpdate(
    { stateHash: hashToken(input.state), user: userId, status: 'PENDING', expiresAt: { $gt: new Date() } },
    { $set: { status: 'FAILED' } },
    { new: true },
  );
  if (!pending) throw AppError.badRequest('This EduVault request has expired or was already completed. Please start the import again.');

  if (input.error || !input.code) {
    pending.status = 'DECLINED';
    await pending.save();
    await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.EDUVAULT_DECLINED, resourceType: 'Application', resourceId: String(pending.application), metadata: { reason: input.error ?? 'no_code' }, req });
    return { outcome: 'DECLINED' as const, application: await toApplicationDTO(await requireDraft(userId)) };
  }

  const app = await requireDraft(userId);
  if (String(app._id) !== String(pending.application)) throw AppError.conflict('This request belongs to a different application');

  // Server-to-server: exchange the one-time reference for the signed marksheet.
  const shared: RedeemResponse = await vaultClient.redeem(input.code).catch((e) => {
    throw fromVault(e);
  });
  if (shared.document?.type !== 'MARKSHEET' || shared.document.payload?.schema !== 'eduvault.marksheet/v2') {
    throw AppError.badRequest('EduVault returned an unexpected document');
  }

  // Fetch the issuer's public key from the registry, independently of the document.
  let issuer: IssuerRegistryEntry | null = null;
  let registryUnavailable = false;
  try {
    issuer = await vaultClient.getIssuer(shared.document.payload.issuer.institutionId);
  } catch (e) {
    if (e instanceof VaultError && e.status === 404) issuer = null;
    else registryUnavailable = true;
  }

  const [user, profile] = await Promise.all([User.findById(userId).select('fullName'), StudentProfile.findOne({ user: userId })]);
  const assessed = assessMarksheet(shared, issuer, {
    fullName: user!.fullName,
    rollNumber: profile?.education?.rollNumber ?? undefined,
    institutionName: profile?.education?.institutionName ?? undefined,
    university: profile?.education?.university ?? undefined,
  });
  let status: DocumentStatus = assessed.status;
  if (registryUnavailable) {
    status = 'SERVICE_UNAVAILABLE';
    assessed.verification.summary = 'The marksheet was received, but the EduVault issuer registry could not be reached to check its signature. Please import it again later.';
  }

  // Store the signed PDF itself; the signature details are kept with the document's verification record.
  const file = Buffer.from(shared.document.fileBase64 ?? '', 'base64');
  if (sniffMimeType(file) !== 'application/pdf') throw AppError.badRequest('EduVault did not send a valid PDF');
  const key = await storage.put(file);
  const previous = await StudentDocument.findOne({ application: app._id, type: 'MARKSHEET' }).select('+storageKey');
  const doc = await StudentDocument.findOneAndUpdate(
    { application: app._id, type: 'MARKSHEET' },
    {
      $set: {
        owner: userId,
        status,
        source: 'EDUVAULT',
        storageKey: key,
        originalName: `${shared.document.payload.documentId}.pdf`,
        mimeType: 'application/pdf',
        size: file.length,
        sha256: sha256(file),
        rollNumber: shared.document.payload.student.rollNumber,
        verification: assessed.verification,
      },
      $unset: { certificateNumber: 1 },
    },
    { upsert: true, new: true },
  );
  if (previous?.storageKey) await storage.remove(previous.storageKey).catch(() => undefined);
  if (previous) await StudentDocument.updateOne({ _id: doc!._id }, { $set: { createdAt: new Date() } }, { timestamps: false });

  pending.status = 'COMPLETED';
  await pending.save();

  await audit({
    actorId: userId,
    actorRole: 'STUDENT',
    action: AUDIT_ACTIONS.EDUVAULT_IMPORTED,
    resourceType: 'StudentDocument',
    resourceId: doc!.id,
    metadata: {
      documentId: shared.document.payload.documentId,
      issuer: shared.document.payload.issuer.name,
      consentReference: shared.consentReference,
      signatureValid: assessed.verification.signatureValid,
      status,
    },
    req,
  });
  return { outcome: status, application: await toApplicationDTO(app) };
}
