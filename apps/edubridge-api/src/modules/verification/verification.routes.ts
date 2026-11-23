import { Router } from 'express';
import { documentReviewSchema, volunteerReviewSchema } from '@edubridge/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as svc from './verification.service';

/** Volunteer workspace. Admins can use every action too; only admins decide eligibility (Phase 5). */
export const verificationRouter = Router();
verificationRouter.use(authenticate, requireRole('VOLUNTEER', 'ADMIN'));

verificationRouter.get('/queue', async (req, res) => {
  res.json(await svc.listQueue(req.user!, req.query));
});

verificationRouter.get('/stats', async (req, res) => {
  res.json(await svc.stats(req.user!));
});

verificationRouter.get('/applications/:id', async (req, res) => {
  res.json(await svc.detail(req.user!, String(req.params.id)));
});

verificationRouter.post('/applications/:id/claim', async (req, res) => {
  res.json(await svc.claim(req.user!, String(req.params.id), req));
});

verificationRouter.post('/applications/:id/release', async (req, res) => {
  res.json(await svc.release(req.user!, String(req.params.id), req));
});

verificationRouter.post('/applications/:id/enrolment-check', async (req, res) => {
  res.json(await svc.recheckEnrolment(req.user!, String(req.params.id), req));
});

verificationRouter.post('/applications/:id/documents/:docId/aadhaar', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.revealAadhaar(req.user!, String(req.params.id), String(req.params.docId), req));
});

verificationRouter.post('/applications/:id/documents/:docId/review', validateBody(documentReviewSchema), async (req, res) => {
  res.json(await svc.reviewDocument(req.user!, String(req.params.id), String(req.params.docId), req.body, req));
});

verificationRouter.post('/applications/:id/review', validateBody(volunteerReviewSchema), async (req, res) => {
  res.json(await svc.submitReview(req.user!, String(req.params.id), req.body, req));
});
