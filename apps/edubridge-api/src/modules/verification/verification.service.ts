import * as notify from '../notifications/notify';
import type { Request } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  FINAL_DOCUMENT_STATUSES,
  INCOME_CERTIFICATE_VALIDITY_YEARS,
  incomeCertificateExpiry,
  incomeCertificateValid,
  VERIFICATION_STAGE,
  type DocumentReviewDTO,
  type DocumentReviewInput,
  type DocumentStatus,
  type DocumentType,
  type EnrolmentCheckDTO,
  type Inconsistency,
  type PersonRef,
  type QueueItemDTO,
  type QueueScope,
  type Recommendation,
  type Role,
  type VerificationCheck,
  type VerificationDetailDTO,
  type VerificationStatsDTO,
  type VolunteerReviewInput,
} from '@edubridge/shared';
import { AppError } from '../../utils/AppError';
import { decryptField } from '../../utils/fieldCrypto';
import { Application, StudentDocument, type ApplicationDoc, type StudentDocumentDoc } from '../applications/models';
import { toApplicationDTO } from '../applications/applications.service';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { User } from '../auth/user.model';
import { namesMatch, rollNumbersMatch } from '../eduvault/verify';
import { VaultError, vaultClient } from '../eduvault/vaultClient';
import { checkInstitution } from './registry';
import { assessAfterVolunteerReview } from '../assessment/assessment.service';

type Actor = { id: string; role: Role };
type Plain = Record<string, unknown>;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const isAdmin = (u: Actor) => u.role === 'ADMIN';

/* ----------------------------------------------------------- Access */

async function findApplication(id: string) {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Application not found');
  const app = await Application.findById(id);
  if (!app || app.status === 'DRAFT') throw AppError.notFound('Application not found');
  return app;
}

const assigneeOf = (app: ApplicationDoc) => (app.assignment?.volunteer ? String(app.assignment.volunteer) : undefined);

/** Admins see everything; a volunteer sees applications they are verifying or have reviewed. */
async function loadForViewing(user: Actor, id: string) {
  const app = await findApplication(id);
  if (isAdmin(user)) return app;
  const mine = assigneeOf(app) === user.id || String(app.volunteerReview?.by ?? '') === user.id;
  if (!mine) throw AppError.forbidden('Claim this application from the queue before opening it');
  return app;
}

/** Only the person who claimed an application may record checks on it. */
async function loadForEditing(user: Actor, id: string) {
  const app = await findApplication(id);
  if (app.status !== 'UNDER_VERIFICATION') throw AppError.conflict('This application is not being verified right now');
  if (assigneeOf(app) !== user.id) throw AppError.forbidden('Claim this application before recording checks');
  return app;
}

async function personRef(id: string, role?: string): Promise<PersonRef> {
  const u = await User.findById(id).select('fullName role');
  return { id, name: u?.fullName ?? 'Former user', role: role ?? u?.role };
}

/* ------------------------------------------------------------ Queue */

