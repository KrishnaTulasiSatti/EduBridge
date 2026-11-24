import crypto from 'node:crypto';
import type { Request } from 'express';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import {
  EDUCATION_LEVELS,
  NEED_LEVELS,
  PLEDGE_HOLD_DAYS,
  SPONSORSHIP_STATUSES,
  matchScore,
  type ApplicationStatus,
  type BankDetailsDTO,
  type BankDetailsForSponsorDTO,
  type BankDetailsInput,
  type CancelReason,
  type ConfirmSponsorshipInput,
  type EducationLevel,
  type ExpenseKey,
  type MarkSentInput,
  type NeedLevel,
  type PledgeInput,
  type Role,
  type SpecialCircumstance,
  type SponsorPreferences,
  type SponsorProfileDTO,
  type SponsorStudentCardDTO,
  type SponsorshipDTO,
  type SponsorshipOverviewDTO,
  type SponsorshipStatus,
  type SponsorVisibilityInput,
  type StudentFundingDTO,
} from '@edubridge/shared';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { decryptField, encryptField } from '../../utils/fieldCrypto';
import { Application, StudentDocument, nextSequence } from '../applications/models';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { User } from '../auth/user.model';
import { issueCertificate, toCertificateDTO } from './certificates';
import { BankAccount, Certificate, SponsorProfile, Sponsorship, type SponsorshipDoc } from './models';

type Actor = { id: string; role: Role };
type Plain = Record<string, unknown>;

/** Approved applications that can still receive pledges. */
const FUNDABLE: ApplicationStatus[] = ['APPROVED', 'PARTIALLY_FUNDED'];
/** Approved applications, funded or not. */
const FUNDED: ApplicationStatus[] = ['APPROVED', 'PARTIALLY_FUNDED', 'FULLY_FUNDED'];
const ACTIVE: SponsorshipStatus[] = ['PLEDGED', 'SENT', 'CONFIRMED'];
/** Active but not yet received: the amount counts as pledged. */
const AWAITING: SponsorshipStatus[] = ['PLEDGED', 'SENT'];
const DAY = 24 * 60 * 60 * 1000;

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const isObjectId = (id: string) => Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;

/* ------------------------------------------------------------ Helpers */

/** Stable pseudonym for an application. A keyed hash, so it cannot be traced back without the server secret. */
export function studentAlias(applicationId: unknown) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const h = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`student-alias:${String(applicationId)}`).digest();
  return `Student ${Array.from(h.subarray(0, 6), (b) => alphabet[b % alphabet.length]).join('')}`;
}

interface FundingFields {
  decision?: { approvedAmount?: number | null; needLevel?: string; at?: Date } | null;
  funding?: { pledged?: number | null; confirmed?: number | null } | null;
}
function amounts(a: FundingFields) {
  const approved = a.decision?.approvedAmount ?? 0;
  const pledged = a.funding?.pledged ?? 0;
  const confirmed = a.funding?.confirmed ?? 0;
  return { approved, pledged, confirmed, remaining: Math.max(0, approved - pledged - confirmed) };
}

/** Runs `fn` in a MongoDB transaction, so funding totals and sponsorship records always change together. */
async function withTxn<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out: T | undefined;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out as T;
  } finally {
    await session.endSession();
  }
}

/** Keeps the application status in step with confirmed funding. */
async function syncFundingStatus(applicationId: unknown, actorId: string | undefined, session: ClientSession) {
  const app = await Application.findById(applicationId).session(session);
  if (!app || !FUNDED.includes(app.status as ApplicationStatus)) return;
  const { approved, confirmed } = amounts(app);
  const target: ApplicationStatus = confirmed <= 0 ? 'APPROVED' : confirmed >= approved ? 'FULLY_FUNDED' : 'PARTIALLY_FUNDED';
  if (app.status === target) return;
  app.status = target;
  app.history.push({ status: target, at: new Date(), by: actorId ? new Types.ObjectId(actorId) : undefined });
  await app.save({ session });
}

/* --------------------------------------------------- Sponsor profile */

