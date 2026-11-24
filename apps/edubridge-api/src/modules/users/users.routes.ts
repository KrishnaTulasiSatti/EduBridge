import * as notify from '../notifications/notify';
import { Router } from 'express';
import { z } from 'zod';
import { ACCOUNT_STATUSES, ROLES } from '@edubridge/shared';
import { authenticate, forgetAccount, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { applicationCounts } from '../applications/applications.service';
import { AuditLog } from '../audit/audit.model';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { RefreshToken } from '../auth/refreshToken.model';
import { User, toPublicUser } from '../auth/user.model';

export const usersRouter = Router();
usersRouter.use(authenticate, requireRole('ADMIN'));

const listQuery = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

usersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.role) filter.role = q.role;
  if (q.status) filter.status = q.status;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    User.countDocuments(filter),
  ]);
  res.json({ items: items.map(toPublicUser), total, page: q.page, limit: q.limit });
});

usersRouter.get('/stats', async (_req, res) => {
  const [byRole, pendingVolunteers, recentActivity, applications] = await Promise.all([
    User.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ role: 'VOLUNTEER', status: 'PENDING_APPROVAL' }),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'fullName role').lean(),
    applicationCounts(),
  ]);
  const counts = Object.fromEntries(ROLES.map((r) => [r, byRole.find((b) => b._id === r)?.count ?? 0]));
  res.json({
    counts,
    applications,
    pendingVolunteers,
    recentActivity: recentActivity.map((a) => ({
      id: String(a._id),
      action: a.action,
      resourceType: a.resourceType,
      actor: a.actor ? { name: (a.actor as { fullName?: string }).fullName, role: a.actorRole } : null,
      createdAt: a.createdAt,
    })),
  });
});

const statusBody = z.object({
  status: z.enum(ACCOUNT_STATUSES),
  reason: z.string().trim().max(300).optional(),
});

usersRouter.patch('/:id/status', validateBody(statusBody), async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw AppError.badRequest('You cannot change your own account status');
  const user = await User.findById(id).catch(() => null);
  if (!user) throw AppError.notFound('User not found');

  const previous = user.status;
  user.status = req.body.status;
  await user.save();
  forgetAccount(user.id);

  // Suspending a user ends all of their sessions immediately.
  if (user.status === 'SUSPENDED') {
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  }

  await audit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
    resourceType: 'User',
    resourceId: user.id,
    metadata: { from: previous, to: user.status, reason: req.body.reason },
    req,
  });
  notify.accountStatusChanged(user, previous, user.status, req.body.reason);
  res.json({ user: toPublicUser(user) });
});
