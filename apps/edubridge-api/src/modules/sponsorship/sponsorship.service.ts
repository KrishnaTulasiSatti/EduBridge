import crypto from 'node:crypto';
import type { Request } from 'express';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import {
  EDUCATION_LEVELS,
  NEED_LEVELS,
  SPONSORSHIP_STATUSES,
  matchScore,
  type ApplicationStatus,
  type ConnectInput,
  type ContactDTO,
  type EducationLevel,
  type EndReason,
  type ExpenseKey,
  type NeedLevel,
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
import { Application, StudentDocument, nextSequence } from '../applications/models';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { User } from '../auth/user.model';
import * as notify from '../notifications/notify';
import { SponsorProfile, Sponsorship, type SponsorshipDoc } from './models';

/**
 * EduBridge connects sponsors with approved students. A sponsor connects with a student and records the
 * amount they intend to give. Both then see each other's contact details and arrange the support directly.
 * No money moves through EduBridge.
 */

type Actor = { id: string; role: Role };
type Plain = Record<string, unknown>;

/** Approved applications that can still receive connections. */
const OPEN: ApplicationStatus[] = ['APPROVED', 'PARTIALLY_FUNDED'];
/** Approved applications, supported or not. */
const APPROVED: ApplicationStatus[] = ['APPROVED', 'PARTIALLY_FUNDED', 'FULLY_FUNDED'];

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
  funding?: { promised?: number | null } | null;
}
function amounts(a: FundingFields) {
  const approved = a.decision?.approvedAmount ?? 0;
  const promised = a.funding?.promised ?? 0;
  return { approved, promised, remaining: Math.max(0, approved - promised) };
}

/** Runs `fn` in a MongoDB transaction, so totals and connection records always change together. */
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

