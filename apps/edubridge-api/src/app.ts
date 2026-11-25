import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env';
import { keepServicesAwake } from './utils/wakeServices';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, noStore, rejectOperatorInjection, requireHttps, securityHeaders } from './middleware/security';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { applicationsRouter, documentsRouter, profileRouter } from './modules/applications/applications.routes';
import { authRouter } from './modules/auth/auth.routes';
import { eduvaultRouter } from './modules/eduvault/eduvault.routes';
import { usersRouter } from './modules/users/users.routes';
import { verificationRouter } from './modules/verification/verification.routes';
import { reviewRouter } from './modules/assessment/review.routes';
import { adminSponsorshipsRouter, fundingRouter, sponsorRouter } from './modules/sponsorship/sponsorship.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));

  // Health checks come from the host's internal network, before the HTTPS check.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'edubridge-api', time: new Date().toISOString() });
  });

  app.use(requireHttps);
  // Real use of EduBridge (not the host's health checks above) keeps EduVault, PAN and ML awake.
  app.use('/api', keepServicesAwake);
  app.use('/api', apiLimiter, noStore);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rejectOperatorInjection);

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/eduvault', eduvaultRouter);
  app.use('/api/verification', verificationRouter);
  app.use('/api/review', reviewRouter);
  app.use('/api/sponsor', sponsorRouter);
  app.use('/api/funding', fundingRouter);
  app.use('/api/sponsorships', adminSponsorshipsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/audit', auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
