import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';
import { AppError } from '../utils/AppError';

/** Validates and replaces req.body with the parsed (sanitised) value. */
export const validateBody =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = z.flattenError(result.error).fieldErrors as Record<string, string[]>;
      return next(AppError.badRequest('Please correct the highlighted fields', details));
    }
    req.body = result.data;
    next();
  };