function toProfileDTO(p: Plain & { updatedAt: Date }): SponsorProfileDTO {
  const budget = p.budget as number;
  const committed = (p.committed as number) ?? 0;
  return {
    displayName: p.displayName as string,
    showNameToStudents: p.showNameToStudents as boolean,
    budget,
    levels: (p.levels as SponsorPreferences['levels']) ?? [],
    categories: (p.categories as SponsorPreferences['categories']) ?? [],
    states: (p.states as SponsorPreferences['states']) ?? [],
    circumstances: (p.circumstances as SponsorPreferences['circumstances']) ?? [],
    committed,
    confirmed: (p.confirmed as number) ?? 0,
    available: Math.max(0, budget - committed),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function getPreferences(user: Actor) {
  await releaseExpired();
  const p = await SponsorProfile.findOne({ user: user.id }).lean();
  return { profile: p ? toProfileDTO(p as unknown as Plain & { updatedAt: Date }) : null };
}

export async function savePreferences(user: Actor, input: SponsorPreferences, req: Request) {
  // The budget can be lowered, but never below what is already committed. The check is part of the update.
  const updated = await SponsorProfile.findOneAndUpdate(
    { user: user.id, committed: { $lte: input.budget } },
    { $set: input },
    { new: true },
  ).lean();
  let profile = updated as unknown as (Plain & { _id: unknown; updatedAt: Date }) | null;
  if (!profile) {
    const existing = await SponsorProfile.findOne({ user: user.id }).select('committed').lean();
    if (existing) {
      throw AppError.badRequest(`Your budget cannot be lower than the ${inr(existing.committed)} you have already committed`, {
        budget: [`At least ${inr(existing.committed)}`],
      });
    }
    profile = (await SponsorProfile.create({ user: user.id, ...input })).toObject() as unknown as Plain & { _id: unknown; updatedAt: Date };
  }
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSOR_PREFERENCES_UPDATED,
    resourceType: 'SponsorProfile',
    resourceId: String(profile._id),
    metadata: { budget: input.budget, levels: input.levels, categories: input.categories, states: input.states.length, circumstances: input.circumstances },
    req,
  });
  return { profile: toProfileDTO(profile) };
}

async function requireProfile(userId: string) {
  const p = await SponsorProfile.findOne({ user: userId });
  if (!p) throw new AppError(409, 'PREFERENCES_REQUIRED', 'Set your budget and preferences first');
  return p;
}

/* ----------------------------------------------------- Discovery */

const SPONSOR_APP_FIELDS = 'status academicYear decision funding sponsorVisibility profileSnapshot family.circumstances support.expenses';

type LeanApp = Plain & {
  _id: Types.ObjectId;
  status: string;
  academicYear: string;
  decision?: { approvedAmount?: number; needLevel: NeedLevel; at: Date };
  funding?: { pledged?: number; confirmed?: number };
  sponsorVisibility?: { visible: boolean; noteToSponsors?: string };
  profileSnapshot?: { personal?: { state?: string }; education?: Plain };
  family?: { circumstances?: SpecialCircumstance[] };
  support?: { expenses?: Partial<Record<ExpenseKey, number>> };
};

