import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as svc from './eduvault.service';

export const eduvaultRouter = Router();
eduvaultRouter.use(authenticate, requireRole('STUDENT'));

/** Starts "Verify using EduVault": returns the EduVault consent page to send the student to. */
eduvaultRouter.post('/requests', async (req, res) => {
  res.status(201).json(await svc.startImport(req.user!.id, req));
});

const completeSchema = z.object({
  state: z.string().min(16).max(200),
  code: z.string().min(20).max(200).optional(),
  error: z.string().max(60).optional(),
});

/** Called by the callback page with what EduVault sent back. */
eduvaultRouter.post('/complete', validateBody(completeSchema), async (req, res) => {
  res.json(await svc.completeImport(req.user!.id, req.body, req));
});
