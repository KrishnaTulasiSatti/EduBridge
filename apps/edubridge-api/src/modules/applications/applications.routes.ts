import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { documentMetaSchema, MAX_UPLOAD_BYTES, submitSchema } from '@edubridge/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import * as svc from './applications.service';

const sectionBody = z.object({}).passthrough();

/* ------------------------------------------------------------ Profile */

export const profileRouter = Router();
profileRouter.use(authenticate, requireRole('STUDENT'));

profileRouter.get('/me', async (req, res) => {
  res.json({ profile: await svc.getProfile(req.user!.id) });
});

profileRouter.patch('/me', validateBody(sectionBody), async (req, res) => {
  res.json(await svc.updateProfile(req.user!.id, req.body));
});

/* -------------------------------------------------------- Application */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
});

const singleFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'File is larger than 5 MB'));
      return next(AppError.badRequest('Upload failed. Please try again.'));
    }
    next(err as Error | undefined);
  });
};

export const applicationsRouter = Router();
applicationsRouter.use(authenticate);

const student = requireRole('STUDENT');

applicationsRouter.get('/current', student, async (req, res) => {
  res.json({ application: await svc.getCurrent(req.user!.id) });
});

applicationsRouter.post('/current', student, async (req, res) => {
  res.status(201).json({ application: await svc.startApplication(req.user!.id, req) });
});

applicationsRouter.patch('/current', student, validateBody(sectionBody), async (req, res) => {
  res.json(await svc.updateDraft(req.user!.id, req.body));
});

applicationsRouter.post('/current/submit', student, validateBody(submitSchema), async (req, res) => {
  res.json({ application: await svc.submit(req.user!.id, req) });
});

applicationsRouter.post('/current/documents', student, singleFile, async (req, res) => {
  const meta = documentMetaSchema.safeParse(req.body);
  if (!meta.success) throw AppError.badRequest('Select a valid document type');
  res.status(201).json({ application: await svc.uploadDocument(req.user!.id, req.file, meta.data, req) });
});

applicationsRouter.delete('/current/documents/:id', student, async (req, res) => {
  res.json({ application: await svc.deleteDocument(req.user!.id, String(req.params.id), req) });
});

applicationsRouter.get('/', requireRole('ADMIN', 'VOLUNTEER'), async (req, res) => {
  res.json(await svc.listApplications(req.query));
});

/* ---------------------------------------------------------- Documents */

export const documentsRouter = Router();
documentsRouter.use(authenticate);

documentsRouter.get('/:id/file', async (req, res) => {
  const { doc, stream } = await svc.openDocument(req.user!, String(req.params.id), req);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(doc.size));
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.pipe(res);
});
