import type { Request } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import {
  aadhaarError,
  currentAcademicYear,
  normalizeAadhaar,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  educationBase,
  educationSchema,
  familyBase,
  familySchema,
  personalBase,
  personalSchema,
  supportBase,
  supportSchema,
  type ApplicationDTO,
  type ApplicationStatus,
  type ApplicationSummaryDTO,
  type DocumentDTO,
  type DocumentReviewDTO,
  type EnrolmentCheckDTO,
  type DocumentType,
  type StudentProfileDTO,
} from '@edubridge/shared';
import { AppError } from '../../utils/AppError';
import { encryptField } from '../../utils/fieldCrypto';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { sha256, sniffMimeType, storage } from '../storage/storage';
import {
  Application,
  StudentDocument,
  StudentProfile,
  nextApplicationNumber,
  type ApplicationDoc,
  type StudentDocumentDoc,
} from './models';

/* ------------------------------------------------------------ Helpers */

type Plain = Record<string, unknown>;

/**
 * Lenient merge used for autosave: keeps every field that is individually valid, drops invalid
 * ones, and treats null / '' as "clear this field". Full validation happens on submit.
 */
function mergeValid(base: z.ZodObject, current: Plain, incoming: unknown): { merged: Plain; rejected: string[] } {
  const merged: Plain = { ...current };
  const rejected: string[] = [];
  if (!incoming || typeof incoming !== 'object') return { merged, rejected };

  for (const [key, value] of Object.entries(incoming as Plain)) {
    const field = base.shape[key] as z.ZodType | undefined;
    if (!field) continue;
    if (value === null || value === '' || (typeof value === 'number' && Number.isNaN(value))) {
      delete merged[key];
      continue;
    }
    if (field instanceof z.ZodObject) {
      const nested = mergeValid(field, (current[key] as Plain) ?? {}, value);
      merged[key] = nested.merged;
      rejected.push(...nested.rejected.map((r) => `${key}.${r}`));
      continue;
    }
    const res = field.safeParse(value);
    if (res.success) merged[key] = res.data;
    else rejected.push(key);
  }
  return { merged, rejected };
}

const plain = (v: unknown): Plain => {
  if (!v) return {};
  const obj = typeof (v as { toObject?: () => unknown }).toObject === 'function' ? (v as { toObject: () => Plain }).toObject() : (v as Plain);
  return JSON.parse(JSON.stringify(obj));
};

function issuesToMessages(error: z.ZodError) {
  return error.issues.map((i) => i.message);
}

/** `forReviewer` adds the manual check details (reviewer notes are not shown to the student). */
export function toDocumentDTO(d: StudentDocumentDoc, forReviewer = false): DocumentDTO {
  return {
    id: d.id,
    type: d.type as DocumentType,
    status: d.status,
    source: (d.source ?? 'UPLOAD') as DocumentDTO['source'],
    originalName: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    sha256: d.sha256,
    certificateNumber: d.certificateNumber ?? undefined,
    rollNumber: d.rollNumber ?? undefined,
    aadhaarLast4: d.aadhaarLast4 ?? undefined,
    uploadedAt: d.createdAt.toISOString(),
    verification: d.source === 'EDUVAULT' && d.verification ? (d.verification as DocumentDTO['verification']) : undefined,
    review: forReviewer && d.review ? (d.review as DocumentReviewDTO) : undefined,
    enrolmentCheck: forReviewer && d.enrolmentCheck ? (d.enrolmentCheck as EnrolmentCheckDTO) : undefined,
  };
}

export async function toApplicationDTO(app: ApplicationDoc, forReviewer = false): Promise<ApplicationDTO> {
  const docs = await StudentDocument.find({ application: app._id }).sort({ createdAt: 1 });
  return {
    id: app.id,
    applicationNumber: app.applicationNumber,
    academicYear: app.academicYear,
    status: app.status,
    family: plain(app.family),
    support: plain(app.support),
    documents: docs.map((d) => toDocumentDTO(d, forReviewer)),
    history: app.history.map((h) => ({ status: h.status as ApplicationStatus, at: h.at.toISOString(), note: h.note ?? undefined })),
    submittedAt: app.submittedAt?.toISOString(),
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    profileSnapshot: app.profileSnapshot ? (plain(app.profileSnapshot) as unknown as StudentProfileDTO) : undefined,
    outcome: app.decision
      ? {
          decision: app.decision.decision,
          approvedAmount: app.decision.approvedAmount ?? undefined,
          message: app.decision.messageToStudent ?? undefined,
          decidedAt: app.decision.at.toISOString(),
        }
      : undefined,
  };
}

