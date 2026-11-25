import type { ModelReportDTO, NeedFeatures, NeedLevel } from '@edubridge/shared';
import { env } from '../../config/env';
import { SERVICE_TIMEOUT_MS } from '../../utils/wakeServices';
import { AppError } from '../../utils/AppError';

/**
 * Server-to-server client for the Python ML service (apps/ml-service).
 * The service is optional: if it is down, assessments still work with the rule-based score alone.
 */
export class MlError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (env.ML_SERVICE_TOKEN) headers['X-Service-Token'] = env.ML_SERVICE_TOKEN;
  let res: Response;
  try {
    res = await fetch(`${env.ML_SERVICE_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new MlError(503, 'The ML service could not be reached. Assessments use the rule-based score until it is back.');
  }
  const body = (await res.json().catch(() => null)) as (T & { detail?: unknown }) | null;
  if (!res.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : `ML service error (${res.status})`;
    throw new MlError(res.status, detail);
  }
  return body as T;
}

export interface PredictionResponse {
  prediction: NeedLevel;
  probabilities: Partial<Record<NeedLevel, number>>;
  model: ModelReportDTO['model'];
}

export interface TrainingSample {
  features: NeedFeatures;
  label: NeedLevel;
  group?: string;
}

export const mlClient = {
  predict(features: NeedFeatures) {
    return call<PredictionResponse>('/predict', { method: 'POST', body: JSON.stringify({ features }) }, 20_000);
  },
  report() {
    return call<ModelReportDTO>('/model', {}, SERVICE_TIMEOUT_MS);
  },
  train(samples: TrainingSample[]) {
    return call<ModelReportDTO>('/train', { method: 'POST', body: JSON.stringify({ samples, source: 'REVIEWED_DECISIONS' }) }, 120_000);
  },
  trainSynthetic() {
    return call<ModelReportDTO>('/train/synthetic', { method: 'POST', body: JSON.stringify({ n: 600 }) }, 120_000);
  },
};

/** Turns an ML error into a user-facing API error. */
export const toAppError = (e: unknown) =>
  e instanceof MlError ? new AppError(e.status === 503 ? 503 : 422, e.status === 503 ? 'ML_UNAVAILABLE' : 'ML_ERROR', e.message) : e;
