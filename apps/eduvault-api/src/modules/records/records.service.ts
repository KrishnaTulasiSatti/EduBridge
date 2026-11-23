import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  canonicalJson,
  type MarksheetDTO,
  type MarksheetFields,
  type MarksheetPayload,
  type MarksheetResult,
  type MarksheetStatus,
  type StudentRecordDTO,
  type StudentRecordInput,
} from '@eduvault/shared';
import { AppError } from '../../utils/AppError';
import { hashToken, humanCode } from '../../utils/tokens';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { User } from '../auth/user.model';
import { Institution, activeKey, type InstitutionDoc } from '../institutions/institution.model';
import { sha256Hex, signDigest } from '../institutions/keys';
import { sha256, sniffMimeType, storage } from '../storage/storage';
import { Marksheet, StudentRecord, nextDocumentId, type MarksheetDoc, type StudentRecordDoc } from './models';

const escapeRx = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const formatCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound();
  return new Types.ObjectId(id);
};

/* ------------------------------------------------------------ Access */

/** The institution of the signed-in issuer. Writes require the institution to be trusted (ACTIVE). */
export async function issuerInstitution(userId: string, { write = false } = {}) {
  const user = await User.findById(userId).select('institution');
  const inst = user?.institution ? await Institution.findById(user.institution) : null;
  if (!inst) throw AppError.forbidden('Your account is not linked to an institution');
  if (write && inst.status !== 'ACTIVE') {
    throw AppError.forbidden('Your institution is not an active issuer. Records cannot be changed until it is approved.');
  }
  return inst;
}

/* ---------------------------------------------------------- Mapping */

