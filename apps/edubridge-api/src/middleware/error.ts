import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { isProd } from '../config/env';
import { AppError } from '../utils/AppError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Invalid query strings (route handlers parse req.query with Zod).
  if (err instanceof z.ZodError) {
    const details = z.flattenError(err).fieldErrors as Record<string, string[]>;
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Some of the request parameters are invalid', details } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large' } });
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: isProd ? 'Some of the values are invalid' : err.message } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } });
    return;
  }
  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: isProd ? 'Something went wrong' : String(err?.message ?? err) },
  });
};
