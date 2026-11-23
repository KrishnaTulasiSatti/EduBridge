import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { INSTITUTION_STATUSES, VAULT_ROLES, type InstitutionDTO, type InstitutionStatus } from '@eduvault/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { AuditLog } from '../audit/audit.model';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { revokeAllSessions, toVaultUser } from '../auth/auth.service';
import { User } from '../auth/user.model';
import { AccessRequest } from '../consent/accessRequest.model';
import { Institution, activeKey, type InstitutionDoc } from '../institutions/institution.model';
import { generateSigningKey } from '../institutions/keys';
import { Marksheet, StudentRecord } from '../records/models';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

const escapeRx = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const listQuery = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.string().optional(),
  role: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

async function toInstitutionDTO(i: InstitutionDoc, withCounts = false): Promise<InstitutionDTO> {
  const contact = i.contact ? await User.findById(i.contact).select('fullName designation email') : null;
  const key = activeKey(i);
  const dto: InstitutionDTO = {
    id: i.id,
    name: i.name,
    university: i.university,
    code: i.code,
    city: i.city,
    state: i.state,
    website: i.website ?? undefined,
    status: i.status as InstitutionStatus,
    contact: contact ? { name: contact.fullName, designation: contact.designation ?? undefined, email: contact.email } : undefined,
    signingKey: key ? { keyId: key.keyId, fingerprint: key.fingerprint, createdAt: key.createdAt.toISOString() } : undefined,
    approvedAt: i.approvedAt?.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
  if (withCounts) {
    const [students, issued] = await Promise.all([
      StudentRecord.countDocuments({ institution: i._id }),
      Marksheet.countDocuments({ institution: i._id, status: { $ne: 'DRAFT' } }),
    ]);
    dto.counts = { students, issued };
  }
  return dto;
}

/* ------------------------------------------------------------ Overview */

adminRouter.get('/overview', async (_req, res) => {
  const [institutions, users, marksheets, consents, recent] = await Promise.all([
    Institution.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Marksheet.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    AccessRequest.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'fullName role'),
  ]);
  const toMap = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
  res.json({
    institutions: toMap(institutions),
    users: toMap(users),
    marksheets: toMap(marksheets),
    consents: toMap(consents),
    recent: recent.map(toActivity),
  });
});

/* -------------------------------------------------------- Institutions */

adminRouter.get('/institutions', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status && q.status !== 'ALL') filter.status = q.status;
  if (q.search) filter.$or = [{ name: escapeRx(q.search) }, { code: escapeRx(q.search) }, { university: escapeRx(q.search) }];
  const [items, total] = await Promise.all([
    Institution.find(filter).sort({ status: 1, createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    Institution.countDocuments(filter),
  ]);
  res.json({ items: await Promise.all(items.map((i) => toInstitutionDTO(i, true))), total, page: q.page, limit: q.limit });
});

const institutionStatusSchema = z.object({
  status: z.enum(INSTITUTION_STATUSES).exclude(['PENDING']),
  note: z.string().trim().max(300).optional(),
});

const allowedTransitions: Record<InstitutionStatus, InstitutionStatus[]> = {
  PENDING: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  REJECTED: [],
};

