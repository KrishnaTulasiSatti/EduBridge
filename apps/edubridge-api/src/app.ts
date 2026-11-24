import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { applicationsRouter, documentsRouter, profileRouter } from './modules/applications/applications.routes';
import { authRouter } from './modules/auth/auth.routes';
import { eduvaultRouter } from './modules/eduvault/eduvault.routes';
import { usersRouter } from './modules/users/users.routes';
import { verificationRouter } from './modules/verification/verification.routes';
import { reviewRouter } from './modules/assessment/review.routes';
import { adminSponsorshipsRouter, certificatesRouter, fundingRouter, sponsorRouter } from './modules/sponsorship/sponsorship.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'edubridge-api', time: new Date().toISOString() });
  });

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
  app.use('/api/certificates', certificatesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
