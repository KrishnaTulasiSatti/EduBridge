import { Router } from 'express';
import { connectSchema, endConnectionSchema, sponsorPreferencesSchema, sponsorVisibilitySchema } from '@edubridge/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as svc from './sponsorship.service';

/** Sponsors: preferences, recommended students, connections. */
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
sponsorRouter.post('/students/:id/connect', validateBody(connectSchema), async (req, res) => {
  res.status(201).json(await svc.connect(req.user!, String(req.params.id), req.body, req));
});
sponsorRouter.get('/sponsorships', async (req, res) => {
  res.json(await svc.sponsorSponsorships(req.user!));
});
sponsorRouter.post('/sponsorships/:id/end', async (req, res) => {
  res.json(await svc.endBySponsor(req.user!, String(req.params.id), req));
});

/** Students: their connections and whether sponsors may see their profile. */
export const fundingRouter = Router();
fundingRouter.use(authenticate, requireRole('STUDENT'));

fundingRouter.get('/me', async (req, res) => {
  res.json(await svc.studentFunding(req.user!));
});
fundingRouter.put('/me/visibility', validateBody(sponsorVisibilitySchema), async (req, res) => {
  res.json(await svc.setVisibility(req.user!, req.body, req));
});

/** Administrators: see every connection and end one if needed. */
export const adminSponsorshipsRouter = Router();
adminSponsorshipsRouter.use(authenticate, requireRole('ADMIN'));

adminSponsorshipsRouter.get('/', async (req, res) => {
  res.json(await svc.adminList(req.query));
});
adminSponsorshipsRouter.get('/overview', async (_req, res) => {
  res.json(await svc.overview());
});
adminSponsorshipsRouter.post('/:id/end', validateBody(endConnectionSchema), async (req, res) => {
  res.json(await svc.adminEnd(req.user!, String(req.params.id), req.body.reason, req));
});
