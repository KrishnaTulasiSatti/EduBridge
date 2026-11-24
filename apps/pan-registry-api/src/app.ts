import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { adminRouter } from './modules/records/records.routes';
import { partnerRouter } from './modules/verification/verification.routes';

/** The records admin page (plain HTML, served from the same address as the API). */
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '50kb' }));
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'pan-registry-api', time: new Date().toISOString() });
  });

  app.use('/api/partner', partnerRouter);
  app.use('/api/admin', adminRouter);
  app.use(express.static(publicDir, { index: 'index.html' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
