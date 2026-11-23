import { Router } from 'express';
import { z } from 'zod';
import { decisionSchema } from '@edubridge/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as svc from './review.service';

/** Administrator review: assessments, final eligibility decisions and the ML model. Admins only. */
export const reviewRouter = Router();
reviewRouter.use(authenticate, requireRole('ADMIN'));

reviewRouter.get('/queue', async (req, res) => {
  res.json(await svc.queue(req.query));
});

reviewRouter.get('/applications/:id', async (req, res) => {
  res.json(await svc.detail(req.user!, String(req.params.id)));
});

reviewRouter.post('/applications/:id/assess', async (req, res) => {
  res.json(await svc.reassess(req.user!, String(req.params.id), req));
});

reviewRouter.post('/applications/:id/decision', validateBody(decisionSchema), async (req, res) => {
  res.json(await svc.decide(req.user!, String(req.params.id), req.body, req));
});

reviewRouter.get('/model', async (_req, res) => {
  res.json(await svc.modelStatus());
});

reviewRouter.post('/model/train', validateBody(z.object({ source: z.enum(['REVIEWED_DECISIONS', 'SYNTHETIC_DEMO']) })), async (req, res) => {
  res.json(await svc.trainModel(req.user!, req.body.source, req));
});