async function verifiedCounts(ids: Types.ObjectId[]) {
  const rows = await StudentDocument.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { application: { $in: ids }, status: 'VERIFIED' } },
    { $group: { _id: '$application', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

function toCard(a: LeanApp, profile: { levels: string[]; categories: string[]; states: string[]; circumstances: string[]; available: number }, verified: number, mine?: SponsorStudentCardDTO['mySponsorship']): SponsorStudentCardDTO {
  const edu = (a.profileSnapshot?.education ?? {}) as Plain;
  const m = amounts(a);
  const circumstances = a.family?.circumstances ?? [];
  const expenses = a.support?.expenses ?? {};
  return {
    id: String(a._id),
    alias: studentAlias(a._id),
    level: edu.level as EducationLevel | undefined,
    course: edu.course as string | undefined,
    specialization: (edu.specialization as string) || undefined,
    currentYear: edu.currentYear as number | undefined,
    durationYears: edu.durationYears as number | undefined,
    state: a.profileSnapshot?.personal?.state,
    lastExamPercentage: edu.lastExamPercentage as number | undefined,
    academicYear: a.academicYear,
    needLevel: a.decision!.needLevel,
    circumstances,
    expenses,
    approvedAmount: m.approved,
    pledged: m.pledged,
    confirmed: m.confirmed,
    remaining: m.remaining,
    noteToSponsors: a.sponsorVisibility?.noteToSponsors || undefined,
    verifiedDocuments: verified,
    approvedAt: a.decision!.at.toISOString(),
    match: matchScore(
      profile as Parameters<typeof matchScore>[0],
      profile.available,
      { level: edu.level as EducationLevel | undefined, state: a.profileSnapshot?.personal?.state, expenses, circumstances, remaining: m.remaining },
    ),
    mySponsorship: mine,
  };
}

const NEED_ORDER: Record<NeedLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const discoverQuery = z.object({
  sort: z.enum(['match', 'need', 'remaining']).default('match'),
  level: z.enum(EDUCATION_LEVELS).optional(),
  need: z.enum(NEED_LEVELS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

/** Approved students who agreed to be shown, still needing support, ranked for this sponsor. */
export async function discover(user: Actor, query: unknown) {
  const q = discoverQuery.parse(query);
  await releaseExpired();
  const p = await requireProfile(user.id);
  const available = Math.max(0, p.budget - p.committed);
  const filter: Plain = { status: { $in: FUNDABLE }, 'sponsorVisibility.visible': true };
  if (q.level) filter['profileSnapshot.education.level'] = q.level;
  if (q.need) filter['decision.needLevel'] = q.need;

  const apps = (await Application.find(filter).select(SPONSOR_APP_FIELDS).lean()) as unknown as LeanApp[];
  const open = apps.filter((a) => amounts(a).remaining > 0);
  const [verified, mine] = await Promise.all([
    verifiedCounts(open.map((a) => a._id)),
    Sponsorship.find({ sponsor: user.id, active: true, application: { $in: open.map((a) => a._id) } }).select('application status amount').lean(),
  ]);
  const mineBy = new Map(mine.map((s) => [String(s.application), { id: String(s._id), status: s.status as SponsorshipStatus, amount: s.amount }]));
  const prefs = { levels: p.levels, categories: p.categories, states: p.states, circumstances: p.circumstances, available };
  const cards = open.map((a) => toCard(a, prefs, verified.get(String(a._id)) ?? 0, mineBy.get(String(a._id))));

  // Ties are broken by financial need, then by who has waited longest since approval.
  const byNeed = (x: SponsorStudentCardDTO, y: SponsorStudentCardDTO) => NEED_ORDER[x.needLevel] - NEED_ORDER[y.needLevel];
  const byAge = (x: SponsorStudentCardDTO, y: SponsorStudentCardDTO) => x.approvedAt.localeCompare(y.approvedAt);
  cards.sort((x, y) => {
    if (q.sort === 'need') return byNeed(x, y) || y.match.score - x.match.score || byAge(x, y);
    if (q.sort === 'remaining') return y.remaining - x.remaining || byNeed(x, y) || byAge(x, y);
    return y.match.score - x.match.score || byNeed(x, y) || y.remaining - x.remaining || byAge(x, y);
  });

  const start = (q.page - 1) * q.limit;
  return { items: cards.slice(start, start + q.limit), total: cards.length, page: q.page, limit: q.limit, available };
}

/** One student's anonymised profile, for a sponsor. */
export async function studentForSponsor(user: Actor, id: string) {
  if (!isObjectId(id)) throw AppError.notFound('Student not found');
  await releaseExpired();
  const p = await requireProfile(user.id);
  const a = (await Application.findOne({ _id: id, status: { $in: FUNDED }, 'sponsorVisibility.visible': true })
    .select(SPONSOR_APP_FIELDS)
    .lean()) as unknown as LeanApp | null;
  // A sponsor who already supports a student may still open their profile after the student hides it.
  const mine = await Sponsorship.findOne({ sponsor: user.id, application: id, active: true }).select('status amount').lean();
  const app = a ?? (mine ? ((await Application.findById(id).select(SPONSOR_APP_FIELDS).lean()) as unknown as LeanApp | null) : null);
  if (!app || !app.decision) throw AppError.notFound('Student not found');
  const available = Math.max(0, p.budget - p.committed);
  const verified = await verifiedCounts([app._id]);
  return {
    student: toCard(
      app,
      { levels: p.levels, categories: p.categories, states: p.states, circumstances: p.circumstances, available },
      verified.get(String(app._id)) ?? 0,
      mine ? { id: String(mine._id), status: mine.status as SponsorshipStatus, amount: mine.amount } : undefined,
    ),
    available,
  };
}

/* ------------------------------------------------------ Sponsorships */

type Viewer = 'SPONSOR' | 'STUDENT' | 'ADMIN';

async function toDTOs(list: SponsorshipDoc[] | Plain[], viewer: Viewer): Promise<SponsorshipDTO[]> {
  const items = list as unknown as (Plain & { _id: Types.ObjectId; application: Types.ObjectId; sponsor: Types.ObjectId; student: Types.ObjectId })[];
  if (!items.length) return [];
  const kind = viewer === 'STUDENT' ? 'STUDENT_AWARD' : 'SPONSOR_ACKNOWLEDGEMENT';
  const [apps, certs, users, banks] = await Promise.all([
    Application.find({ _id: { $in: items.map((s) => s.application) } }).select('applicationNumber profileSnapshot.education').lean(),
    Certificate.find({ sponsorship: { $in: items.map((s) => s._id) }, kind }).select('number code issuedAt revokedAt sponsorship').lean(),
    viewer === 'ADMIN'
      ? User.find({ _id: { $in: [...items.map((s) => s.sponsor), ...items.map((s) => s.student)] } }).select('fullName email').lean()
      : Promise.resolve([]),
    viewer === 'SPONSOR'
      ? BankAccount.find({ user: { $in: items.map((s) => s.student) } }).select('user').lean()
      : Promise.resolve([]),
  ]);
  const hasBank = new Set(banks.map((b) => String(b.user)));
  const appBy = new Map(apps.map((a) => [String(a._id), a]));
  const certBy = new Map(certs.map((c) => [String(c.sponsorship), c]));
  const userBy = new Map(users.map((u) => [String(u._id), u]));

  return items.map((s) => {
    const app = appBy.get(String(s.application));
    const edu = (app?.profileSnapshot as { education?: Plain } | undefined)?.education ?? {};
    const cert = certBy.get(String(s._id));
    const conf = s.confirmation as Plain | undefined;
    const pay = s.payment as Plain | undefined;
    const canc = s.cancellation as Plain | undefined;
    const anonymous = !(s.showNameToStudent as boolean);
    const sponsorUser = userBy.get(String(s.sponsor));
    const studentUser = userBy.get(String(s.student));
    return {
      id: String(s._id),
      reference: s.reference as string,
      status: s.status as SponsorshipStatus,
      amount: s.amount as number,
      academicYear: s.academicYear as string,
      createdAt: (s.createdAt as Date).toISOString(),
      expiresAt: s.status === 'PLEDGED' && s.expiresAt ? (s.expiresAt as Date).toISOString() : undefined,
      payment: pay?.sentOn
        ? {
            sentOn: pay.sentOn as string,
            reference: pay.reference as string,
            note: (pay.note as string) || undefined,
            toAccountLast4: (pay.toAccountLast4 as string) || undefined,
            notReceived: pay.notReceivedAt ? { at: (pay.notReceivedAt as Date).toISOString(), note: (pay.notReceivedNote as string) || undefined } : undefined,
          }
        : undefined,
      studentBankReady: viewer === 'SPONSOR' ? hasBank.has(String(s.student)) : undefined,
      confirmedAt: conf?.at ? (conf.at as Date).toISOString() : undefined,
      cancelledAt: canc?.at ? (canc.at as Date).toISOString() : undefined,
      cancelReason: canc?.reason as CancelReason | undefined,
      cancelNote: viewer === 'STUDENT' ? undefined : (canc?.note as string) || undefined,
      messageToStudent: (s.messageToStudent as string) || undefined,
      student: {
        applicationId: String(s.application),
        alias: studentAlias(s.application),
        course: edu.course as string | undefined,
        level: edu.level as EducationLevel | undefined,
        name: viewer === 'ADMIN' ? studentUser?.fullName : undefined,
        applicationNumber: viewer === 'ADMIN' ? app?.applicationNumber : undefined,
      },
      sponsor: {
        name: viewer === 'STUDENT' && anonymous ? 'An EduBridge sponsor' : (s.sponsorName as string),
        anonymous,
        email: viewer === 'ADMIN' ? sponsorUser?.email : undefined,
      },
      confirmation:
        conf && viewer !== 'STUDENT'
          ? { receivedOn: conf.receivedOn as string, reference: conf.reference as string, note: (conf.note as string) || undefined, byStudent: !!conf.byStudent }
          : conf
            ? { receivedOn: conf.receivedOn as string, byStudent: !!conf.byStudent }
            : undefined,
      certificate: cert ? { number: cert.number, code: cert.code, issuedAt: cert.issuedAt.toISOString(), revoked: !!cert.revokedAt } : undefined,
    };
  });
}

export async function pledge(user: Actor, applicationId: string, input: PledgeInput, req: Request) {
  if (!isObjectId(applicationId)) throw AppError.notFound('Student not found');
  await releaseExpired();
  const profile = await requireProfile(user.id);
  const app = await Application.findOne({ _id: applicationId, status: { $in: FUNDABLE }, 'sponsorVisibility.visible': true });
  if (!app) throw AppError.notFound('This student is not available for sponsorship');

  const { remaining } = amounts(app);
  const available = Math.max(0, profile.budget - profile.committed);
  if (remaining <= 0) throw AppError.conflict('This student’s requirement is already fully covered');
  if (input.amount > remaining) {
    throw AppError.badRequest(`The student needs ${inr(remaining)} more. Please pledge that amount or less.`, { amount: [`At most ${inr(remaining)}`] });
  }
  if (input.amount > available) {
    throw AppError.badRequest(`You have ${inr(available)} of your budget available.`, { amount: [`At most ${inr(available)} (your available budget)`] });
  }
  if (await Sponsorship.exists({ sponsor: user.id, application: app._id, active: true })) {
    throw AppError.conflict('You are already supporting this student. You can withdraw your pledge and pledge again until you send the money.');
  }

  const reference = await nextSequence('SP', 'sponsorship');
  const amount = input.amount;
  let created: SponsorshipDoc;
  try {
    created = await withTxn(async (session) => {
      // Both totals are checked inside the update, so two sponsors pledging at once can never over-fund a student.
      const a = await Application.findOneAndUpdate(
        {
          _id: app._id,
          status: { $in: FUNDABLE },
          'sponsorVisibility.visible': true,
          $expr: {
            $lte: [{ $add: [{ $ifNull: ['$funding.pledged', 0] }, { $ifNull: ['$funding.confirmed', 0] }, amount] }, { $ifNull: ['$decision.approvedAmount', 0] }],
          },
        },
        { $inc: { 'funding.pledged': amount } },
        { session, new: true },
      );
      if (!a) throw AppError.conflict('Another sponsor has just supported this student, so the remaining amount has changed. Please check it and try again.');
      const p = await SponsorProfile.findOneAndUpdate(
        { user: user.id, $expr: { $lte: [{ $add: ['$committed', amount] }, '$budget'] } },
        { $inc: { committed: amount } },
        { session, new: true },
      );
      if (!p) throw AppError.conflict('Your available budget has changed. Please check it and try again.');
      const [doc] = await Sponsorship.create(
        [
          {
            reference,
            sponsor: user.id,
            application: app._id,
            student: app.student,
            academicYear: app.academicYear,
            amount,
            status: 'PLEDGED',
            active: true,
            sponsorName: profile.displayName,
            showNameToStudent: profile.showNameToStudents,
            messageToStudent: input.messageToStudent || undefined,
            expiresAt: new Date(Date.now() + PLEDGE_HOLD_DAYS * DAY),
          },
        ],
        { session },
      );
      return doc;
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw AppError.conflict('You are already supporting this student.');
    throw e;
  }

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSORSHIP_PLEDGED,
    resourceType: 'Sponsorship',
    resourceId: created.id,
    metadata: { reference, applicationNumber: app.applicationNumber, amount, remainingBefore: remaining },
    req,
  });
  const [dto] = await toDTOs([created.toObject()], 'SPONSOR');
  return { sponsorship: dto };
}

export async function sponsorSponsorships(user: Actor) {
  await releaseExpired();
  const list = await Sponsorship.find({ sponsor: user.id }).sort({ createdAt: -1 }).lean();
  return { items: await toDTOs(list, 'SPONSOR') };
}

/* ------------------------------------------------------ Cancellation */

async function cancelInternal(id: unknown, reason: CancelReason, actor: Actor | null, note: string | undefined, req?: Request, sponsorId?: string) {
  let snapshot: { reference: string; amount: number; wasConfirmed: boolean; application: unknown } | undefined;
  await withTxn(async (session) => {
    const filter: Plain = { _id: id, status: { $in: reason === 'BY_ADMIN' ? ACTIVE : ['PLEDGED'] } };
    if (sponsorId) filter.sponsor = sponsorId;
    const s = await Sponsorship.findOne(filter).session(session);
    if (!s) throw AppError.conflict(sponsorId ? 'A pledge can only be withdrawn before the money is sent' : 'This sponsorship is no longer active');
    const wasConfirmed = s.status === 'CONFIRMED';
    s.status = 'CANCELLED';
    s.set('active', undefined);
    s.set('expiresAt', undefined);
    s.set('cancellation', { reason, note: note || undefined, by: actor ? new Types.ObjectId(actor.id) : undefined, at: new Date(), wasConfirmed });
    await s.save({ session });
    await Application.updateOne({ _id: s.application }, { $inc: { [wasConfirmed ? 'funding.confirmed' : 'funding.pledged']: -s.amount } }, { session });
    await SponsorProfile.updateOne({ user: s.sponsor }, { $inc: wasConfirmed ? { committed: -s.amount, confirmed: -s.amount } : { committed: -s.amount } }, { session });
    if (wasConfirmed) {
      await Certificate.updateMany({ sponsorship: s._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
      await syncFundingStatus(s.application, actor?.id, session);
    }
    snapshot = { reference: s.reference, amount: s.amount, wasConfirmed, application: s.application };
  });
  const s = snapshot!;
  await audit({
    actorId: actor?.id,
    actorRole: actor?.role,
    action: reason === 'EXPIRED' ? AUDIT_ACTIONS.SPONSORSHIP_EXPIRED : AUDIT_ACTIONS.SPONSORSHIP_CANCELLED,
    resourceType: 'Sponsorship',
    resourceId: String(id),
    metadata: { reference: s.reference, amount: s.amount, reason, note, wasConfirmed: s.wasConfirmed },
    req,
  });
  if (s.wasConfirmed) {
    await audit({
      actorId: actor?.id,
      actorRole: actor?.role,
      action: AUDIT_ACTIONS.CERTIFICATE_REVOKED,
      resourceType: 'Sponsorship',
      resourceId: String(id),
      metadata: { reference: s.reference },
      req,
    });
  }
}

/** Pledges whose money was not sent in time release their reserved amount. Runs lazily before sponsorship reads. */
export async function releaseExpired() {
  const due = await Sponsorship.find({ status: 'PLEDGED', expiresAt: { $lte: new Date() } }).select('_id').limit(100).lean();
  for (const s of due) {
    await cancelInternal(s._id, 'EXPIRED', null, undefined).catch(() => undefined);
  }
}

export async function withdrawPledge(user: Actor, id: string, req: Request) {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  if (!(await Sponsorship.exists({ _id: id, sponsor: user.id }))) throw AppError.notFound('Sponsorship not found');
  await cancelInternal(id, 'BY_SPONSOR', user, undefined, req, user.id);
  return sponsorSponsorships(user);
}

export async function adminCancel(user: Actor, id: string, note: string | undefined, req: Request) {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  if (!(await Sponsorship.exists({ _id: id }))) throw AppError.notFound('Sponsorship not found');
  await cancelInternal(id, 'BY_ADMIN', user, note, req);
  return adminSponsorship(id);
}

/* ------------------------------------------------------ Confirmation */

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Marks the money as received: moves it from pledged to confirmed, updates the application status
 * and issues signed certificates to both sides. Called by the student, or by an administrator.
 */
async function confirmInternal(
  filter: Plain,
  actor: Actor,
  details: (s: SponsorshipDoc) => { receivedOn: string; reference: string; note?: string },
  req: Request,
) {
  const byStudent = actor.role === 'STUDENT';
  const result = await withTxn(async (session) => {
    const s = await Sponsorship.findOne(filter).session(session);
    if (!s) throw AppError.conflict(byStudent ? 'Only money the sponsor has marked as sent can be confirmed' : 'This sponsorship cannot be confirmed now');
    const d = details(s);
    if (d.receivedOn < s.createdAt.toISOString().slice(0, 10)) {
      throw AppError.badRequest('The date received cannot be before the pledge was made', { receivedOn: ['Before the pledge date'] });
    }
    s.status = 'CONFIRMED';
    s.set('expiresAt', undefined);
    s.set('confirmation', { receivedOn: d.receivedOn, reference: d.reference, note: d.note || undefined, by: new Types.ObjectId(actor.id), byStudent, at: new Date() });
    await s.save({ session });
    await Application.updateOne({ _id: s.application }, { $inc: { 'funding.pledged': -s.amount, 'funding.confirmed': s.amount } }, { session });
    await SponsorProfile.updateOne({ user: s.sponsor }, { $inc: { confirmed: s.amount } }, { session });
    await syncFundingStatus(s.application, actor.id, session);

    const app = await Application.findById(s.application).select('profileSnapshot.education').session(session).lean();
    const student = await User.findById(s.student).select('fullName').session(session).lean();
    const edu = (app?.profileSnapshot as { education?: Plain } | undefined)?.education ?? {};
    const common = {
      sponsorship: s._id,
      sponsorshipReference: s.reference,
      studentAlias: studentAlias(s.application),
      course: edu.course as string | undefined,
      level: edu.level as EducationLevel | undefined,
      academicYear: s.academicYear,
      amount: s.amount,
    };
    const forSponsor = await issueCertificate({ ...common, kind: 'SPONSOR_ACKNOWLEDGEMENT', sponsorName: s.sponsorName, holder: s.sponsor }, session);
    const forStudent = await issueCertificate(
      { ...common, kind: 'STUDENT_AWARD', sponsorName: s.showNameToStudent ? s.sponsorName : 'An EduBridge sponsor', studentName: student?.fullName ?? 'Student', holder: s.student },
      session,
    );
    return { id: String(s._id), reference: s.reference, amount: s.amount, receivedOn: d.receivedOn, paymentReference: d.reference, certificates: [forSponsor.number, forStudent.number] };
  });

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT_ACTIONS.SPONSORSHIP_CONFIRMED,
    resourceType: 'Sponsorship',
    resourceId: result.id,
    metadata: { reference: result.reference, amount: result.amount, receivedOn: result.receivedOn, paymentReference: result.paymentReference, confirmedBy: byStudent ? 'STUDENT' : 'ADMIN' },
    req,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT_ACTIONS.CERTIFICATE_ISSUED,
    resourceType: 'Sponsorship',
    resourceId: result.id,
    metadata: { reference: result.reference, certificates: result.certificates },
    req,
  });
}

/** An administrator records the money as received, e.g. to settle a "not received" report. */
export async function confirm(user: Actor, id: string, input: ConfirmSponsorshipInput, req: Request) {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  if (input.receivedOn > today()) throw AppError.badRequest('The date received cannot be in the future', { receivedOn: ['Cannot be in the future'] });
  await confirmInternal({ _id: id, status: { $in: AWAITING } }, user, () => ({ receivedOn: input.receivedOn, reference: input.reference, note: input.note || undefined }), req);
  return adminSponsorship(id);
}

/* ------------------------------------------- Direct transfer to student */

function toBankDTO(b: { accountHolderName: string; accountNumberLast4: string; ifsc: string; bankName: string; updatedAt: Date }): BankDetailsDTO {
  return { accountHolderName: b.accountHolderName, accountNumberLast4: b.accountNumberLast4, ifsc: b.ifsc, bankName: b.bankName, updatedAt: b.updatedAt.toISOString() };
}

/** The student saves the bank account sponsors will send money to. */
export async function saveBankDetails(user: Actor, input: BankDetailsInput, req: Request) {
  const app = await latestApplication(user.id);
  if (!app || !FUNDED.includes(app.status as ApplicationStatus)) {
    throw AppError.conflict('You can add bank details once your application is approved');
  }
  const existed = await BankAccount.exists({ user: user.id });
  await BankAccount.findOneAndUpdate(
    { user: user.id },
    {
      $set: {
        accountHolderName: input.accountHolderName,
        accountNumberEnc: encryptField(input.accountNumber),
        accountNumberLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        bankName: input.bankName,
      },
    },
    { upsert: true, new: true },
  );
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.BANK_DETAILS_SAVED,
    resourceType: 'BankAccount',
    resourceId: user.id,
    metadata: { accountNumberLast4: input.accountNumber.slice(-4), ifsc: input.ifsc, updated: !!existed },
    req,
  });
  return studentFunding(user);
}

/** The full bank details, shown to the sponsor only while they still have to send (or re-send) the money. Audited. */
export async function bankDetailsForSponsor(user: Actor, id: string, req: Request): Promise<{ bankDetails: BankDetailsForSponsorDTO }> {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  const s = await Sponsorship.findOne({ _id: id, sponsor: user.id }).lean();
  if (!s) throw AppError.notFound('Sponsorship not found');
  if (!AWAITING.includes(s.status as SponsorshipStatus)) throw AppError.conflict('Bank details are only shown while the money is still to be sent');
  const b = await BankAccount.findOne({ user: s.student }).lean();
  if (!b) throw new AppError(409, 'BANK_DETAILS_MISSING', 'The student has not added bank details yet');
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.BANK_DETAILS_VIEWED,
    resourceType: 'Sponsorship',
    resourceId: id,
    metadata: { reference: s.reference, accountNumberLast4: b.accountNumberLast4 },
    req,
  });
  return { bankDetails: { accountHolderName: b.accountHolderName, accountNumber: decryptField(b.accountNumberEnc), ifsc: b.ifsc, bankName: b.bankName } };
}

/** The sponsor records that they transferred the money. The student then confirms it arrived. */
export async function markSent(user: Actor, id: string, input: MarkSentInput, req: Request) {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  if (input.sentOn > today()) throw AppError.badRequest('The date cannot be in the future', { sentOn: ['Cannot be in the future'] });
  await releaseExpired();
  const s = await Sponsorship.findOne({ _id: id, sponsor: user.id });
  if (!s) throw AppError.notFound('Sponsorship not found');
  // Sent again only after the student reported the first transfer as not received.
  const resend = s.status === 'SENT' && !!s.payment?.notReceivedAt;
  if (s.status !== 'PLEDGED' && !resend) throw AppError.conflict('This sponsorship is not waiting for a payment');
  if (input.sentOn < s.createdAt.toISOString().slice(0, 10)) throw AppError.badRequest('The date cannot be before the pledge was made', { sentOn: ['Before the pledge date'] });
  const b = await BankAccount.findOne({ user: s.student }).select('accountNumberLast4').lean();
  if (!b) throw new AppError(409, 'BANK_DETAILS_MISSING', 'The student has not added bank details yet');

  const updated = await Sponsorship.findOneAndUpdate(
    { _id: id, sponsor: user.id, status: s.status },
    {
      $set: {
        status: 'SENT',
        payment: { sentOn: input.sentOn, reference: input.reference, note: input.note || undefined, toAccountLast4: b.accountNumberLast4, at: new Date() },
      },
      $unset: { expiresAt: 1 },
    },
    { new: true },
  );
  if (!updated) throw AppError.conflict('This sponsorship has just changed. Please reload and try again.');
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSORSHIP_SENT,
    resourceType: 'Sponsorship',
    resourceId: id,
    metadata: { reference: s.reference, amount: s.amount, sentOn: input.sentOn, paymentReference: input.reference, toAccountLast4: b.accountNumberLast4, resend },
    req,
  });
  return sponsorSponsorships(user);
}

