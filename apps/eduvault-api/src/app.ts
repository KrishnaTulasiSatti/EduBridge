import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { consentRouter, partnerRouter, registryRouter } from './modules/consent/consent.routes';
import { issuerRouter, meRouter } from './modules/records/records.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'eduvault-api', time: new Date().toISOString() });
  });

  // Server-to-server and public endpoints: no browser credentials involved.
  app.use('/api/partner', partnerRouter);
  app.use('/api/registry', cors(), registryRouter);

  // Browser endpoints used by the EduVault web app.
  const browserCors = cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true });
  app.use('/api/auth', browserCors, authRouter);
  app.use('/api/me', browserCors, meRouter);
  app.use('/api/issuer', browserCors, issuerRouter);
  app.use('/api/consents', browserCors, consentRouter);
  app.use('/api/admin', browserCors, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