const queueQuery = z.object({
  scope: z.enum(['available', 'mine', 'reviewed', 'all']).default('available'),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export async function listQueue(user: Actor, query: unknown) {
  const q = queueQuery.parse(query);
  const scope = q.scope as QueueScope;
  if (scope === 'all' && !isAdmin(user)) throw AppError.forbidden();
  const me = new Types.ObjectId(user.id);

  let match: Plain;
  let sort: Record<string, 1 | -1>;
  switch (scope) {
    case 'available':
      match = { status: { $in: VERIFICATION_STAGE }, 'assignment.volunteer': { $exists: false } };
      sort = { submittedAt: 1 }; // oldest first, so nobody waits indefinitely
      break;
    case 'mine':
      match = { status: 'UNDER_VERIFICATION', 'assignment.volunteer': me };
      sort = { 'assignment.claimedAt': 1 };
      break;
    case 'reviewed':
      match = isAdmin(user) ? { volunteerReview: { $exists: true } } : { 'volunteerReview.by': me };
      sort = { 'volunteerReview.at': -1 };
      break;
    default:
      match = { status: { $in: [...VERIFICATION_STAGE, 'VOLUNTEER_REVIEWED'] } };
      sort = { submittedAt: 1 };
  }

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
    { $sort: sort },
    {
      $facet: {
        items: [
          { $skip: (q.page - 1) * q.limit },
          { $limit: q.limit },
          { $lookup: { from: 'users', localField: 'assignment.volunteer', foreignField: '_id', as: 'assignee', pipeline: [{ $project: { fullName: 1, role: 1 } }] } },
          { $lookup: { from: 'studentdocuments', localField: '_id', foreignField: 'application', as: 'docs', pipeline: [{ $project: { type: 1, status: 1 } }] } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  );

  const [res] = await Application.aggregate(pipeline);
  type Row = Plain & {
    student: Plain;
    assignee: Plain[];
    docs: { type: DocumentType; status: DocumentStatus }[];
    assignment?: { claimedAt: Date };
    volunteerReview?: { recommendation: Recommendation; at: Date };
    profileSnapshot?: { education?: Plain; personal?: Plain };
    support?: Plain;
  };
  const items: QueueItemDTO[] = res.items.map((a: Row) => ({
    id: String(a._id),
    applicationNumber: a.applicationNumber as string,
    academicYear: a.academicYear as string,
    status: a.status as QueueItemDTO['status'],
    studentName: a.student.fullName as string,
    institutionName: a.profileSnapshot?.education?.institutionName as string | undefined,
    course: a.profileSnapshot?.education?.course as string | undefined,
    level: a.profileSnapshot?.education?.level as QueueItemDTO['level'],
    state: a.profileSnapshot?.personal?.state as string | undefined,
    requestedAmount: a.support?.requestedAmount as number | undefined,
    documentsUploaded: a.docs.length,
    submittedAt: a.submittedAt ? new Date(a.submittedAt as string).toISOString() : undefined,
    assignee: a.assignee[0] ? { id: String(a.assignee[0]._id), name: a.assignee[0].fullName as string, role: a.assignee[0].role as string } : undefined,
    claimedAt: a.assignment?.claimedAt ? new Date(a.assignment.claimedAt).toISOString() : undefined,
    documents: a.docs.map((d) => ({ type: d.type, status: d.status })),
    recommendation: a.volunteerReview?.recommendation,
    reviewedAt: a.volunteerReview?.at ? new Date(a.volunteerReview.at).toISOString() : undefined,
  }));
  return { items, total: res.total[0]?.n ?? 0, page: q.page, limit: q.limit };
}

export async function stats(user: Actor): Promise<VerificationStatsDTO> {
  const me = new Types.ObjectId(user.id);
  const [available, mine, reviewedByMe, underVerification] = await Promise.all([
    Application.countDocuments({ status: { $in: VERIFICATION_STAGE }, 'assignment.volunteer': { $exists: false } }),
    Application.countDocuments({ status: 'UNDER_VERIFICATION', 'assignment.volunteer': me }),
    Application.countDocuments({ 'volunteerReview.by': me }),
    Application.countDocuments({ status: 'UNDER_VERIFICATION' }),
  ]);
  return { available, mine, reviewedByMe, underVerification };
}

/* ------------------------------------------------------ Claim / release */

export async function claim(user: Actor, id: string, req: Request) {
  await findApplication(id);
  const now = new Date();
  // Atomic: if two volunteers click "Start verification" together, only one gets it.
  const before = await Application.findOneAndUpdate(
    { _id: id, status: { $in: VERIFICATION_STAGE }, 'assignment.volunteer': { $exists: false } },
    { $set: { assignment: { volunteer: new Types.ObjectId(user.id), claimedAt: now }, status: 'UNDER_VERIFICATION' } },
    { new: false },
  );
  if (!before) throw AppError.conflict('Someone else is already verifying this application, or it has left the queue');

  if (before.status === 'SUBMITTED') {
    await Application.updateOne(
      { _id: id },
      { $push: { history: { status: 'UNDER_VERIFICATION', at: now, by: new Types.ObjectId(user.id), note: 'Document verification started' } } },
    );
  }
  await StudentDocument.updateMany({ application: id, status: 'PENDING' }, { $set: { status: 'PROCESSING' } });
  await audit({ actorId: user.id, actorRole: user.role, action: AUDIT_ACTIONS.VERIFICATION_CLAIMED, resourceType: 'Application', resourceId: id, metadata: { applicationNumber: before.applicationNumber }, req });
  if (before.status === 'SUBMITTED') notify.verificationStarted(before._id);
  // Check the college ID against the college's EduVault records straight away.
  await runEnrolmentCheck(user, (await Application.findById(id))!, false, req);
  return detail(user, id);
}

/* -------------------------------------------------- Enrolment check */

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const UNAVAILABLE_SUMMARY = 'EduVault could not be reached, so enrolment could not be checked. Try again in a few minutes.';

/**
 * College ID: asks EduVault whether the college has a student enrolled with this roll number, and compares
 * that record with the application. A full match verifies the college ID without contacting the college.
 * `force` re-runs it on request; otherwise an existing result or a reviewer's manual result is kept.
 */
async function runEnrolmentCheck(user: Actor, app: ApplicationDoc, force: boolean, req: Request) {
  const doc = await StudentDocument.findOne({ application: app._id, type: 'COLLEGE_ID' });
  if (!doc) return;
  const previous = doc.enrolmentCheck as EnrolmentCheckDTO | undefined;
  if (!force && (doc.review || (previous && previous.result !== 'UNAVAILABLE'))) return;

  const { education } = snapshotOf(app);
  const rollNumber = (doc.rollNumber ?? (education.rollNumber as string | undefined) ?? '').trim();
  const student = await User.findById(app.student).select('fullName');
  const studentName = student?.fullName ?? '';
  const now = new Date().toISOString();

  let check: EnrolmentCheckDTO;
  let status: DocumentStatus | undefined;
  const institution = await checkInstitution({
    institutionName: education.institutionName as string | undefined,
    university: education.university as string | undefined,
  });

  if (institution.result !== 'REGISTERED') {
    const unavailable = institution.result === 'UNAVAILABLE';
    check = {
      result: unavailable ? 'UNAVAILABLE' : 'INSTITUTION_NOT_REGISTERED',
      checkedAt: now,
      rollNumber,
      checks: [],
      summary: unavailable
        ? UNAVAILABLE_SUMMARY
        : `${institution.entered.institutionName ?? 'This college'} is not registered with EduVault, so enrolment cannot be checked automatically. Confirm it with the college instead.`,
    };
    status = unavailable ? 'SERVICE_UNAVAILABLE' : undefined;
  } else {
    const inst = institution.match!;
    try {
      const res = await vaultClient.checkEnrolment({ institutionId: inst.institutionId, rollNumber });
      if (!res.enrolled || !res.student) {
        check = {
          result: 'NOT_ENROLLED',
          checkedAt: now,
          rollNumber,
          institution: { name: res.institution.name, code: res.institution.code },
          checks: [{ field: 'Enrolment', application: rollNumber, document: `No student with this roll number at ${res.institution.name}`, match: false }],
          summary: `${res.institution.name} has no student enrolled with roll number ${rollNumber} on EduVault.`,
        };
        status = 'REVIEW_REQUIRED';
      } else {
        const r = res.student;
        const course = (education.course as string | undefined) ?? '';
        const checks: VerificationCheck[] = [
          { field: 'Roll number', application: rollNumber, document: r.rollNumber, match: rollNumbersMatch(rollNumber, r.rollNumber) },
          { field: 'Student name', application: studentName, document: r.fullName, match: namesMatch(studentName, r.fullName) },
          { field: 'Institution', application: institution.entered.institutionName, document: res.institution.name, match: true },
        ];
        if (course) {
          const a = loose(course);
          const b = loose(r.programme);
          checks.push({ field: 'Programme', application: course, document: r.programme, match: !!a && !!b && (b.includes(a) || a.includes(b)) });
        }
        const allMatch = checks.every((c) => c.match);
        check = {
          result: 'ENROLLED',
          checkedAt: now,
          rollNumber,
          institution: { name: res.institution.name, code: res.institution.code },
          record: { fullName: r.fullName, programme: r.programme, admissionYear: r.admissionYear },
          checks,
          summary: allMatch
            ? `${res.institution.name} confirms ${r.fullName} (roll no. ${r.rollNumber}) is enrolled in ${r.programme}.`
            : `${res.institution.name} has a student with roll number ${r.rollNumber}, but some details differ from the application.`,
        };
        status = allMatch ? 'VERIFIED' : 'REVIEW_REQUIRED';
      }
    } catch (e) {
      const notFound = e instanceof VaultError && e.status === 404;
      check = {
        result: notFound ? 'INSTITUTION_NOT_REGISTERED' : 'UNAVAILABLE',
        checkedAt: now,
        rollNumber,
        checks: [],
        summary: notFound
          ? 'The college is no longer active in the EduVault registry. Confirm enrolment with the college instead.'
          : UNAVAILABLE_SUMMARY,
      };
      status = notFound ? undefined : 'SERVICE_UNAVAILABLE';
    }
  }

  doc.set('enrolmentCheck', check);
  if (status) {
    doc.status = status;
    doc.set('review', undefined);
  } else if (doc.status === 'SERVICE_UNAVAILABLE') {
    doc.status = 'PROCESSING';
  }
  await doc.save();
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.ENROLMENT_CHECKED,
    resourceType: 'StudentDocument',
    resourceId: doc.id,
    metadata: { applicationNumber: app.applicationNumber, result: check.result, status: doc.status },
    req,
  });
}

/** "Check again" from the college ID panel. */
export async function recheckEnrolment(user: Actor, id: string, req: Request) {
  const app = await loadForEditing(user, id);
  await runEnrolmentCheck(user, app, true, req);
  return detail(user, id);
}

/** Hands the application back to the queue. Checks already recorded are kept. */
export async function release(user: Actor, id: string, req: Request) {
  const app = await findApplication(id);
  const assignee = assigneeOf(app);
  if (app.status !== 'UNDER_VERIFICATION' || !assignee) throw AppError.conflict('This application is not assigned to anyone');
  if (assignee !== user.id && !isAdmin(user)) throw AppError.forbidden();
  await Application.updateOne({ _id: id, 'assignment.volunteer': app.assignment!.volunteer }, { $unset: { assignment: 1 } });
  await audit({ actorId: user.id, actorRole: user.role, action: AUDIT_ACTIONS.VERIFICATION_RELEASED, resourceType: 'Application', resourceId: id, metadata: { applicationNumber: app.applicationNumber, releasedFrom: assignee }, req });
  return { released: true };
}

/* ------------------------------------------------- Comparisons / checks */

function snapshotOf(app: ApplicationDoc) {
  const snap = (app.profileSnapshot ?? {}) as { education?: Plain; personal?: Plain };
  return { education: snap.education ?? {}, personal: snap.personal ?? {} };
}

function compareChecks(input: DocumentReviewInput, doc: StudentDocumentDoc, app: ApplicationDoc, studentName: string): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  const add = (field: string, application: string | undefined, document: string, match: boolean) => checks.push({ field, application, document, match });
  const { education } = snapshotOf(app);

  if (input.type === 'INCOME_CERTIFICATE') {
    if (input.portalCertificateNumber) {
      add('Certificate number', doc.certificateNumber ?? undefined, input.portalCertificateNumber, rollNumbersMatch(doc.certificateNumber ?? '', input.portalCertificateNumber));
    }
    if (input.holderName) add('Name on certificate', studentName, input.holderName, namesMatch(studentName, input.holderName));
    if (input.annualIncome !== undefined) {
      const declared = app.family?.annualFamilyIncome;
      // A difference within ₹1,000 is treated as rounding.
      const ok = declared !== undefined && declared !== null && Math.abs(declared - input.annualIncome) <= 1000;
      add('Annual family income', declared != null ? inr(declared) : undefined, inr(input.annualIncome), ok);
    }
    if (input.issueDate) {
      const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const issued = new Date(input.issueDate);
      const valid = incomeCertificateValid(issued);
      const found =
        issued > new Date()
          ? `Issue date ${fmt(issued)} is in the future`
          : `Issued ${fmt(issued)} · ${valid ? 'valid until' : 'expired on'} ${fmt(incomeCertificateExpiry(issued))}`;
      add(`Within ${INCOME_CERTIFICATE_VALIDITY_YEARS}-year validity`, undefined, found, valid);
    }
  }

  if (input.type === 'COLLEGE_ID') {
    if (input.nameOnCard) add('Name on ID card', studentName, input.nameOnCard, namesMatch(studentName, input.nameOnCard));
    if (input.enrolmentConfirmed !== undefined) {
      add('Current enrolment', education.institutionName as string | undefined, input.enrolmentConfirmed ? 'Confirmed by the institution' : 'Not confirmed', input.enrolmentConfirmed);
    }
  }

  if (input.type === 'MARKSHEET') {
    if (input.nameOnDocument) add('Name on marksheet', studentName, input.nameOnDocument, namesMatch(studentName, input.nameOnDocument));
    if (input.percentage !== undefined) {
      const declared = education.lastExamPercentage as number | undefined;
      add('Percentage', declared !== undefined ? `${declared}%` : undefined, `${input.percentage}%`, declared !== undefined && Math.abs(declared - input.percentage) <= 0.5);
    }
  }

  return checks;
}

const METHOD: Record<DocumentType, DocumentReviewDTO['method']> = {
  INCOME_CERTIFICATE: 'AP_SEVA_PORTAL',
  COLLEGE_ID: 'INSTITUTION_CONFIRMATION',
  MARKSHEET: 'DOCUMENT_INSPECTION',
};

export async function reviewDocument(user: Actor, appId: string, docId: string, input: DocumentReviewInput, req: Request) {
  const app = await loadForEditing(user, appId);
  if (!Types.ObjectId.isValid(docId)) throw AppError.notFound('Document not found');
  const doc = await StudentDocument.findOne({ _id: docId, application: app._id });
  if (!doc) throw AppError.notFound('Document not found');
  if (doc.type !== input.type) throw AppError.badRequest('These details are for a different document type');
  if (doc.source === 'EDUVAULT' && doc.status === 'VERIFIED') {
    throw AppError.conflict('This marksheet was verified through its EduVault digital signature. No manual check is needed.');
  }
  if (doc.type === 'COLLEGE_ID' && doc.status === 'VERIFIED' && (doc.enrolmentCheck as EnrolmentCheckDTO | undefined)?.result === 'ENROLLED') {
    throw AppError.conflict('Enrolment was confirmed from the college records on EduVault. No manual check is needed.');
  }

  const student = await User.findById(app.student).select('fullName');
  const checks = compareChecks(input, doc, app, student?.fullName ?? '');
  const { type: _type, outcome, note, ...recorded } = input;
  const review: DocumentReviewDTO = {
    outcome,
    method: METHOD[doc.type as DocumentType],
    note,
    recorded: Object.fromEntries(Object.entries(recorded).filter(([, v]) => v !== '' && v !== undefined)) as DocumentReviewDTO['recorded'],
    checks,
    by: await personRef(user.id, user.role),
    at: new Date().toISOString(),
  };
  const from = doc.status;
  doc.status = outcome;
  doc.set('review', review);
  await doc.save();

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.DOCUMENT_REVIEWED,
    resourceType: 'StudentDocument',
    resourceId: doc.id,
    metadata: { applicationNumber: app.applicationNumber, type: doc.type, from, to: outcome, mismatches: checks.filter((c) => !c.match).map((c) => c.field) },
    req,
  });
  return detail(user, appId);
}

