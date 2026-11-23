import type { Request } from 'express';
import { Types } from 'mongoose';
import type {
  AccessRequestInput,
  AccessRequestResponse,
  ConsentRequestDTO,
  ConsentStatus,
  MarksheetPayload,
  MarksheetStatus,
  RedeemResponse,
} from '@eduvault/shared';
import { webOrigin } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { hashToken, humanCode, randomToken } from '../../utils/tokens';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { Institution } from '../institutions/institution.model';
import { Marksheet, StudentRecord } from '../records/models';
import { myMarksheets, readPdf } from '../records/records.service';
import { AccessRequest, type AccessRequestDoc } from './accessRequest.model';
import { publicPartner, type Partner } from './partners';
import type { EnrolmentCheckInput, EnrolmentCheckResponse, InstitutionStatus } from '@eduvault/shared';

export const REQUEST_TTL_MINUTES = 30;
export const SHARE_CODE_TTL_MINUTES = 10;

function withParams(uri: string, params: Record<string, string>) {
  const url = new URL(uri);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function toConsentDTO(r: AccessRequestDoc): Promise<ConsentRequestDTO> {
  let marksheet: ConsentRequestDTO['marksheet'];
  if (r.marksheet) {
    const m = await Marksheet.findById(r.marksheet);
    const inst = m ? await Institution.findById(m.institution).select('name') : null;
    if (m) marksheet = { id: m.id, documentId: m.documentId ?? undefined, semester: m.semester, academicYear: m.academicYear, institutionName: inst?.name ?? '' };
  }
  return {
    id: r.requestId,
    status: r.status as ConsentStatus,
    partner: publicPartner(r.partnerId),
    documentType: 'MARKSHEET',
    purpose: r.purpose,
    reference: r.reference ?? undefined,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString(),
    redeemedAt: r.redeemedAt?.toISOString(),
    consentReference: r.consentReference ?? undefined,
    marksheet,
  };
}

/** Marks a request expired if its time has passed. Returns the up-to-date document. */
async function refreshExpiry(r: AccessRequestDoc) {
  const now = new Date();
  const expired =
    (r.status === 'PENDING' && r.expiresAt < now) || (r.status === 'APPROVED' && r.shareCodeExpiresAt && r.shareCodeExpiresAt < now);
  if (expired) {
    r.status = 'EXPIRED';
    r.set('shareCodeHash', undefined);
    await r.save();
  }
  return r;
}

/* ------------------------------------------------------------ Partner */

export async function createAccessRequest(partner: Partner, input: AccessRequestInput, req: Request): Promise<AccessRequestResponse> {
  // Only registered redirect URIs: prevents a stolen secret from sending students to an attacker's site.
  if (!partner.redirectUris.includes(input.redirectUri)) {
    throw AppError.badRequest('redirectUri is not registered for this partner');
  }
  const r = await AccessRequest.create({
    requestId: randomToken(24),
    partnerId: partner.id,
    documentType: input.documentType,
    purpose: input.purpose,
    reference: input.reference,
    redirectUri: input.redirectUri,
    state: input.state,
    expiresAt: new Date(Date.now() + REQUEST_TTL_MINUTES * 60 * 1000),
  });
  await audit({ actorRole: 'PARTNER', action: AUDIT_ACTIONS.ACCESS_REQUESTED, resourceType: 'AccessRequest', resourceId: r.id, metadata: { partner: partner.id, documentType: r.documentType, reference: r.reference }, req });
  return { requestId: r.requestId, consentUrl: `${webOrigin}/consent/${r.requestId}`, expiresAt: r.expiresAt.toISOString() };
}

/**
 * Exchanges a one-time sharing reference for the signed document.
 * The reference works once, only for the partner it was issued to, and only for a few minutes.
 */
export async function redeem(partner: Partner, code: string, req: Request): Promise<RedeemResponse> {
  const now = new Date();
  const r = await AccessRequest.findOneAndUpdate(
    { shareCodeHash: hashToken(code), partnerId: partner.id, status: 'APPROVED', shareCodeExpiresAt: { $gt: now } },
    { $set: { status: 'REDEEMED', redeemedAt: now }, $unset: { shareCodeHash: 1 } },
    { new: true },
  );
  if (!r) {
    await audit({ actorRole: 'PARTNER', action: AUDIT_ACTIONS.SHARE_REDEEM_FAILED, resourceType: 'AccessRequest', metadata: { partner: partner.id }, req });
    throw new AppError(400, 'INVALID_GRANT', 'The sharing reference is invalid, has expired or has already been used');
  }

  const m = await Marksheet.findById(r.marksheet);
  if (!m || !m.payload) throw AppError.notFound('The shared document no longer exists');
  const pdf = await readPdf(m);

  await audit({ actorId: String(r.student), actorRole: 'PARTNER', action: AUDIT_ACTIONS.DOCUMENT_SHARED, resourceType: 'Marksheet', resourceId: m.id, metadata: { partner: partner.id, consentReference: r.consentReference, documentId: m.documentId }, req });
  return {
    consentReference: r.consentReference!,
    sharedAt: now.toISOString(),
    document: {
      type: 'MARKSHEET',
      status: m.status as MarksheetStatus,
      payload: m.payload as MarksheetPayload,
      signature: { algorithm: 'Ed25519', hashAlgorithm: 'SHA-256', documentHash: m.documentHash!, signature: m.signature!, keyId: m.keyId!, keyFingerprint: m.keyFingerprint! },
      fileBase64: pdf.toString('base64'),
    },
  };
}

/* ------------------------------------------------------------ Student */

async function loadForStudent(userId: string, requestId: string) {
  const r = await AccessRequest.findOne({ requestId });
  // Once decided, a request belongs to the student who decided it.
  if (!r || (r.student && String(r.student) !== userId)) throw AppError.notFound('This request does not exist or has been withdrawn');
  return refreshExpiry(r);
}

export async function getForStudent(userId: string, requestId: string) {
  const r = await loadForStudent(userId, requestId);
  const marksheets = r.status === 'PENDING' ? (await myMarksheets(userId)).filter((m) => m.status === 'ISSUED') : [];
  return { request: await toConsentDTO(r), marksheets, returnUrl: r.status === 'PENDING' ? undefined : withParams(r.redirectUri, { error: 'request_closed', state: r.state }) };
}

export async function approve(userId: string, requestId: string, marksheetId: string, req: Request) {
  const r = await loadForStudent(userId, requestId);
  if (r.status !== 'PENDING') throw AppError.conflict('This request has already been answered or has expired');

  if (!Types.ObjectId.isValid(marksheetId)) throw AppError.badRequest('Select a marksheet to share');
  const m = await Marksheet.findOne({ _id: marksheetId, status: 'ISSUED' });
  const record = m ? await StudentRecord.findById(m.studentRecord).select('account') : null;
  if (!m || String(record?.account) !== userId) throw AppError.badRequest('Select one of your issued marksheets');

  const code = randomToken(32);
  const now = new Date();
  const updated = await AccessRequest.findOneAndUpdate(
    { _id: r._id, status: 'PENDING' },
    {
      $set: {
        status: 'APPROVED',
        student: userId,
        marksheet: m._id,
        decidedAt: now,
        consentReference: `CNS-${now.getFullYear()}-${humanCode(8)}`,
        shareCodeHash: hashToken(code),
        shareCodeExpiresAt: new Date(now.getTime() + SHARE_CODE_TTL_MINUTES * 60 * 1000),
      },
    },
    { new: true },
  );
  if (!updated) throw AppError.conflict('This request has already been answered');

  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.CONSENT_GRANTED, resourceType: 'AccessRequest', resourceId: updated.id, metadata: { partner: updated.partnerId, documentId: m.documentId, consentReference: updated.consentReference }, req });
  return { redirectUrl: withParams(updated.redirectUri, { code, state: updated.state }) };
}

