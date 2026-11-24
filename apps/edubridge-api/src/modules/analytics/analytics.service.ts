import { Types } from 'mongoose';
import { APPLICATION_STATUSES, type AnalyticsDTO, type ApplicationStatus } from '@edubridge/shared';
import { Application, StudentDocument } from '../applications/models';
import { AuditLog } from '../audit/audit.model';
import { AUDIT_ACTIONS } from '../audit/audit.service';
import { User } from '../auth/user.model';
import { SponsorProfile, Sponsorship } from '../sponsorship/models';

const FUNDABLE: ApplicationStatus[] = ['APPROVED', 'PARTIALLY_FUNDED', 'FULLY_FUNDED'];
const SECURITY_ACTIONS = [
  AUDIT_ACTIONS.LOGIN_FAILED,
  AUDIT_ACTIONS.ACCOUNT_LOCKED,
  AUDIT_ACTIONS.REFRESH_TOKEN_REUSE,
  AUDIT_ACTIONS.AADHAAR_VIEWED,
  AUDIT_ACTIONS.DOCUMENT_VIEWED,
];
const ADMIN_ACTIONS = [
  AUDIT_ACTIONS.APPLICATION_DECIDED,
  AUDIT_ACTIONS.USER_STATUS_CHANGED,
  AUDIT_ACTIONS.CONNECTION_ENDED,
  AUDIT_ACTIONS.MODEL_TRAINED,
  AUDIT_ACTIONS.AUDIT_EXPORTED,
  AUDIT_ACTIONS.DOCUMENTS_PURGED,
];

const DAY = 24 * 3600 * 1000;