/* ---------------------------------------------------------- Aadhaar */

/**
 * Reveals the student's full Aadhaar number so the reviewer can search for the income certificate on AP Seva.
 * Only the person verifying the application (or an admin) may see it, and every reveal is audited.
 */
export async function revealAadhaar(user: Actor, appId: string, docId: string, req: Request) {
  const app = await findApplication(appId);
  if (!isAdmin(user) && !(app.status === 'UNDER_VERIFICATION' && assigneeOf(app) === user.id)) {
    throw AppError.forbidden('Only the person verifying this application can view the Aadhaar number');
  }
  if (!Types.ObjectId.isValid(docId)) throw AppError.notFound('Document not found');
  const doc = await StudentDocument.findOne({ _id: docId, application: app._id, type: 'INCOME_CERTIFICATE' }).select('+aadhaarEncrypted');
  if (!doc?.aadhaarEncrypted) throw AppError.notFound('No Aadhaar number was provided with this certificate');
  const aadhaarNumber = decryptField(doc.aadhaarEncrypted);
  await audit({ actorId: user.id, actorRole: user.role, action: AUDIT_ACTIONS.AADHAAR_VIEWED, resourceType: 'StudentDocument', resourceId: doc.id, metadata: { applicationNumber: app.applicationNumber }, req });
  return { aadhaarNumber };
}