export async function deny(userId: string, requestId: string, req: Request) {
  const r = await loadForStudent(userId, requestId);
  if (r.status !== 'PENDING') throw AppError.conflict('This request has already been answered or has expired');
  const updated = await AccessRequest.findOneAndUpdate(
    { _id: r._id, status: 'PENDING' },
    { $set: { status: 'DENIED', student: userId, decidedAt: new Date() } },
    { new: true },
  );
  if (!updated) throw AppError.conflict('This request has already been answered');
  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.CONSENT_DENIED, resourceType: 'AccessRequest', resourceId: updated.id, metadata: { partner: updated.partnerId }, req });
  return { redirectUrl: withParams(updated.redirectUri, { error: 'access_denied', state: updated.state }) };
}

export async function myConsents(userId: string) {
  const list = await AccessRequest.find({ student: userId }).sort({ createdAt: -1 }).limit(100);
  return Promise.all(list.map(async (r) => toConsentDTO(await refreshExpiry(r))));
}

/* ------------------------------------------------------ Enrolment check */

/**
 * Confirms whether an institution has enrolled a student with this exact roll number.
 * Partners use it to verify a college ID; students agreed to this check when applying to the partner.
 * Only an exact roll number is accepted (no searching), and every check is audited.
 */
export async function checkEnrolment(partner: Partner, input: EnrolmentCheckInput, req: Request): Promise<EnrolmentCheckResponse> {
  const inst = Types.ObjectId.isValid(input.institutionId) ? await Institution.findById(input.institutionId) : null;
  if (!inst || inst.status === 'PENDING' || inst.status === 'REJECTED') {
    throw new AppError(404, 'INSTITUTION_NOT_FOUND', 'Institution not found in the EduVault registry');
  }
  const rollNumber = input.rollNumber.toUpperCase();
  const record = await StudentRecord.findOne({ institution: inst._id, rollNumber });
  await audit({
    actorRole: 'PARTNER',
    action: AUDIT_ACTIONS.ENROLMENT_CHECKED,
    resourceType: 'StudentRecord',
    resourceId: record?.id,
    metadata: { partner: partner.id, institution: inst.id, rollNumber, enrolled: !!record },
    req,
  });
  return {
    institution: { institutionId: inst.id, name: inst.name, university: inst.university, code: inst.code, status: inst.status as InstitutionStatus },
    enrolled: !!record,
    student: record ? { fullName: record.fullName, rollNumber: record.rollNumber, programme: record.programme, admissionYear: record.admissionYear } : undefined,
    checkedAt: new Date().toISOString(),
  };
}
