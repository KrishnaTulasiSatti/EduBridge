import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { safeEqual } from '../../utils/crypto';
import { Verification } from '../verification/verification.model';
import { holderType, isValidPan, maskPan, normalizePan } from './pan';
import { PanRecord, RECORD_STATUSES, type PanRecordDoc } from './record.model';

const requireAdminKey: RequestHandler = (req, _res, next) => {
  const key = req.get('x-admin-key') ?? '';
  if (!key || !safeEqual(key, env.ADMIN_KEY)) return next(new AppError(401, 'INVALID_ADMIN_KEY', 'The admin key is not correct'));
  next();
};

const isPastDate = (d: string) => {
  const date = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d) && date < new Date();
};

const createSchema = z.object({
  pan: z
    .string()
    .transform(normalizePan)
    .refine(isValidPan, 'Enter a valid PAN, e.g. ABCPK1234L (the 4th letter shows the holder type)'),
  fullName: z.string().trim().min(2, 'Enter the name as printed on the PAN card').max(100),
  dateOfBirth: z.string().refine(isPastDate, 'Enter a valid date of birth'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const statusSchema = z.object({
  status: z.enum(RECORD_STATUSES),
  statusNote: z.string().trim().max(200).optional(),
});

const toView = (r: PanRecordDoc) => ({
  id: r.id,
  pan: r.pan,
  holderType: holderType(r.pan),
  fullName: r.fullName,
  dateOfBirth: r.dateOfBirth,
  email: r.email,
  mobile: r.mobile ?? undefined,
  status: r.status,
  statusNote: r.statusNote ?? undefined,
  createdAt: r.createdAt.toISOString(),
});

export const adminRouter = Router();

adminRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 10_000 : 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes.' } },
  }),
);
adminRouter.use(requireAdminKey);

adminRouter.get('/records', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = q ? { $or: [{ pan: new RegExp(escaped, 'i') }, { fullName: new RegExp(escaped, 'i') }] } : {};
  const records = await PanRecord.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ items: records.map(toView) });
});

adminRouter.post('/records', validateBody(createSchema), async (req, res) => {
  if (await PanRecord.exists({ pan: req.body.pan })) throw AppError.conflict('A record with this PAN already exists');
  const record = await PanRecord.create(req.body);
  res.status(201).json(toView(record));
});

adminRouter.patch('/records/:id', validateBody(statusSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw AppError.notFound('Record not found');
  const record = await PanRecord.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, statusNote: req.body.status === 'INACTIVE' ? req.body.statusNote : undefined },
    { new: true },
  );
  if (!record) throw AppError.notFound('Record not found');
  res.json(toView(record));
});

adminRouter.delete('/records/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw AppError.notFound('Record not found');
  const record = await PanRecord.findByIdAndDelete(req.params.id);
  if (!record) throw AppError.notFound('Record not found');
  res.status(204).end();
});

/** Recent verification attempts (last 24 hours), newest first. */
adminRouter.get('/verifications', async (_req, res) => {
  const items = await Verification.find().sort({ createdAt: -1 }).limit(50);
  res.json({
    items: items.map((v) => ({
      reference: v.reference,
      partner: v.partner,
      pan: maskPan(v.pan),
      status: v.status,
      attempts: v.attempts,
      createdAt: v.createdAt.toISOString(),
      verifiedAt: v.verifiedAt?.toISOString(),
    })),
  });
});