/* ------------------------------------------------------------ Profile */

export async function getProfile(userId: string): Promise<StudentProfileDTO> {
  const p = await StudentProfile.findOne({ user: userId });
  return { personal: plain(p?.personal), education: plain(p?.education), updatedAt: p?.updatedAt?.toISOString() };
}

export async function updateProfile(userId: string, body: { personal?: unknown; education?: unknown }) {
  const profile = (await StudentProfile.findOne({ user: userId })) ?? new StudentProfile({ user: userId });
  const rejected: string[] = [];
  if (body.personal !== undefined) {
    const r = mergeValid(personalBase, plain(profile.personal), body.personal);
    profile.set('personal', r.merged);
    rejected.push(...r.rejected.map((k) => `personal.${k}`));
  }
  if (body.education !== undefined) {
    const r = mergeValid(educationBase, plain(profile.education), body.education);
    profile.set('education', r.merged);
    rejected.push(...r.rejected.map((k) => `education.${k}`));
  }
  // Autosave runs frequently, so profile edits are not audited individually; the snapshot taken at submission is.
  await profile.save();
  return { profile: await getProfile(userId), rejected };
}

/* -------------------------------------------------------- Application */

async function findCurrent(userId: string) {
  return Application.findOne({ student: userId, academicYear: currentAcademicYear() });
}

export async function requireDraft(userId: string) {
  const app = await findCurrent(userId);
  if (!app) throw AppError.notFound('You have not started an application yet');
  if (app.status !== 'DRAFT') throw AppError.conflict('This application has been submitted and can no longer be edited');
  return app;
}

export async function getCurrent(userId: string) {
  const app = await findCurrent(userId);
  return app ? toApplicationDTO(app) : null;
}

export async function startApplication(userId: string, req: Request) {
  const existing = await findCurrent(userId);
  if (existing) return toApplicationDTO(existing);
  try {
    const app = await Application.create({
      student: userId,
      applicationNumber: await nextApplicationNumber(),
      academicYear: currentAcademicYear(),
      history: [{ status: 'DRAFT', at: new Date(), by: userId }],
    });
    await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.APPLICATION_CREATED, resourceType: 'Application', resourceId: app.id, metadata: { applicationNumber: app.applicationNumber }, req });
    return toApplicationDTO(app);
  } catch (err) {
    // Two "start" clicks racing each other: return the one that won.
    if ((err as { code?: number }).code === 11000) return toApplicationDTO((await findCurrent(userId))!);
    throw err;
  }
}

export async function updateDraft(userId: string, body: { family?: unknown; support?: unknown }) {
  const app = await requireDraft(userId);
  const rejected: string[] = [];
  if (body.family !== undefined) {
    const r = mergeValid(familyBase, plain(app.family), body.family);
    app.set('family', r.merged);
    rejected.push(...r.rejected.map((k) => `family.${k}`));
  }
  if (body.support !== undefined) {
    const r = mergeValid(supportBase, plain(app.support), body.support);
    app.set('support', r.merged);
    rejected.push(...r.rejected.map((k) => `support.${k}`));
  }
  await app.save();
  return { application: await toApplicationDTO(app), rejected };
}

const REQUIRED_DOCS: DocumentType[] = [...DOCUMENT_TYPES];

