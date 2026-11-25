import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AUDIT_ACTION_INFO, AUDIT_CATEGORIES, ROLES, auditActionsIn, auditTitle, UNLISTED_AUDIT_ACTIONS, type AuditEntryDTO } from '@edubridge/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';
import { User } from '../auth/user.model';
import { AuditLog } from './audit.model';
import { AUDIT_ACTIONS, audit } from './audit.service';

export const auditRouter = Router();
auditRouter.use(authenticate, requireRole('ADMIN'));

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const filterQuery = z.object({
  category: z.enum(AUDIT_CATEGORIES).optional(),
  action: z
    .string()
    .refine((a) => a in AUDIT_ACTION_INFO, 'Unknown action')
    .optional(),
  role: z.enum(ROLES).optional(),
  /** Name or email of the person who acted. */
  actor: z.string().trim().max(80).optional(),
  actorId: z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id').optional(),
  /** Resource id, application number, sponsorship reference or certificate number. */
  resource: z.string().trim().max(80).optional(),
  from: day,
  to: day,
});
const listQuery = filterQuery.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function buildFilter(q: z.infer<typeof filterQuery>) {
  const and: Record<string, unknown>[] = [{ action: { $nin: UNLISTED_AUDIT_ACTIONS } }];
  if (q.action) and.push({ action: q.action });
  else if (q.category) and.push({ action: { $in: auditActionsIn(q.category) } });
  if (q.role) and.push({ actorRole: q.role });
  if (q.actorId) and.push({ actor: new Types.ObjectId(q.actorId) });
  if (q.actor) {
    const rx = new RegExp(escapeRegex(q.actor), 'i');
    const ids = await User.find({ $or: [{ fullName: rx }, { email: rx }] }).select('_id').limit(200).lean();
    // Failed sign-ins for unknown emails have no actor, only the email in metadata.
    and.push({ $or: [{ actor: { $in: ids.map((u) => u._id) } }, { 'metadata.email': rx }] });
  }
  if (q.resource) {
    const exact = new RegExp(`^${escapeRegex(q.resource)}$`, 'i');
    and.push({
      $or: [
        { resourceId: q.resource },
        { 'metadata.applicationNumber': exact },
        { 'metadata.reference': exact },
        { 'metadata.certificates': exact },
        { 'metadata.number': exact },
      ],
    });
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = new Date(`${q.from}T00:00:00.000+05:30`);
    if (q.to) range.$lt = new Date(new Date(`${q.to}T00:00:00.000+05:30`).getTime() + 24 * 3600 * 1000);
    if (range.$gte && range.$lt && range.$gte >= range.$lt) throw AppError.badRequest('The start date must be before the end date');
    and.push({ createdAt: range });
  }
  return and.length ? { $and: and } : {};
}

type LeanAudit = {
  _id: Types.ObjectId;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actor?: { _id: Types.ObjectId; fullName?: string; email?: string } | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
};

const toDTO = (a: LeanAudit): AuditEntryDTO => ({
  id: String(a._id),
  action: a.action,
  resourceType: a.resourceType,
  resourceId: a.resourceId ?? null,
  actor: a.actor ? { id: String(a.actor._id), name: a.actor.fullName ?? 'Deleted user', email: a.actor.email ?? '' } : null,
  actorRole: a.actorRole ?? null,
  metadata: a.metadata ?? {},
  ip: a.ip ?? null,
  userAgent: a.userAgent ?? null,
  createdAt: (a.createdAt ?? new Date()).toISOString(),
});

auditRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter = await buildFilter(q);
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('actor', 'fullName email')
      .lean<LeanAudit[]>(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items: items.map(toDTO), total, page: q.page, limit: q.limit });
});

const EXPORT_LIMIT = 10_000;
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  // Stop spreadsheet formula injection from user-supplied text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};

auditRouter.get('/export', async (req: Request, res) => {
  const q = filterQuery.parse(req.query);
  const filter = await buildFilter(q);
  const rows = await AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).limit(EXPORT_LIMIT).populate('actor', 'fullName email').lean<LeanAudit[]>();

  await audit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: AUDIT_ACTIONS.AUDIT_EXPORTED,
    resourceType: 'AuditLog',
    metadata: { filters: q, rows: rows.length },
    req,
  });

  const header = ['Time (UTC)', 'Action', 'Action code', 'Actor', 'Actor email', 'Actor role', 'Resource type', 'Resource id', 'Details', 'IP address'];
  const lines = rows.map((r) => {
    const d = toDTO(r);
    return [d.createdAt, auditTitle(d.action), d.action, d.actor?.name, d.actor?.email, d.actorRole, d.resourceType, d.resourceId, d.metadata, d.ip].map(csvCell).join(',');
  });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="edubridge-audit-${stamp}.csv"`);
  res.send(`﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`);
});

auditRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Audit entry not found');
  const entry = await AuditLog.findById(id).populate('actor', 'fullName email').lean<LeanAudit>();
  if (!entry) throw AppError.notFound('Audit entry not found');
  // Other entries about the same resource, so an admin can follow what happened to it.
  const related = entry.resourceId
    ? await AuditLog.find({ resourceId: entry.resourceId, _id: { $ne: entry._id }, action: { $nin: UNLISTED_AUDIT_ACTIONS } })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('actor', 'fullName email')
        .lean<LeanAudit[]>()
    : [];
  res.json({ entry: toDTO(entry), related: related.map(toDTO) });
});