/** The last `n` calendar months as YYYY-MM keys, oldest first (UTC). */
function lastMonths(n: number, now = new Date()) {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

async function monthly(model: typeof Application | typeof Sponsorship, dateField: string, match: Record<string, unknown>, since: Date, sumField?: string) {
  const rows = await (model as typeof Application).aggregate<{ _id: string; n: number; sum: number }>([
    { $match: { ...match, [dateField]: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: `$${dateField}` } },
        n: { $sum: 1 },
        sum: { $sum: sumField ? `$${sumField}` : 0 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

export async function platformAnalytics(): Promise<AnalyticsDTO> {
  const months = lastMonths(12);
  const since = new Date(`${months[0]}-01T00:00:00.000Z`);
  const last30 = new Date(Date.now() - 30 * DAY);

  const [
    usersByRole,
    newStudents30,
    statusRows,
    docRows,
    needRows,
    fundingRows,
    sponsorshipRows,
    sponsorBudget,
    submittedByMonth,
    decidedByMonth,
    promisedByMonth,
    volunteerRows,
    volunteers,
    securityRows,
    adminActivity,
  ] = await Promise.all([
    User.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    User.countDocuments({ role: 'STUDENT', createdAt: { $gte: last30 } }),
    Application.aggregate<{ _id: ApplicationStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    // Documents of submitted applications that still need a person to look at them.
    StudentDocument.aggregate<{ _id: string; n: number }>([
      { $lookup: { from: 'applications', localField: 'application', foreignField: '_id', as: 'app', pipeline: [{ $project: { status: 1 } }] } },
      { $match: { 'app.status': { $in: ['SUBMITTED', 'UNDER_VERIFICATION'] } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    Application.aggregate<{ _id: string; n: number }>([
      { $match: { 'decision.decision': 'APPROVED' } },
      { $group: { _id: '$decision.needLevel', n: { $sum: 1 } } },
    ]),
    Application.aggregate<{ approved: number; promised: number; eligible: number; visible: number }>([
      { $match: { status: { $in: FUNDABLE } } },
      {
        $group: {
          _id: null,
          approved: { $sum: { $ifNull: ['$decision.approvedAmount', 0] } },
          promised: { $sum: { $ifNull: ['$funding.promised', 0] } },
          eligible: { $sum: { $cond: [{ $in: ['$status', ['APPROVED', 'PARTIALLY_FUNDED']] }, 1, 0] } },
          visible: {
            $sum: { $cond: [{ $and: [{ $in: ['$status', ['APPROVED', 'PARTIALLY_FUNDED']] }, { $eq: ['$sponsorVisibility.visible', true] }, { $eq: ['$sponsorVisibility.shareContact', true] }] }, 1, 0] },
          },
        },
      },
    ]),
    Sponsorship.aggregate<{ _id: string; n: number; amount: number }>([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    SponsorProfile.aggregate<{ budget: number; committed: number; sponsors: number }>([
      { $group: { _id: null, budget: { $sum: '$budget' }, committed: { $sum: '$committed' }, sponsors: { $sum: 1 } } },
    ]),
    monthly(Application, 'submittedAt', {}, since),
    monthly(Application, 'decision.at', {}, since),
    monthly(Sponsorship, 'createdAt', { status: 'CONNECTED' }, since, 'amount'),
    // Volunteer verification activity over the last 30 days, from the audit log.
    AuditLog.aggregate<{ _id: { actor: Types.ObjectId; action: string }; n: number; last: Date }>([
      {
        $match: {
          actorRole: { $in: ['VOLUNTEER', 'ADMIN'] },
          action: { $in: [AUDIT_ACTIONS.VERIFICATION_CLAIMED, AUDIT_ACTIONS.DOCUMENT_REVIEWED, AUDIT_ACTIONS.VOLUNTEER_REVIEW_SUBMITTED] },
          createdAt: { $gte: last30 },
        },
      },
      { $group: { _id: { actor: '$actor', action: '$action' }, n: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]),
    User.find({ role: 'VOLUNTEER', status: 'ACTIVE' }).select('fullName').lean(),
    AuditLog.aggregate<{ _id: string; n: number }>([
      { $match: { action: { $in: SECURITY_ACTIONS }, createdAt: { $gte: last30 } } },
      { $group: { _id: '$action', n: { $sum: 1 } } },
    ]),
    AuditLog.find({ action: { $in: ADMIN_ACTIONS } }).sort({ createdAt: -1 }).limit(10).populate('actor', 'fullName').lean(),
  ]);

  const count = (rows: { _id: string; n: number }[], key: string) => rows.find((r) => r._id === key)?.n ?? 0;
  const applications = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, count(statusRows, s)])) as Record<ApplicationStatus, number>;
  const submitted = APPLICATION_STATUSES.filter((s) => s !== 'DRAFT').reduce((sum, s) => sum + applications[s], 0);
  const funding = fundingRows[0] ?? { approved: 0, promised: 0, eligible: 0, visible: 0 };
  const budget = sponsorBudget[0] ?? { budget: 0, committed: 0, sponsors: 0 };
  const sp = (s: string) => sponsorshipRows.find((r) => r._id === s) ?? { n: 0, amount: 0 };

  // Volunteer table: everyone active, plus admins who verified something.
  const people = new Map<string, { id: string; name: string; role: 'VOLUNTEER' | 'ADMIN'; claimed: number; checks: number; reviews: number; lastActiveAt: string | null }>();
  for (const v of volunteers) {
    people.set(String(v._id), { id: String(v._id), name: v.fullName, role: 'VOLUNTEER', claimed: 0, checks: 0, reviews: 0, lastActiveAt: null });
  }
  const missing = volunteerRows.map((r) => String(r._id.actor)).filter((id) => !people.has(id));
  if (missing.length) {
    const others = await User.find({ _id: { $in: [...new Set(missing)] } }).select('fullName role').lean();
    for (const o of others) {
      people.set(String(o._id), { id: String(o._id), name: o.fullName, role: o.role === 'ADMIN' ? 'ADMIN' : 'VOLUNTEER', claimed: 0, checks: 0, reviews: 0, lastActiveAt: null });
    }
  }
  for (const r of volunteerRows) {
    const p = people.get(String(r._id.actor));
    if (!p) continue;
    if (r._id.action === AUDIT_ACTIONS.VERIFICATION_CLAIMED) p.claimed += r.n;
    if (r._id.action === AUDIT_ACTIONS.DOCUMENT_REVIEWED) p.checks += r.n;
    if (r._id.action === AUDIT_ACTIONS.VOLUNTEER_REVIEW_SUBMITTED) p.reviews += r.n;
    const last = r.last.toISOString();
    if (!p.lastActiveAt || last > p.lastActiveAt) p.lastActiveAt = last;
  }

  return {
    generatedAt: new Date().toISOString(),
    users: {
      students: count(usersByRole, 'STUDENT'),
      volunteers: count(usersByRole, 'VOLUNTEER'),
      sponsors: count(usersByRole, 'SPONSOR'),
      admins: count(usersByRole, 'ADMIN'),
      newStudentsLast30Days: newStudents30,
    },
    applications: {
      byStatus: applications,
      drafts: applications.DRAFT,
      submitted,
      awaitingVerification: applications.SUBMITTED,
      underVerification: applications.UNDER_VERIFICATION,
      awaitingDecision: applications.VOLUNTEER_REVIEWED + applications.ASSESSED,
      approved: applications.APPROVED + applications.PARTIALLY_FUNDED + applications.FULLY_FUNDED,
      rejected: applications.REJECTED,
      onHold: applications.ON_HOLD,
    },
    documents: {
      awaitingReview: docRows.filter((r) => r._id !== 'VERIFIED' && r._id !== 'REJECTED').reduce((s, r) => s + r.n, 0),
      byStatus: Object.fromEntries(docRows.map((r) => [r._id, r.n])),
    },
    approvedByNeedLevel: { HIGH: count(needRows, 'HIGH'), MEDIUM: count(needRows, 'MEDIUM'), LOW: count(needRows, 'LOW') },
    sponsorship: {
      eligibleStudents: funding.eligible,
      visibleToSponsors: funding.visible,
      fullySupported: applications.FULLY_FUNDED,
      approvedAmount: funding.approved,
      promisedAmount: funding.promised,
      remainingAmount: Math.max(0, funding.approved - funding.promised),
      sponsors: budget.sponsors,
      sponsorBudget: budget.budget,
      sponsorCommitted: budget.committed,
      connected: { count: sp('CONNECTED').n, amount: sp('CONNECTED').amount },
      ended: { count: sp('ENDED').n, amount: sp('ENDED').amount },
    },
    trend: months.map((m) => ({
      month: m,
      submitted: submittedByMonth.get(m)?.n ?? 0,
      decided: decidedByMonth.get(m)?.n ?? 0,
      promisedAmount: promisedByMonth.get(m)?.sum ?? 0,
    })),
    volunteerActivity: [...people.values()].sort((a, b) => b.checks + b.reviews - (a.checks + a.reviews) || a.name.localeCompare(b.name)),
    securityLast30Days: Object.fromEntries(SECURITY_ACTIONS.map((a) => [a, count(securityRows, a)])),
    recentAdminActivity: adminActivity.map((a) => ({
      id: String(a._id),
      action: a.action,
      resourceType: a.resourceType,
      resourceId: a.resourceId ?? null,
      actorName: (a.actor as { fullName?: string } | null)?.fullName ?? null,
      createdAt: (a.createdAt as Date).toISOString(),
    })),
  };
}