/** The student confirms the money arrived in their account. Certificates are issued. */
export async function confirmReceived(user: Actor, id: string, req: Request) {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  if (!(await Sponsorship.exists({ _id: id, student: user.id }))) throw AppError.notFound('Sponsorship not found');
  await confirmInternal({ _id: id, student: user.id, status: 'SENT' }, user, (s) => ({ receivedOn: today(), reference: s.payment?.reference ?? '' }), req);
  return studentFunding(user);
}

/** The student says the money has not arrived. The sponsor sees this and an administrator can follow up. */
export async function reportNotReceived(user: Actor, id: string, note: string | undefined, req: Request) {
  if (!isObjectId(id)) throw AppError.notFound('Sponsorship not found');
  const s = await Sponsorship.findOneAndUpdate(
    { _id: id, student: user.id, status: 'SENT' },
    { $set: { 'payment.notReceivedAt': new Date(), 'payment.notReceivedNote': note || undefined } },
    { new: true },
  );
  if (!s) throw AppError.conflict('Only money the sponsor has marked as sent can be reported');
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSORSHIP_NOT_RECEIVED,
    resourceType: 'Sponsorship',
    resourceId: id,
    metadata: { reference: s.reference, amount: s.amount, paymentReference: s.payment?.reference, note },
    req,
  });
  return studentFunding(user);
}