/* ------------------------------------------------- Volunteer review */

export async function submitReview(user: Actor, appId: string, input: VolunteerReviewInput, req: Request) {
  const app = await loadForEditing(user, appId);
  const docs = await StudentDocument.find({ application: app._id });

  const problems: string[] = [];
  for (const t of DOCUMENT_TYPES) {
    const d = docs.find((x) => x.type === t);
    if (!d) problems.push(`${DOCUMENT_TYPE_LABELS[t]} is missing`);
    else if (!FINAL_DOCUMENT_STATUSES.includes(d.status)) problems.push(`Record a result for the ${DOCUMENT_TYPE_LABELS[t].toLowerCase()}`);
  }
  if (problems.length) throw AppError.badRequest('Every document needs a result before you submit the review.', { documents: problems });

  const now = new Date();
  const updated = await Application.findOneAndUpdate(
    { _id: app._id, status: 'UNDER_VERIFICATION', 'assignment.volunteer': new Types.ObjectId(user.id) },
    {
      $set: {
        status: 'VOLUNTEER_REVIEWED',
        volunteerReview: { ...input, by: new Types.ObjectId(user.id), byRole: user.role, at: now },
      },
      $unset: { assignment: 1 },
      $push: { history: { status: 'VOLUNTEER_REVIEWED', at: now, by: new Types.ObjectId(user.id), note: 'Preliminary verification completed' } },
    },
    { new: true },
  );
  if (!updated) throw AppError.conflict('This application changed while you were working on it. Please reload.');

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.VOLUNTEER_REVIEW_SUBMITTED,
    resourceType: 'Application',
    resourceId: app.id,
    metadata: { applicationNumber: app.applicationNumber, recommendation: input.recommendation, documents: Object.fromEntries(docs.map((d) => [d.type, d.status])) },
    req,
  });
  // Hand over to need assessment straight away; the application then waits for the admin's decision.
  await assessAfterVolunteerReview(app._id, user.id);
  return detail(user, appId);
}