export function toRecordDTO(r: StudentRecordDoc, marksheets = 0): StudentRecordDTO {
  return {
    id: r.id,
    fullName: r.fullName,
    rollNumber: r.rollNumber,
    programme: r.programme,
    admissionYear: r.admissionYear,
    linked: !!r.account,
    linkedAt: r.linkedAt?.toISOString(),
    marksheets,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toMarksheetDTO(m: MarksheetDoc, record: StudentRecordDoc, inst: InstitutionDoc): MarksheetDTO {
  // Once issued, the signed payload is the authoritative content.
  const p = m.payload as MarksheetPayload | undefined;
  return {
    id: m.id,
    documentId: m.documentId ?? undefined,
    status: m.status as MarksheetStatus,
    studentRecordId: String(m.studentRecord),
    studentName: p?.student.name ?? record.fullName,
    rollNumber: p?.student.rollNumber ?? record.rollNumber,
    programme: p?.programme ?? record.programme,
    semester: p?.semester ?? m.semester,
    academicYear: p?.academicYear ?? m.academicYear,
    examSession: p?.examSession ?? m.examSession,
    percentage: p ? p.percentage : (m.percentage ?? undefined),
    file: m.file ? { name: m.file.originalName, size: m.file.size, sha256: m.file.sha256, mimeType: 'application/pdf' } : undefined,
    result: (p?.result ?? m.result) as MarksheetResult,
    institution: p
      ? { id: p.issuer.institutionId, name: p.issuer.name, university: p.issuer.university, code: p.issuer.code }
      : { id: inst.id, name: inst.name, university: inst.university, code: inst.code },
    signature:
      m.status !== 'DRAFT' && m.signature
        ? { algorithm: 'Ed25519', hashAlgorithm: 'SHA-256', documentHash: m.documentHash!, signature: m.signature, keyId: m.keyId!, keyFingerprint: m.keyFingerprint! }
        : undefined,
    issuedAt: m.issuedAt?.toISOString(),
    revokedAt: m.revokedAt?.toISOString(),
    revocationReason: m.revocationReason ?? undefined,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/** Loads the record and institution for many marksheets at once. */
export async function hydrateMarksheets(list: MarksheetDoc[]) {
  const [records, insts] = await Promise.all([
    StudentRecord.find({ _id: { $in: list.map((m) => m.studentRecord) } }),
    Institution.find({ _id: { $in: list.map((m) => m.institution) } }),
  ]);
  const rById = new Map(records.map((r) => [r.id, r]));
  const iById = new Map(insts.map((i) => [i.id, i]));
  return list.map((m) => toMarksheetDTO(m, rById.get(String(m.studentRecord))!, iById.get(String(m.institution))!));
}

/* --------------------------------------------------------- Students */

const pageQuery = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listStudents(userId: string, query: unknown) {
  const inst = await issuerInstitution(userId);
  const q = pageQuery.parse(query);
  const filter: Record<string, unknown> = { institution: inst._id };
  if (q.search) filter.$or = [{ fullName: escapeRx(q.search) }, { rollNumber: escapeRx(q.search) }];
  const [items, total] = await Promise.all([
    StudentRecord.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    StudentRecord.countDocuments(filter),
  ]);
  const counts = await Marksheet.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { studentRecord: { $in: items.map((r) => r._id) }, status: { $ne: 'DRAFT' } } },
    { $group: { _id: '$studentRecord', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return { items: items.map((r) => toRecordDTO(r, byId.get(r.id) ?? 0)), total, page: q.page, limit: q.limit };
}

async function newActivationCode(record: StudentRecordDoc) {
  const code = humanCode(10);
  record.set('activationCodeHash', hashToken(code));
  record.activationCodeIssuedAt = new Date();
  await record.save();
  return formatCode(code);
}

export async function enrolStudent(userId: string, input: StudentRecordInput, req: Request) {
  const inst = await issuerInstitution(userId, { write: true });
  if (await StudentRecord.exists({ institution: inst._id, rollNumber: input.rollNumber })) {
    throw AppError.badRequest('A student with this roll number is already enrolled', { rollNumber: ['Already enrolled'] });
  }
  const record = new StudentRecord({ ...input, institution: inst._id, createdBy: userId });
  const activationCode = await newActivationCode(record);
  await audit({ actorId: userId, actorRole: 'ISSUER', action: AUDIT_ACTIONS.STUDENT_ENROLLED, resourceType: 'StudentRecord', resourceId: record.id, metadata: { rollNumber: record.rollNumber }, req });
  return { student: toRecordDTO(record), activationCode };
}

/** Issues a fresh one-time activation code (the old one stops working). Only for unlinked records. */
export async function regenerateActivationCode(userId: string, recordId: string, req: Request) {
  const inst = await issuerInstitution(userId, { write: true });
  const record = await StudentRecord.findOne({ _id: oid(recordId), institution: inst._id });
  if (!record) throw AppError.notFound('Student not found');
  if (record.account) throw AppError.conflict('This student has already activated their EduVault account');
  const activationCode = await newActivationCode(record);
  await audit({ actorId: userId, actorRole: 'ISSUER', action: AUDIT_ACTIONS.ACTIVATION_CODE_ISSUED, resourceType: 'StudentRecord', resourceId: record.id, req });
  return { activationCode };
}

/* -------------------------------------------------------- Marksheets */

export async function listMarksheets(userId: string, query: unknown) {
  const inst = await issuerInstitution(userId);
  const q = pageQuery.parse(query);
  const filter: Record<string, unknown> = { institution: inst._id };
  if (q.status && q.status !== 'ALL') filter.status = q.status;
  if (q.search) {
    const records = await StudentRecord.find({ institution: inst._id, $or: [{ fullName: escapeRx(q.search) }, { rollNumber: escapeRx(q.search) }] }).select('_id');
    filter.$or = [{ studentRecord: { $in: records.map((r) => r._id) } }, { documentId: escapeRx(q.search) }];
  }
  const [items, total] = await Promise.all([
    Marksheet.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    Marksheet.countDocuments(filter),
  ]);
  return { items: await hydrateMarksheets(items), total, page: q.page, limit: q.limit };
}

async function findOwnMarksheet(inst: InstitutionDoc, id: string) {
  const m = await Marksheet.findOne({ _id: oid(id), institution: inst._id });
  if (!m) throw AppError.notFound('Marksheet not found');
  return m;
}

export async function getMarksheet(userId: string, id: string) {
  const inst = await issuerInstitution(userId);
  const m = await findOwnMarksheet(inst, id);
  return (await hydrateMarksheets([m]))[0];
}

function marksheetFields(input: MarksheetFields) {
  return {
    semester: input.semester,
    academicYear: input.academicYear,
    examSession: input.examSession,
    result: input.result,
    percentage: input.percentage,
  };
}

const duplicate = (err: unknown) =>
  (err as { code?: number }).code === 11000
    ? AppError.badRequest('This student already has a marksheet for this semester and exam session', { semester: ['Already exists'] })
    : err;

/** Checks the uploaded file really is a PDF (by its content) and stores it privately. */
async function storePdf(file: Express.Multer.File) {
  if (sniffMimeType(file.buffer) !== 'application/pdf') {
    throw AppError.badRequest('The marksheet must be a PDF file', { file: ['Choose a PDF file'] });
  }
  const safeName = file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'marksheet.pdf';
  return {
    storageKey: await storage.put(file.buffer),
    originalName: safeName,
    mimeType: 'application/pdf' as const,
    size: file.size,
    sha256: sha256(file.buffer),
  };
}

export async function createMarksheet(userId: string, input: MarksheetFields, file: Express.Multer.File | undefined, req: Request) {
  const inst = await issuerInstitution(userId, { write: true });
  const record = await StudentRecord.findOne({ _id: oid(input.studentRecordId), institution: inst._id });
  if (!record) throw AppError.badRequest('Select a student from your institution', { studentRecordId: ['Student not found'] });
  if (!file) throw AppError.badRequest('Upload the marksheet PDF', { file: ['Choose a PDF file'] });
  const stored = await storePdf(file);
  try {
    const m = await Marksheet.create({ ...marksheetFields(input), file: stored, institution: inst._id, studentRecord: record._id, createdBy: userId });
    await audit({ actorId: userId, actorRole: 'ISSUER', action: AUDIT_ACTIONS.MARKSHEET_CREATED, resourceType: 'Marksheet', resourceId: m.id, metadata: { rollNumber: record.rollNumber, semester: m.semester, fileSha256: stored.sha256 }, req });
    return toMarksheetDTO(m, record, inst);
  } catch (err) {
    await storage.remove(stored.storageKey).catch(() => undefined);
    throw duplicate(err);
  }
}

/** Updates a draft. A new PDF is optional; if given, it replaces the old one. */
export async function updateMarksheet(userId: string, id: string, input: MarksheetFields, file: Express.Multer.File | undefined) {
  const inst = await issuerInstitution(userId, { write: true });
  const m = await Marksheet.findOne({ _id: oid(id), institution: inst._id }).select('+file.storageKey');
  if (!m) throw AppError.notFound('Marksheet not found');
  if (m.status !== 'DRAFT') throw AppError.conflict('Issued marksheets cannot be edited. Revoke it and issue a corrected one.');
  if (String(m.studentRecord) !== input.studentRecordId) throw AppError.badRequest('The student of a marksheet cannot be changed');
  const oldKey = m.file?.storageKey;
  m.set(marksheetFields(input));
  if (file) m.set('file', await storePdf(file));
  try {
    await m.save();
  } catch (err) {
    throw duplicate(err);
  }
  if (file && oldKey) await storage.remove(oldKey).catch(() => undefined);
  return (await hydrateMarksheets([m]))[0];
}

export async function deleteDraft(userId: string, id: string) {
  const inst = await issuerInstitution(userId, { write: true });
  const m = await findOwnMarksheet(inst, id);
  if (m.status !== 'DRAFT') throw AppError.conflict('Only drafts can be deleted');
  const withKey = await Marksheet.findById(m._id).select('+file.storageKey');
  await m.deleteOne();
  if (withKey?.file?.storageKey) await storage.remove(withKey.file.storageKey).catch(() => undefined);
}

/**
 * Issues a marksheet: freezes its content into a canonical payload, hashes it with SHA-256 and signs
 * the hash with the institution's Ed25519 private key.
 */
export async function issueMarksheet(userId: string, id: string, req: Request) {
  const inst = await Institution.findById((await issuerInstitution(userId, { write: true }))._id).select('+signingKeys.encryptedPrivateKey');
  if (!inst) throw AppError.notFound();
  const key = activeKey(inst);
  if (!key) throw AppError.conflict('Your institution has no signing key. Contact the EduVault administrator.');

  const m = await findOwnMarksheet(inst, id);
  if (m.status !== 'DRAFT') throw AppError.conflict('This marksheet has already been issued');
  const record = await StudentRecord.findById(m.studentRecord);
  if (!record) throw AppError.notFound('Student not found');
  if (!m.file?.sha256) throw AppError.badRequest('Upload the marksheet PDF before issuing');

  const issuedAt = new Date();
  const documentId = await nextDocumentId(issuedAt.getFullYear());
  const payload: MarksheetPayload = {
    schema: 'eduvault.marksheet/v2',
    documentId,
    issuer: { institutionId: inst.id, name: inst.name, university: inst.university, code: inst.code },
    student: { name: record.fullName, rollNumber: record.rollNumber },
    programme: record.programme,
    semester: m.semester,
    academicYear: m.academicYear,
    examSession: m.examSession,
    result: m.result as MarksheetResult,
    percentage: m.percentage ?? undefined,
    file: { sha256: m.file.sha256, size: m.file.size, mimeType: 'application/pdf' },
    issuedAt: issuedAt.toISOString(),
    testData: true,
  };
  const documentHash = sha256Hex(canonicalJson(payload));

  // Claim the draft atomically so a double click cannot issue it twice.
  const issued = await Marksheet.findOneAndUpdate(
    { _id: m._id, status: 'DRAFT' },
    {
      $set: {
        status: 'ISSUED',
        documentId,
        payload,
        documentHash,
        signature: signDigest(documentHash, key.encryptedPrivateKey),
        keyId: key.keyId,
        keyFingerprint: key.fingerprint,
        issuedAt,
        issuedBy: userId,
      },
    },
    { new: true },
  );
  if (!issued) throw AppError.conflict('This marksheet has already been issued');

  await audit({ actorId: userId, actorRole: 'ISSUER', action: AUDIT_ACTIONS.MARKSHEET_ISSUED, resourceType: 'Marksheet', resourceId: issued.id, metadata: { documentId, documentHash, keyId: key.keyId }, req });
  return toMarksheetDTO(issued, record, inst);
}

export async function revokeMarksheet(userId: string, id: string, reason: string, req: Request) {
  const inst = await issuerInstitution(userId, { write: true });
  const m = await findOwnMarksheet(inst, id);
  if (m.status !== 'ISSUED') throw AppError.conflict('Only issued marksheets can be revoked');
  m.status = 'REVOKED';
  m.revokedAt = new Date();
  m.revokedBy = new Types.ObjectId(userId);
  m.revocationReason = reason;
  await m.save();
  await audit({ actorId: userId, actorRole: 'ISSUER', action: AUDIT_ACTIONS.MARKSHEET_REVOKED, resourceType: 'Marksheet', resourceId: m.id, metadata: { documentId: m.documentId, reason }, req });
  return (await hydrateMarksheets([m]))[0];
}

export async function issuerOverview(userId: string) {
  const inst = await issuerInstitution(userId);
  const [students, linked, byStatus, recent] = await Promise.all([
    StudentRecord.countDocuments({ institution: inst._id }),
    StudentRecord.countDocuments({ institution: inst._id, account: { $ne: null } }),
    Marksheet.aggregate<{ _id: string; n: number }>([{ $match: { institution: inst._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Marksheet.find({ institution: inst._id }).sort({ updatedAt: -1 }).limit(5),
  ]);
  const counts = Object.fromEntries(byStatus.map((r) => [r._id, r.n])) as Partial<Record<MarksheetStatus, number>>;
  const key = activeKey(inst);
  return {
    institution: {
      id: inst.id,
      name: inst.name,
      university: inst.university,
      code: inst.code,
      city: inst.city,
      state: inst.state,
      status: inst.status,
      approvedAt: inst.approvedAt?.toISOString(),
      signingKey: key ? { keyId: key.keyId, fingerprint: key.fingerprint, createdAt: key.createdAt.toISOString() } : undefined,
    },
    students,
    linked,
    marksheets: counts,
    recent: await hydrateMarksheets(recent),
  };
}

/* ---------------------------------------------------------- Students (self) */

export async function myEnrolments(userId: string) {
  const records = await StudentRecord.find({ account: userId }).sort({ linkedAt: 1 });
  const insts = await Institution.find({ _id: { $in: records.map((r) => r.institution) } });
  const byId = new Map(insts.map((i) => [i.id, i]));
  return records.map((r) => ({ ...toRecordDTO(r), institution: { id: String(r.institution), name: byId.get(String(r.institution))?.name ?? '' } }));
}

export async function linkEnrolment(userId: string, code: string, req: Request) {
  const record = await StudentRecord.findOneAndUpdate(
    { activationCodeHash: hashToken(code), account: null },
    { $set: { account: userId, linkedAt: new Date() }, $unset: { activationCodeHash: 1 } },
    { new: true },
  );
  if (!record) {
    throw AppError.badRequest('This activation code is not valid or has already been used.', { activationCode: ['Code not recognised'] });
  }
  await audit({ actorId: userId, actorRole: 'STUDENT', action: AUDIT_ACTIONS.ENROLMENT_LINKED, resourceType: 'StudentRecord', resourceId: record.id, metadata: { institution: String(record.institution), rollNumber: record.rollNumber }, req });
  return myEnrolments(userId);
}

/** Marksheets a student can see: issued (or later revoked) marksheets of their linked enrolments. */
export async function myMarksheets(userId: string) {
  const records = await StudentRecord.find({ account: userId }).select('_id');
  const list = await Marksheet.find({ studentRecord: { $in: records.map((r) => r._id) }, status: { $ne: 'DRAFT' } }).sort({ issuedAt: -1 });
  return hydrateMarksheets(list);
}

export async function myMarksheet(userId: string, id: string) {
  const m = await Marksheet.findOne({ _id: oid(id), status: { $ne: 'DRAFT' } });
  if (!m) throw AppError.notFound('Marksheet not found');
  const record = await StudentRecord.findById(m.studentRecord);
  if (!record || String(record.account) !== userId) throw AppError.notFound('Marksheet not found');
  return (await hydrateMarksheets([m]))[0];
}

/* -------------------------------------------------------------- Files */

async function openPdf(m: MarksheetDoc) {
  const withKey = await Marksheet.findById(m._id).select('+file.storageKey');
  if (!withKey?.file?.storageKey) throw AppError.notFound('This marksheet has no file');
  return { file: withKey.file, stream: await storage.read(withKey.file.storageKey) };
}

export async function issuerMarksheetFile(userId: string, id: string) {
  const inst = await issuerInstitution(userId);
  return openPdf(await findOwnMarksheet(inst, id));
}

export async function myMarksheetFile(userId: string, id: string) {
  const m = await Marksheet.findOne({ _id: oid(id), status: { $ne: 'DRAFT' } });
  const record = m ? await StudentRecord.findById(m.studentRecord) : null;
  if (!m || !record || String(record.account) !== userId) throw AppError.notFound('Marksheet not found');
  return openPdf(m);
}

/** Reads the whole PDF of a marksheet (used when it is shared with a partner). */
export async function readPdf(m: MarksheetDoc) {
  const { stream } = await openPdf(m);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