export async function submit(userId: string, req: Request) {
  const app = await requireDraft(userId);
  const profile = await StudentProfile.findOne({ user: userId });

  const problems: Record<string, string[]> = {};
  const check = (key: string, schema: z.ZodType, value: unknown) => {
    const r = schema.safeParse(value);
    if (!r.success) problems[key] = issuesToMessages(r.error);
  };
  check('personal', personalSchema, plain(profile?.personal));
  check('education', educationSchema, plain(profile?.education));
  check('family', familySchema, plain(app.family));
  check('support', supportSchema, plain(app.support));

  const docs = await StudentDocument.find({ application: app._id });
  const missing = REQUIRED_DOCS.filter((t) => !docs.some((d) => d.type === t));
  if (missing.length) problems.documents = missing.map((t) => `Upload your ${DOCUMENT_TYPE_LABELS[t].toLowerCase()}`);

  if (Object.keys(problems).length) {
    throw AppError.badRequest('Some sections are incomplete. Please review them before submitting.', problems);
  }

  const now = new Date();
  app.profileSnapshot = { personal: plain(profile!.personal), education: plain(profile!.education) } as never;
  app.status = 'SUBMITTED';
  app.submittedAt = now;
  app.declarationAcceptedAt = now;
  app.history.push({ status: 'SUBMITTED', at: now, by: new Types.ObjectId(userId) });
  await app.save();

  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.APPLICATION_SUBMITTED, resourceType: 'Application', resourceId: app.id, metadata: { applicationNumber: app.applicationNumber, requestedAmount: app.support?.requestedAmount }, req });
  return toApplicationDTO(app);
}

/* ---------------------------------------------------------- Documents */

export async function uploadDocument(
  userId: string,
  file: Express.Multer.File | undefined,
  meta: { type: DocumentType; certificateNumber?: string; rollNumber?: string; aadhaarNumber?: string },
  req: Request,
) {
  const app = await requireDraft(userId);
  if (!file) throw AppError.badRequest('Choose a file to upload');

  const mime = sniffMimeType(file.buffer);
  if (!mime) throw AppError.badRequest('Only PDF, JPG or PNG files are accepted');

  if (meta.type === 'INCOME_CERTIFICATE' && !/^[A-Za-z0-9/-]{6,40}$/.test(meta.certificateNumber ?? '')) {
    throw AppError.badRequest('Enter the certificate or application number printed on your income certificate', {
      certificateNumber: ['Enter a valid certificate number'],
    });
  }
  let aadhaar: string | undefined;
  if (meta.type === 'INCOME_CERTIFICATE') {
    const problem = aadhaarError(meta.aadhaarNumber);
    if (problem) throw AppError.badRequest(problem, { aadhaarNumber: [problem] });
    aadhaar = normalizeAadhaar(meta.aadhaarNumber!);
  }
  if (meta.type === 'COLLEGE_ID' && !(meta.rollNumber && meta.rollNumber.length >= 3)) {
    throw AppError.badRequest('Enter the roll number shown on your college ID', { rollNumber: ['Enter your roll number'] });
  }

  const key = await storage.put(file.buffer);
  const previous = await StudentDocument.findOne({ application: app._id, type: meta.type }).select('+storageKey');

  const safeName = file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'document';
  const doc = await StudentDocument.findOneAndUpdate(
    { application: app._id, type: meta.type },
    {
      $set: {
        owner: userId,
        status: 'PENDING',
        source: 'UPLOAD',
        storageKey: key,
        originalName: safeName,
        mimeType: mime,
        size: file.size,
        sha256: sha256(file.buffer),
        certificateNumber: meta.type === 'INCOME_CERTIFICATE' ? meta.certificateNumber : undefined,
        rollNumber: meta.type === 'COLLEGE_ID' ? meta.rollNumber : undefined,
        ...(aadhaar ? { aadhaarEncrypted: encryptField(aadhaar), aadhaarLast4: aadhaar.slice(-4) } : {}),
      },
      $unset: { verification: 1, review: 1, enrolmentCheck: 1 },
    },
    { upsert: true, new: true },
  );
  if (previous?.storageKey) await storage.remove(previous.storageKey).catch(() => undefined);
  // Keep createdAt meaningful as "uploaded at" for replacements.
  if (previous) await StudentDocument.updateOne({ _id: doc!._id }, { $set: { createdAt: new Date() } }, { timestamps: false });

  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.DOCUMENT_UPLOADED, resourceType: 'StudentDocument', resourceId: doc!.id, metadata: { type: meta.type, replaced: !!previous, sha256: doc!.sha256 }, req });
  return toApplicationDTO(app);
}