/* ------------------------------------------------------------ Admin */

async function adminSponsorship(id: string) {
  const s = await Sponsorship.findById(id).lean();
  if (!s) throw AppError.notFound('Sponsorship not found');
  const [dto] = await toDTOs([s], 'ADMIN');
  return { sponsorship: dto };
}

const adminQuery = z.object({
  status: z.enum(SPONSORSHIP_STATUSES).optional(),
  search: z.string().trim().max(80).optional(),
  application: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export async function adminList(query: unknown) {
  const q = adminQuery.parse(query);
  await releaseExpired();
  const filter: Plain = {};
  if (q.status) filter.status = q.status;
  if (q.application && isObjectId(q.application)) filter.application = q.application;
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [students, apps] = await Promise.all([
      User.find({ role: 'STUDENT', fullName: rx }).select('_id').lean(),
      Application.find({ applicationNumber: rx }).select('_id').lean(),
    ]);
    filter.$or = [{ reference: rx }, { sponsorName: rx }, { student: { $in: students.map((u) => u._id) } }, { application: { $in: apps.map((a) => a._id) } }];
  }
  // Money reported as not received first, then sponsorships still waiting for money (oldest first), then the rest.
  const [list, total] = await Promise.all([
    Sponsorship.aggregate([
      { $match: filter },
      {
        $addFields: {
          _order: { $cond: [{ $ifNull: ['$payment.notReceivedAt', false] }, 0, { $cond: [{ $in: ['$status', AWAITING] }, 1, 2] }] },
          _pledgedFirst: { $cond: [{ $in: ['$status', AWAITING] }, '$createdAt', null] },
        },
      },
      { $sort: { _order: 1, _pledgedFirst: 1, updatedAt: -1 } },
      { $skip: (q.page - 1) * q.limit },
      { $limit: q.limit },
    ]),
    Sponsorship.countDocuments(filter),
  ]);
  return { items: await toDTOs(list, 'ADMIN'), total, page: q.page, limit: q.limit };
}

export async function overview(): Promise<SponsorshipOverviewDTO> {
  await releaseExpired();
  const [byStatus, funded, sponsors] = await Promise.all([
    Sponsorship.aggregate<{ _id: SponsorshipStatus; n: number; amount: number }>([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Application.find({ status: { $in: FUNDED } }).select('status decision.approvedAmount funding sponsorVisibility.visible').lean(),
    SponsorProfile.countDocuments(),
  ]);
  const get = (s: SponsorshipStatus) => byStatus.find((b) => b._id === s);
  return {
    totals: {
      pledged: (get('PLEDGED')?.amount ?? 0) + (get('SENT')?.amount ?? 0),
      confirmed: get('CONFIRMED')?.amount ?? 0,
      remaining: funded.reduce((sum, a) => sum + amounts(a).remaining, 0),
      eligibleStudents: funded.filter((a) => a.status !== 'FULLY_FUNDED').length,
      visibleStudents: funded.filter((a) => a.status !== 'FULLY_FUNDED' && a.sponsorVisibility?.visible).length,
      fullyFunded: funded.filter((a) => a.status === 'FULLY_FUNDED').length,
      sponsors,
    },
    counts: Object.fromEntries(SPONSORSHIP_STATUSES.map((s) => [s, get(s)?.n ?? 0])) as Record<SponsorshipStatus, number>,
  };
}

/* ---------------------------------------------------------- Student */

async function latestApplication(userId: string) {
  return Application.findOne({ student: userId, status: { $ne: 'DRAFT' } }).sort({ createdAt: -1 });
}

export async function studentFunding(user: Actor): Promise<StudentFundingDTO> {
  await releaseExpired();
  const app = await latestApplication(user.id);
  if (!app) return { eligible: false, status: 'NONE', approvedAmount: 0, pledged: 0, confirmed: 0, remaining: 0, visible: false, sponsorships: [] };
  const m = amounts(app);
  // Withdrawn or expired pledges never counted towards the student's funding, so they are not shown.
  const [list, bank] = await Promise.all([
    Sponsorship.find({ application: app._id, $or: [{ status: { $in: ACTIVE } }, { 'cancellation.wasConfirmed': true }] })
      .sort({ createdAt: -1 })
      .lean(),
    BankAccount.findOne({ user: user.id }).lean(),
  ]);
  return {
    eligible: FUNDED.includes(app.status as ApplicationStatus),
    status: app.status,
    approvedAmount: m.approved,
    pledged: m.pledged,
    confirmed: m.confirmed,
    remaining: m.remaining,
    visible: !!app.sponsorVisibility?.visible,
    visibleSince: app.sponsorVisibility?.visible ? app.sponsorVisibility.at.toISOString() : undefined,
    noteToSponsors: app.sponsorVisibility?.noteToSponsors || undefined,
    alias: FUNDED.includes(app.status as ApplicationStatus) ? studentAlias(app._id) : undefined,
    bankDetails: bank ? toBankDTO(bank) : undefined,
    sponsorships: await toDTOs(list, 'STUDENT'),
  };
}

export async function setVisibility(user: Actor, input: SponsorVisibilityInput, req: Request) {
  const app = await latestApplication(user.id);
  if (!app || !FUNDED.includes(app.status as ApplicationStatus)) {
    throw AppError.conflict('Your profile can be shown to sponsors once your application is approved');
  }
  const before = !!app.sponsorVisibility?.visible;
  app.set('sponsorVisibility', { visible: input.visible, at: new Date(), noteToSponsors: input.noteToSponsors || undefined });
  await app.save();
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSOR_VISIBILITY_CHANGED,
    resourceType: 'Application',
    resourceId: app.id,
    metadata: { applicationNumber: app.applicationNumber, from: before, to: input.visible, note: !!input.noteToSponsors },
    req,
  });
  return studentFunding(user);
}

/* ------------------------------------------------------ Certificates */

/** Public verification. The number and the code printed on the certificate are both needed. */
export async function verifyCertificate(number: string, code: string) {
  const c = await Certificate.findOne({ number: number.trim().toUpperCase() });
  const given = code.trim().toUpperCase();
  const ok = !!c && given.length === c.code.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(c.code));
  if (!c || !ok) throw AppError.notFound('No certificate matches this number and code');
  return { certificate: toCertificateDTO(c) };
}