/* ------------------------------------------------------------ Detail */

function findInconsistencies(app: ApplicationDoc, docs: StudentDocumentDoc[], institution: VerificationDetailDTO['institutionCheck']): Inconsistency[] {
  const out: Inconsistency[] = [];
  const { education } = snapshotOf(app);

  const collegeId = docs.find((d) => d.type === 'COLLEGE_ID');
  const roll = education.rollNumber as string | undefined;
  if (collegeId?.rollNumber && roll && !rollNumbersMatch(collegeId.rollNumber, roll)) {
    out.push({ document: 'COLLEGE_ID', field: 'Roll number', application: roll, found: collegeId.rollNumber, severity: 'warning' });
  }
  if (institution.result === 'NOT_FOUND') {
    out.push({ document: 'COLLEGE_ID', field: 'Institution', application: institution.entered.institutionName, found: 'Not registered with EduVault — confirm enrolment directly with the college', severity: 'info' });
  }

  for (const d of docs) {
    const type = d.type as DocumentType;
    const fromVault = (d.verification as { checks?: VerificationCheck[] } | undefined)?.checks ?? [];
    const manual = (d.review as DocumentReviewDTO | undefined)?.checks ?? [];
    const enrolment = (d.enrolmentCheck as EnrolmentCheckDTO | undefined)?.checks ?? [];
    for (const c of [...(d.source === 'EDUVAULT' ? fromVault : []), ...enrolment, ...manual]) {
      if (!c.match) out.push({ document: type, field: c.field, application: c.application, found: c.document, severity: 'warning' });
    }
  }
  return out;
}