async function changeInstitutionStatus(id: string, status: Exclude<InstitutionStatus, 'PENDING'>, adminId: string, req: Request, note?: string) {
  const inst = Types.ObjectId.isValid(id) ? await Institution.findById(id) : null;
  if (!inst) throw AppError.notFound('Institution not found');
  const from = inst.status as InstitutionStatus;
  if (!allowedTransitions[from].includes(status)) throw AppError.conflict(`An institution that is ${from.toLowerCase()} cannot be changed to ${status.toLowerCase()}`);

  inst.status = status;
  const issuers = await User.find({ institution: inst._id, role: 'ISSUER' }).select('_id status');
  const issuerIds = issuers.map((u) => u.id);

  if (status === 'ACTIVE') {
    if (!inst.approvedAt) {
      inst.approvedAt = new Date();
      inst.approvedBy = new Types.ObjectId(adminId);
    }
    // A trusted issuer needs a signing key; create one on first approval.
    if (!activeKey(inst)) {
      const key = generateSigningKey(inst.code);
      inst.signingKeys.push(key);
      await audit({ actorId: adminId, actorRole: 'ADMIN', action: AUDIT_ACTIONS.SIGNING_KEY_CREATED, resourceType: 'Institution', resourceId: inst.id, metadata: { keyId: key.keyId, fingerprint: key.fingerprint }, req });
    }
    await User.updateMany({ _id: { $in: issuerIds }, status: 'PENDING_APPROVAL' }, { status: 'ACTIVE' });
  }
  if (status === 'REJECTED') {
    await User.updateMany({ _id: { $in: issuerIds } }, { status: 'SUSPENDED' });
    await revokeAllSessions(issuerIds);
  }
  await inst.save();
  await audit({ actorId: adminId, actorRole: 'ADMIN', action: AUDIT_ACTIONS.INSTITUTION_STATUS_CHANGED, resourceType: 'Institution', resourceId: inst.id, metadata: { from, to: status, note }, req });
  return inst;
}

adminRouter.patch('/institutions/:id/status', validateBody(institutionStatusSchema), async (req, res) => {
  const inst = await changeInstitutionStatus(String(req.params.id), req.body.status, req.user!.id, req, req.body.note);
  res.json({ institution: await toInstitutionDTO(inst, true) });
});

/* --------------------------------------------------------------- Users */

adminRouter.get('/users', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.role && (VAULT_ROLES as readonly string[]).includes(q.role)) filter.role = q.role;
  if (q.status && q.status !== 'ALL') filter.status = q.status;
  if (q.search) filter.$or = [{ fullName: escapeRx(q.search) }, { email: escapeRx(q.search) }];
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    User.countDocuments(filter),
  ]);
  res.json({ items: await Promise.all(items.map(toVaultUser)), total, page: q.page, limit: q.limit });
});

adminRouter.patch('/users/:id/status', validateBody(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })), async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw AppError.badRequest('You cannot change your own account status');
  const user = Types.ObjectId.isValid(id) ? await User.findById(id) : null;
  if (!user) throw AppError.notFound('User not found');
  if (user.role === 'ADMIN') throw AppError.forbidden('Administrator accounts cannot be changed here');
  if (user.status === 'PENDING_APPROVAL') throw AppError.conflict('Approve the institution to activate this account');
  const from = user.status;
  user.status = req.body.status;
  await user.save();
  if (user.status === 'SUSPENDED') await revokeAllSessions([user.id]);
  await audit({ actorId: req.user!.id, actorRole: 'ADMIN', action: AUDIT_ACTIONS.USER_STATUS_CHANGED, resourceType: 'User', resourceId: user.id, metadata: { from, to: user.status }, req });
  res.json({ user: await toVaultUser(user) });
});

/* ------------------------------------------------------------ Activity */

function toActivity(a: InstanceType<typeof AuditLog>) {
  const actor = a.actor as unknown as { fullName?: string; role?: string } | null;
  return {
    id: a.id,
    action: a.action,
    actorName: actor?.fullName ?? (a.actorRole === 'PARTNER' ? 'Partner service' : undefined),
    actorRole: actor?.role ?? a.actorRole ?? undefined,
    resourceType: a.resourceType,
    metadata: a.metadata ?? {},
    createdAt: (a.get('createdAt') as Date).toISOString(),
  };
}

adminRouter.get('/activity', async (req, res) => {
  const q = listQuery.extend({ action: z.string().max(60).optional() }).parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.action && q.action !== 'ALL') filter.action = q.action;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('actor', 'fullName role'),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items: items.map(toActivity), total, page: q.page, limit: q.limit });
});
