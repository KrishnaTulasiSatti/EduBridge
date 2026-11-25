import { env } from '../../config/env';
import { SERVICE_TIMEOUT_MS } from '../../utils/wakeServices';
import { AppError } from '../../utils/AppError';

/**
 * Server-to-server client for the PAN Registry (simulation). EduBridge authenticates as a
 * registered partner; the secret never reaches the browser.
 */
export type PanStartResult =
  | { result: 'OTP_SENT'; reference: string; otpSentTo: string; expiresAt: string }
  | { result: 'INVALID_FORMAT' | 'NOT_FOUND' | 'INACTIVE' | 'NAME_MISMATCH' | 'DOB_MISMATCH' };

export type PanConfirmResult =
  | { result: 'VERIFIED'; reference: string; pan: string; fullName: string; holderType: string; verifiedAt: string }
  | { result: 'INVALID_OTP'; attemptsLeft: number }
  | { result: 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'ALREADY_USED' | 'INACTIVE' };

const unavailable = () =>
  new AppError(503, 'PAN_REGISTRY_UNAVAILABLE', 'We could not connect to the PAN verification service. Please try again in a minute.');

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!env.PAN_REGISTRY_CLIENT_SECRET) {
    throw new AppError(503, 'PAN_REGISTRY_NOT_CONFIGURED', 'PAN verification is not configured on this server.');
  }
  let res: Response;
  try {
    res = await fetch(`${env.PAN_REGISTRY_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${env.PAN_REGISTRY_CLIENT_ID}:${env.PAN_REGISTRY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string } }) | null;
  if (res.status === 429 && data?.error) throw new AppError(429, data.error.code, data.error.message);
  if (res.status === 404) throw new AppError(400, 'PAN_REFERENCE_UNKNOWN', 'This verification has expired. Please start again.');
  if (!res.ok || !data) throw unavailable();
  return data as T;
}

export const panClient = {
  verify(input: { pan: string; name: string; dateOfBirth: string }) {
    return call<PanStartResult>('/api/partner/pan/verify', input);
  },
  confirm(reference: string, otp: string) {
    return call<PanConfirmResult>('/api/partner/pan/confirm', { reference, otp });
  },
};