/** Keeps the application status in step with the amount promised. */
export async function syncFundingStatus(applicationId: unknown, actorId: string | undefined, session?: ClientSession) {
  const app = await Application.findById(applicationId).session(session ?? null);
  if (!app || !APPROVED.includes(app.status as ApplicationStatus)) return;
  const { approved, promised } = amounts(app);
  const target: ApplicationStatus = promised <= 0 ? 'APPROVED' : promised >= approved ? 'FULLY_FUNDED' : 'PARTIALLY_FUNDED';
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
    budget,
    levels: (p.levels as SponsorPreferences['levels']) ?? [],
    categories: (p.categories as SponsorPreferences['categories']) ?? [],
    states: (p.states as SponsorPreferences['states']) ?? [],
    circumstances: (p.circumstances as SponsorPreferences['circumstances']) ?? [],
    committed,
    available: Math.max(0, budget - committed),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function getPreferences(user: Actor) {
  const p = await SponsorProfile.findOne({ user: user.id }).lean();
  return { profile: p ? toProfileDTO(p as unknown as Plain & { updatedAt: Date }) : null };
}

export async function savePreferences(user: Actor, input: SponsorPreferences, req: Request) {
  // The budget can be lowered, but never below what is already promised. The check is part of the update.
  const updated = await SponsorProfile.findOneAndUpdate(
    { user: user.id, committed: { $lte: input.budget } },
    { $set: input },
    { new: true },
  ).lean();
  let profile = updated as unknown as (Plain & { _id: unknown; updatedAt: Date }) | null;
  if (!profile) {
    const existing = await SponsorProfile.findOne({ user: user.id }).select('committed').lean();
    if (existing) {
      throw AppError.badRequest(`Your budget cannot be lower than the ${inr(existing.committed)} you have already promised`, {
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
/** Students are listed only after agreeing to share contact details with sponsors who connect. */
const LISTED = { 'sponsorVisibility.visible': true, 'sponsorVisibility.shareContact': true };

type LeanApp = Plain & {
  _id: Types.ObjectId;
  status: string;
  academicYear: string;
  decision?: { approvedAmount?: number; needLevel: NeedLevel; at: Date };
  funding?: { promised?: number };
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
    promised: m.promised,
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
  const p = await requireProfile(user.id);
  const available = Math.max(0, p.budget - p.committed);
  const filter: Plain = { status: { $in: OPEN }, ...LISTED };
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
  const p = await requireProfile(user.id);
  const a = (await Application.findOne({ _id: id, status: { $in: APPROVED }, ...LISTED })
    .select(SPONSOR_APP_FIELDS)
    .lean()) as unknown as LeanApp | null;
  // A connected sponsor may still open the profile after the student hides it.
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

/* ------------------------------------------------------- Connections */

type Viewer = 'SPONSOR' | 'STUDENT' | 'ADMIN';

async function toDTOs(list: SponsorshipDoc[] | Plain[], viewer: Viewer): Promise<SponsorshipDTO[]> {
  const items = list as unknown as (Plain & { _id: Types.ObjectId; application: Types.ObjectId; sponsor: Types.ObjectId; student: Types.ObjectId })[];
  if (!items.length) return [];
  const [apps, users] = await Promise.all([
    Application.find({ _id: { $in: items.map((s) => s.application) } }).select('applicationNumber profileSnapshot.education').lean(),
    User.find({ _id: { $in: [...items.map((s) => s.sponsor), ...items.map((s) => s.student)] } }).select('fullName email phone').lean(),
  ]);
  const appBy = new Map(apps.map((a) => [String(a._id), a]));
  const userBy = new Map(users.map((u) => [String(u._id), u]));
  const contact = (id: unknown): ContactDTO | undefined => {
    const u = userBy.get(String(id));
    return u ? { fullName: u.fullName, email: u.email, phone: u.phone || undefined } : undefined;
  };

  return items.map((s) => {
    const app = appBy.get(String(s.application));
    const edu = (app?.profileSnapshot as { education?: Plain } | undefined)?.education ?? {};
    const end = s.cancellation as Plain | undefined;
    const connected = s.status === 'CONNECTED';
    return {
      id: String(s._id),
      reference: s.reference as string,
      status: s.status as SponsorshipStatus,
      amount: s.amount as number,
      academicYear: s.academicYear as string,
      createdAt: (s.createdAt as Date).toISOString(),
      endedAt: end?.at ? (end.at as Date).toISOString() : undefined,
      endReason: end?.reason as EndReason | undefined,
      endNote: viewer === 'STUDENT' ? undefined : (end?.note as string) || undefined,
      messageToStudent: (s.messageToStudent as string) || undefined,
      student: {
        applicationId: String(s.application),
        alias: studentAlias(s.application),
        course: edu.course as string | undefined,
        level: edu.level as EducationLevel | undefined,
        applicationNumber: viewer === 'ADMIN' ? app?.applicationNumber : undefined,
        // Contact details are shared only while connected.
        contact: viewer === 'ADMIN' || (viewer === 'SPONSOR' && connected) ? contact(s.student) : undefined,
      },
      sponsor: {
        name: s.sponsorName as string,
        contact: viewer === 'ADMIN' || (viewer === 'STUDENT' && connected) ? contact(s.sponsor) : undefined,
      },
    };
  });
}

/** The sponsor connects with a student and records the amount they intend to give. */
export async function connect(user: Actor, applicationId: string, input: ConnectInput, req: Request) {
  if (!isObjectId(applicationId)) throw AppError.notFound('Student not found');
  const profile = await requireProfile(user.id);
  const app = await Application.findOne({ _id: applicationId, status: { $in: OPEN }, ...LISTED });
  if (!app) throw AppError.notFound('This student is not available for sponsorship');

  const { remaining } = amounts(app);
  const available = Math.max(0, profile.budget - profile.committed);
  if (remaining <= 0) throw AppError.conflict('This student’s requirement is already fully covered');
  if (input.amount > remaining) {
    throw AppError.badRequest(`The student needs ${inr(remaining)} more. Please enter that amount or less.`, { amount: [`At most ${inr(remaining)}`] });
  }
  if (input.amount > available) {
    throw AppError.badRequest(`You have ${inr(available)} of your budget available.`, { amount: [`At most ${inr(available)} (your available budget)`] });
  }
  if (await Sponsorship.exists({ sponsor: user.id, application: app._id, active: true })) {
    throw AppError.conflict('You are already connected with this student.');
  }

  const reference = await nextSequence('SP', 'sponsorship');
  const amount = input.amount;
  let created: SponsorshipDoc;
  try {
    created = await withTxn(async (session) => {
      // Both totals are checked inside the update, so two sponsors connecting at once can never over-cover a student.
      const a = await Application.findOneAndUpdate(
        {
          _id: app._id,
          status: { $in: OPEN },
          ...LISTED,
          $expr: { $lte: [{ $add: [{ $ifNull: ['$funding.promised', 0] }, amount] }, { $ifNull: ['$decision.approvedAmount', 0] }] },
        },
        { $inc: { 'funding.promised': amount } },
        { session, new: true },
      );
      if (!a) throw AppError.conflict('Another sponsor has just connected with this student, so the remaining amount has changed. Please check it and try again.');
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
            status: 'CONNECTED',
            active: true,
            sponsorName: profile.displayName,
            messageToStudent: input.messageToStudent || undefined,
          },
        ],
        { session },
      );
      await syncFundingStatus(app._id, user.id, session);
      return doc;
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw AppError.conflict('You are already connected with this student.');
    throw e;
  }

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSOR_CONNECTED,
    resourceType: 'Sponsorship',
    resourceId: created.id,
    metadata: { reference, applicationNumber: app.applicationNumber, amount, remainingBefore: remaining },
    req,
  });
  notify.connected(created);
  const [dto] = await toDTOs([created.toObject()], 'SPONSOR');
  return { sponsorship: dto };
}

export async function sponsorSponsorships(user: Actor) {
  const list = await Sponsorship.find({ sponsor: user.id }).sort({ status: 1, createdAt: -1 }).lean();
  return { items: await toDTOs(list, 'SPONSOR') };
}

/** Ends a connection and frees the promised amount for the student and the sponsor's budget. */
async function endInternal(id: string, reason: EndReason, actor: Actor, note: string | undefined, req: Request, sponsorId?: string) {
  const snapshot = await withTxn(async (session) => {
    const filter: Plain = { _id: id, status: 'CONNECTED' };
    if (sponsorId) filter.sponsor = sponsorId;
    const s = await Sponsorship.findOne(filter).session(session);
    if (!s) throw AppError.conflict('This connection has already ended');
    s.status = 'ENDED';
    s.set('active', undefined);
    s.set('cancellation', { reason, note: note || undefined, by: new Types.ObjectId(actor.id), at: new Date() });
    await s.save({ session });
    await Application.updateOne({ _id: s.application }, { $inc: { 'funding.promised': -s.amount } }, { session });
    await SponsorProfile.updateOne({ user: s.sponsor }, { $inc: { committed: -s.amount } }, { session });
    await syncFundingStatus(s.application, actor.id, session);
    return { reference: s.reference, amount: s.amount, sponsor: s.sponsor, student: s.student, sponsorName: s.sponsorName, messageToStudent: s.messageToStudent };
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT_ACTIONS.CONNECTION_ENDED,
    resourceType: 'Sponsorship',
    resourceId: id,
    metadata: { reference: snapshot.reference, amount: snapshot.amount, reason, note },
    req,
  });
  notify.connectionEnded(snapshot, reason === 'BY_SPONSOR' ? 'SPONSOR' : 'ADMIN');
}

export async function endBySponsor(user: Actor, id: string, req: Request) {
  if (!isObjectId(id) || !(await Sponsorship.exists({ _id: id, sponsor: user.id }))) throw AppError.notFound('Connection not found');
  await endInternal(id, 'BY_SPONSOR', user, undefined, req, user.id);
  return sponsorSponsorships(user);
}

export async function adminEnd(user: Actor, id: string, note: string | undefined, req: Request) {
  if (!isObjectId(id) || !(await Sponsorship.exists({ _id: id }))) throw AppError.notFound('Connection not found');
  await endInternal(id, 'BY_ADMIN', user, note, req);
  return adminSponsorship(id);
}

/* ------------------------------------------------------------ Admin */

async function adminSponsorship(id: string) {
  const s = await Sponsorship.findById(id).lean();
  if (!s) throw AppError.notFound('Connection not found');
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
  const [list, total] = await Promise.all([
    Sponsorship.find(filter)
      .sort({ status: 1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Sponsorship.countDocuments(filter),
  ]);
  return { items: await toDTOs(list, 'ADMIN'), total, page: q.page, limit: q.limit };
}

export async function overview(): Promise<SponsorshipOverviewDTO> {
  const [byStatus, approved, sponsors] = await Promise.all([
    Sponsorship.aggregate<{ _id: SponsorshipStatus; n: number; amount: number }>([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Application.find({ status: { $in: APPROVED } }).select('status decision.approvedAmount funding sponsorVisibility').lean(),
    SponsorProfile.countDocuments(),
  ]);
  const get = (s: SponsorshipStatus) => byStatus.find((b) => b._id === s);
  return {
    totals: {
      promised: get('CONNECTED')?.amount ?? 0,
      remaining: approved.reduce((sum, a) => sum + amounts(a).remaining, 0),
      eligibleStudents: approved.filter((a) => a.status !== 'FULLY_FUNDED').length,
      visibleStudents: approved.filter((a) => a.status !== 'FULLY_FUNDED' && a.sponsorVisibility?.visible && a.sponsorVisibility?.shareContact).length,
      fullySupported: approved.filter((a) => a.status === 'FULLY_FUNDED').length,
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
  const app = await latestApplication(user.id);
  if (!app) return { eligible: false, status: 'NONE', approvedAmount: 0, promised: 0, remaining: 0, visible: false, sponsorships: [] };
  const m = amounts(app);
  const list = await Sponsorship.find({ application: app._id }).sort({ status: 1, createdAt: -1 }).lean();
  const vis = app.sponsorVisibility;
  const listed = !!vis?.visible && !!vis?.shareContact;
  return {
    eligible: APPROVED.includes(app.status as ApplicationStatus),
    status: app.status,
    approvedAmount: m.approved,
    promised: m.promised,
    remaining: m.remaining,
    visible: listed,
    visibleSince: listed ? vis!.at.toISOString() : undefined,
    noteToSponsors: vis?.noteToSponsors || undefined,
    needsNewConsent: !!vis?.visible && !vis?.shareContact,
    alias: APPROVED.includes(app.status as ApplicationStatus) ? studentAlias(app._id) : undefined,
    sponsorships: await toDTOs(list, 'STUDENT'),
  };
}

export async function setVisibility(user: Actor, input: SponsorVisibilityInput, req: Request) {
  const app = await latestApplication(user.id);
  if (!app || !APPROVED.includes(app.status as ApplicationStatus)) {
    throw AppError.conflict('Your profile can be shown to sponsors once your application is approved');
  }
  const before = !!app.sponsorVisibility?.visible && !!app.sponsorVisibility?.shareContact;
  app.set('sponsorVisibility', {
    visible: input.visible,
    shareContact: input.visible ? true : undefined,
    at: new Date(),
    noteToSponsors: input.noteToSponsors || undefined,
  });
  await app.save();
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.SPONSOR_VISIBILITY_CHANGED,
    resourceType: 'Application',
    resourceId: app.id,
    metadata: { applicationNumber: app.applicationNumber, from: before, to: input.visible, sharesContact: input.visible, note: !!input.noteToSponsors },
    req,
  });
  return studentFunding(user);
}
