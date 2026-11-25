import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

/**
 * Free hosting (e.g. Render's free plan) puts a service to sleep after about 15 idle minutes,
 * and waking it takes 30–60 seconds. Calls to EduVault, the PAN registry or the ML service made
 * during that time used to time out and show "not available".
 *
 * While EduBridge is being used, this pings the other services in the background at most once
 * every few minutes, so they are already awake when a student or sponsor needs them.
 * Nothing is pinged while nobody uses EduBridge, so idle services can still sleep.
 */

/** How long a request may wait for a service that is waking up. */
export const SERVICE_TIMEOUT_MS = 60_000;
const PING_EVERY_MS = 5 * 60 * 1000;
let lastPing = 0;

function targets() {
  const ml: Record<string, string> = env.ML_SERVICE_TOKEN ? { 'X-Service-Token': env.ML_SERVICE_TOKEN } : {};
  return [
    { url: `${env.EDUVAULT_API_URL}/api/health`, headers: {} },
    { url: `${env.PAN_REGISTRY_URL}/api/health`, headers: {} },
    { url: `${env.ML_SERVICE_URL}/health`, headers: ml },
  ];
}

export function wakeServices(force = false) {
  if (env.NODE_ENV === 'test') return;
  const now = Date.now();
  if (!force && now - lastPing < PING_EVERY_MS) return;
  lastPing = now;
  for (const t of targets()) {
    fetch(t.url, { headers: t.headers, signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) }).catch(() => undefined);
  }
}

/** Express middleware: any request to EduBridge keeps the other services awake. */
export function keepServicesAwake(_req: Request, _res: Response, next: NextFunction) {
  wakeServices();
  next();
}

/** In production, warn about service addresses that still point at this machine. */
export function warnAboutLocalServiceUrls() {
  if (env.NODE_ENV !== 'production') return;
  const local = /\/\/(localhost|127\.0\.0\.1)/;
  const checks = { EDUVAULT_API_URL: env.EDUVAULT_API_URL, PAN_REGISTRY_URL: env.PAN_REGISTRY_URL, ML_SERVICE_URL: env.ML_SERVICE_URL };
  for (const [key, value] of Object.entries(checks)) {
    if (local.test(value)) console.warn(`⚠️  ${key} is ${value}. Set it to the deployed service's address, or that feature will show as unavailable.`);
  }
}
