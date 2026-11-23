import { Router, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { activationCodeSchema, marksheetSchema, MAX_MARKSHEET_BYTES, studentRecordSchema } from '@eduvault/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import * as consent from '../consent/consent.service';
import * as svc from './records.service';

/* ------------------------------------------------------------ Upload */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MARKSHEET_BYTES, files: 1, fields: 10 } });

/** Accepts one optional PDF in the `file` field, plus the marksheet details as form fields. */
const marksheetUpload: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'The PDF is larger than 5 MB'));
      return next(AppError.badRequest('Upload failed. Please try again.'));
    }
    next(err as Error | undefined);
  });
};

function sendPdf(res: Response, f: { file: { originalName: string; size: number }; stream: NodeJS.ReadableStream }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(f.file.size));
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.file.originalName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  f.stream.pipe(res);
}

/* ------------------------------------------------------------ Issuer */

export const issuerRouter = Router();
issuerRouter.use(authenticate, requireRole('ISSUER'));

issuerRouter.get('/overview', async (req, res) => {
  res.json(await svc.issuerOverview(req.user!.id));
});

issuerRouter.get('/students', async (req, res) => {
  res.json(await svc.listStudents(req.user!.id, req.query));
});

issuerRouter.post('/students', validateBody(studentRecordSchema), async (req, res) => {
  res.status(201).json(await svc.enrolStudent(req.user!.id, req.body, req));
});

issuerRouter.post('/students/:id/activation-code', async (req, res) => {
  res.json(await svc.regenerateActivationCode(req.user!.id, String(req.params.id), req));
});

issuerRouter.get('/marksheets', async (req, res) => {
  res.json(await svc.listMarksheets(req.user!.id, req.query));
});

issuerRouter.post('/marksheets', marksheetUpload, validateBody(marksheetSchema), async (req, res) => {
  res.status(201).json({ marksheet: await svc.createMarksheet(req.user!.id, req.body, req.file, req) });
});

issuerRouter.get('/marksheets/:id', async (req, res) => {
  res.json({ marksheet: await svc.getMarksheet(req.user!.id, String(req.params.id)) });
});

issuerRouter.put('/marksheets/:id', marksheetUpload, validateBody(marksheetSchema), async (req, res) => {
  res.json({ marksheet: await svc.updateMarksheet(req.user!.id, String(req.params.id), req.body, req.file) });
});

issuerRouter.get('/marksheets/:id/file', async (req, res) => {
  sendPdf(res, await svc.issuerMarksheetFile(req.user!.id, String(req.params.id)));
});

issuerRouter.delete('/marksheets/:id', async (req, res) => {
  await svc.deleteDraft(req.user!.id, String(req.params.id));
  res.status(204).end();
});

issuerRouter.post('/marksheets/:id/issue', async (req, res) => {
  res.json({ marksheet: await svc.issueMarksheet(req.user!.id, String(req.params.id), req) });
});

const revokeSchema = z.object({ reason: z.string().trim().min(5, 'Give a short reason').max(300) });
issuerRouter.post('/marksheets/:id/revoke', validateBody(revokeSchema), async (req, res) => {
  res.json({ marksheet: await svc.revokeMarksheet(req.user!.id, String(req.params.id), req.body.reason, req) });
});

/* ------------------------------------------------------------ Student */

export const meRouter = Router();
meRouter.use(authenticate, requireRole('STUDENT'));

meRouter.get('/marksheets', async (req, res) => {
  res.json({ items: await svc.myMarksheets(req.user!.id) });
});

meRouter.get('/marksheets/:id', async (req, res) => {
  res.json({ marksheet: await svc.myMarksheet(req.user!.id, String(req.params.id)) });
});

meRouter.get('/marksheets/:id/file', async (req, res) => {
  sendPdf(res, await svc.myMarksheetFile(req.user!.id, String(req.params.id)));
});

meRouter.get('/enrolments', async (req, res) => {
  res.json({ items: await svc.myEnrolments(req.user!.id) });
});

meRouter.post('/enrolments', validateBody(z.object({ activationCode: activationCodeSchema })), async (req, res) => {
  res.status(201).json({ items: await svc.linkEnrolment(req.user!.id, req.body.activationCode, req) });
});

meRouter.get('/consents', async (req, res) => {
  res.json({ items: await consent.myConsents(req.user!.id) });
});
