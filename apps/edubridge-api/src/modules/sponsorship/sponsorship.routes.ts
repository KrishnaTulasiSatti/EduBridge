import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  bankDetailsSchema,
  cancelSponsorshipSchema,
  confirmSponsorshipSchema,
  markSentSchema,
  pledgeSchema,
  reportNotReceivedSchema,
  sponsorPreferencesSchema,
  sponsorVisibilitySchema,
} from '@edubridge/shared';
import { env } from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { publicKeyInfo } from './certificates';
import * as svc from './sponsorship.service';

/** Sponsors: preferences, recommended students, pledges. */
export const sponsorRouter = Router();
sponsorRouter.use(authenticate, requireRole('SPONSOR'));

sponsorRouter.get('/preferences', async (req, res) => {
  res.json(await svc.getPreferences(req.user!));
});
sponsorRouter.put('/preferences', validateBody(sponsorPreferencesSchema), async (req, res) => {
  res.json(await svc.savePreferences(req.user!, req.body, req));
});
sponsorRouter.get('/students', async (req, res) => {
  res.json(await svc.discover(req.user!, req.query));
});
sponsorRouter.get('/students/:id', async (req, res) => {
  res.json(await svc.studentForSponsor(req.user!, String(req.params.id)));
});
sponsorRouter.post('/students/:id/pledge', validateBody(pledgeSchema), async (req, res) => {
  res.status(201).json(await svc.pledge(req.user!, String(req.params.id), req.body, req));
});
sponsorRouter.get('/sponsorships', async (req, res) => {
  res.json(await svc.sponsorSponsorships(req.user!));
});
sponsorRouter.post('/sponsorships/:id/withdraw', async (req, res) => {
  res.json(await svc.withdrawPledge(req.user!, String(req.params.id), req));
});
sponsorRouter.get('/sponsorships/:id/bank-details', async (req, res) => {
  res.json(await svc.bankDetailsForSponsor(req.user!, String(req.params.id), req));
});
sponsorRouter.post('/sponsorships/:id/sent', validateBody(markSentSchema), async (req, res) => {
  res.json(await svc.markSent(req.user!, String(req.params.id), req.body, req));
});

/** Students: their funding and whether sponsors may see their anonymised profile. */
export const fundingRouter = Router();
fundingRouter.use(authenticate, requireRole('STUDENT'));

fundingRouter.get('/me', async (req, res) => {
  res.json(await svc.studentFunding(req.user!));
});
fundingRouter.put('/me/visibility', validateBody(sponsorVisibilitySchema), async (req, res) => {
  res.json(await svc.setVisibility(req.user!, req.body, req));
});
fundingRouter.put('/me/bank-details', validateBody(bankDetailsSchema), async (req, res) => {
  res.json(await svc.saveBankDetails(req.user!, req.body, req));
});
fundingRouter.post('/me/sponsorships/:id/received', async (req, res) => {
  res.json(await svc.confirmReceived(req.user!, String(req.params.id), req));
});
fundingRouter.post('/me/sponsorships/:id/not-received', validateBody(reportNotReceivedSchema), async (req, res) => {
  res.json(await svc.reportNotReceived(req.user!, String(req.params.id), req.body.note, req));
});

/** Administrators: monitor sponsorships, settle "not received" reports, cancel. */
export const adminSponsorshipsRouter = Router();
adminSponsorshipsRouter.use(authenticate, requireRole('ADMIN'));

adminSponsorshipsRouter.get('/', async (req, res) => {
  res.json(await svc.adminList(req.query));
});
adminSponsorshipsRouter.get('/overview', async (_req, res) => {
  res.json(await svc.overview());
});
adminSponsorshipsRouter.post('/:id/confirm', validateBody(confirmSponsorshipSchema), async (req, res) => {
  res.json(await svc.confirm(req.user!, String(req.params.id), req.body, req));
});
adminSponsorshipsRouter.post('/:id/cancel', validateBody(cancelSponsorshipSchema), async (req, res) => {
  res.json(await svc.adminCancel(req.user!, String(req.params.id), req.body.reason, req));
});

/** Public certificate verification. Rate limited because it is unauthenticated. */
export const certificatesRouter = Router();
certificatesRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 1000 : 60, standardHeaders: 'draft-7', legacyHeaders: false }));

certificatesRouter.get('/public-key', (_req, res) => {
  res.json(publicKeyInfo());
});
certificatesRouter.get('/:number', async (req, res) => {
  res.json(await svc.verifyCertificate(String(req.params.number), String(req.query.code ?? '')));
});