export async function deleteDocument(userId: string, docId: string, req: Request) {
  const app = await requireDraft(userId);
  if (!Types.ObjectId.isValid(docId)) throw AppError.notFound('Document not found');
  const doc = await StudentDocument.findOne({ _id: docId, application: app._id }).select('+storageKey');
  if (!doc) throw AppError.notFound('Document not found');
  await doc.deleteOne();
  await storage.remove(doc.storageKey).catch(() => undefined);
  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.DOCUMENT_DELETED, resourceType: 'StudentDocument', resourceId: docId, metadata: { type: doc.type }, req });
  return toApplicationDTO(app);
}

/** Streams a document after checking the requester may see it. */
export async function openDocument(user: { id: string; role: string }, docId: string, req: Request) {
  if (!Types.ObjectId.isValid(docId)) throw AppError.notFound('Document not found');
  const doc = await StudentDocument.findById(docId).select('+storageKey');
  if (!doc) throw AppError.notFound('Document not found');

  const isOwner = String(doc.owner) === user.id;
  let isReviewer = user.role === 'ADMIN';
  if (user.role === 'VOLUNTEER') {
    // Volunteers only see documents of applications they are currently verifying or have reviewed.
    const app = await Application.findById(doc.application).select('assignment volunteerReview');
    isReviewer = String(app?.assignment?.volunteer) === user.id || String(app?.volunteerReview?.by) === user.id;
  }
  if (!isOwner && !isReviewer) throw AppError.forbidden();
  if (isReviewer && !isOwner) {
    await audit({ actorId: user.id, actorRole: user.role, action: AUDIT_ACTIONS.DOCUMENT_VIEWED, resourceType: 'StudentDocument', resourceId: doc.id, metadata: { type: doc.type }, req });
  }
  return { doc, stream: await storage.read(doc.storageKey) };
}

/* ------------------------------------------------- Admin / volunteer */

const listQuery = z.object({
  status: z.string().optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export async function listApplications(query: unknown) {
  const q = listQuery.parse(query);
  const match: Plain = { status: { $ne: 'DRAFT' } };
  if (q.status && q.status !== 'ALL') match.status = q.status;

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 'student', pipeline: [{ $project: { fullName: 1 } }] } },
    { $unwind: '$student' },
  ];
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    pipeline.push({ $match: { $or: [{ applicationNumber: rx }, { 'student.fullName': rx }, { 'profileSnapshot.education.institutionName': rx }] } });
  }
  pipeline.push(
    { $lookup: { from: 'studentdocuments', localField: '_id', foreignField: 'application', as: 'docs', pipeline: [{ $project: { _id: 1 } }] } },
    { $sort: { submittedAt: -1 } },
    { $facet: { items: [{ $skip: (q.page - 1) * q.limit }, { $limit: q.limit }], total: [{ $count: 'n' }] } },
  );

  const [res] = await Application.aggregate(pipeline);
  const items: ApplicationSummaryDTO[] = res.items.map((a: Plain & { student: Plain; docs: unknown[]; profileSnapshot?: { education?: Plain; personal?: Plain }; support?: Plain }) => ({
    id: String(a._id),
    applicationNumber: a.applicationNumber,
    academicYear: a.academicYear,
    status: a.status,
    studentName: a.student.fullName,
    institutionName: a.profileSnapshot?.education?.institutionName,
    course: a.profileSnapshot?.education?.course,
    level: a.profileSnapshot?.education?.level,
    state: a.profileSnapshot?.personal?.state,
    requestedAmount: a.support?.requestedAmount,
    documentsUploaded: a.docs.length,
    submittedAt: a.submittedAt ? new Date(a.submittedAt as string).toISOString() : undefined,
  }));
  return { items, total: res.total[0]?.n ?? 0, page: q.page, limit: q.limit };
}

export async function applicationCounts() {
  const rows = await Application.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n])) as Record<string, number>;
}