export async function detail(user: Actor, id: string): Promise<VerificationDetailDTO> {
  const app = await loadForViewing(user, id);
  const [student, docs] = await Promise.all([
    User.findById(app.student).select('fullName email phone'),
    StudentDocument.find({ application: app._id }),
  ]);
  const { education } = snapshotOf(app);
  const institutionCheck = await checkInstitution({
    institutionName: education.institutionName as string | undefined,
    university: education.university as string | undefined,
  });

  const assignee = assigneeOf(app);
  const review = app.volunteerReview;
  return {
    application: await toApplicationDTO(app, true),
    student: { id: String(app.student), name: student?.fullName ?? 'Unknown', email: student?.email ?? '', phone: student?.phone ?? undefined },
    assignee: assignee ? { ...(await personRef(assignee)), claimedAt: app.assignment!.claimedAt.toISOString() } : undefined,
    canEdit: app.status === 'UNDER_VERIFICATION' && assignee === user.id,
    institutionCheck,
    inconsistencies: findInconsistencies(app, docs, institutionCheck),
    volunteerReview: review
      ? { recommendation: review.recommendation as Recommendation, summary: review.summary, by: await personRef(String(review.by), review.byRole ?? undefined), at: review.at.toISOString() }
      : undefined,
    reviews: Object.fromEntries(docs.filter((d) => d.review).map((d) => [d.id, d.review as DocumentReviewDTO])),
  };
}
