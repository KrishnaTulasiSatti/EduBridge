import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import { z } from 'zod';
import { accessRequestSchema, enrolmentCheckSchema, redeemSchema, type IssuerRegistryEntry, type InstitutionStatus } from '@eduvault/shared';
import { env } from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { Institution } from '../institutions/institution.model';
import * as svc from './consent.service';
import { authenticatePartner } from './partners';

/* ----------------------------------------------- Student consent screen */

export const consentRouter = Router();
consentRouter.use(authenticate, requireRole('STUDENT'));

consentRouter.get('/:requestId', async (req, res) => {
  res.json(await svc.getForStudent(req.user!.id, String(req.params.requestId)));
});

consentRouter.post('/:requestId/approve', validateBody(z.object({ marksheetId: z.string().min(1, 'Select a marksheet') })), async (req, res) => {
  res.json(await svc.approve(req.user!.id, String(req.params.requestId), req.body.marksheetId, req));
});

consentRouter.post('/:requestId/deny', async (req, res) => {
  res.json(await svc.deny(req.user!.id, String(req.params.requestId), req));
});

/* ---------------------------------------------- Partner (server-to-server) */

const partnerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const partnerRouter = Router();
partnerRouter.use(partnerLimiter, authenticatePartner);

partnerRouter.post('/access-requests', validateBody(accessRequestSchema), async (req, res) => {
  res.status(201).json(await svc.createAccessRequest(req.partner!, req.body, req));
});

partnerRouter.post('/documents/redeem', validateBody(redeemSchema), async (req, res) => {
  res.json(await svc.redeem(req.partner!, req.body.code, req));
});

partnerRouter.post('/enrolments/check', validateBody(enrolmentCheckSchema), async (req, res) => {
  res.json(await svc.checkEnrolment(req.partner!, req.body, req));
});

/* ------------------------------------------- Public issuer key registry */

export const registryRouter = Router();

function toEntry(i: InstanceType<typeof Institution>): IssuerRegistryEntry {
  return {
    institutionId: i.id,
    name: i.name,
    university: i.university,
    code: i.code,
    status: i.status as InstitutionStatus,
    keys: i.signingKeys.map((k) => ({ keyId: k.keyId, algorithm: 'Ed25519', publicKeyPem: k.publicKeyPem, fingerprint: k.fingerprint, createdAt: k.createdAt.toISOString() })),
  };
}

/** Public keys of registered institutions, so anyone can check an EduVault signature. */
registryRouter.get('/issuers', async (_req, res) => {
  const list = await Institution.find({ status: { $in: ['ACTIVE', 'SUSPENDED'] } }).sort({ name: 1 });
  res.json({ items: list.map(toEntry) });
});

registryRouter.get('/issuers/:id', async (req, res) => {
  const id = String(req.params.id);
  const inst = Types.ObjectId.isValid(id) ? await Institution.findById(id) : null;
  if (!inst || inst.status === 'PENDING' || inst.status === 'REJECTED') throw AppError.notFound('Issuer not found in the registry');
  res.json(toEntry(inst));
});
