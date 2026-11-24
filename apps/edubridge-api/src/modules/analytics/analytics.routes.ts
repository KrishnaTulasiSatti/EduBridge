import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { platformAnalytics } from './analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requireRole('ADMIN'));

analyticsRouter.get('/', async (_req, res) => {
  res.json(await platformAnalytics());
});
