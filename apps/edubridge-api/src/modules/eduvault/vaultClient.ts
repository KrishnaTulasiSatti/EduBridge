import type {
  AccessRequestInput,
  AccessRequestResponse,
  EnrolmentCheckInput,
  EnrolmentCheckResponse,
  IssuerRegistryEntry,
  RedeemResponse,
} from '@eduvault/shared';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

/**
 * Server-to-server client for EduVault. EduBridge authenticates as a registered partner with its
 * client ID and secret; the secret never reaches the browser.
 */
export class VaultError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const unavailable = () =>
  new AppError(503, 'EDUVAULT_UNAVAILABLE', 'EduVault is not reachable right now. Please try again in a few minutes, or upload a copy instead.');

async function call<T>(path: string, init: RequestInit & { partner?: boolean } = {}): Promise<T> {
  if (init.partner && !env.EDUVAULT_CLIENT_SECRET) {
    throw new AppError(503, 'EDUVAULT_NOT_CONFIGURED', 'EduVault import is not configured on this server.');
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.partner) {
    headers.Authorization = `Basic ${Buffer.from(`${env.EDUVAULT_CLIENT_ID}:${env.EDUVAULT_CLIENT_SECRET}`).toString('base64')}`;
  }
  let res: Response;
  try {
    res = await fetch(`${env.EDUVAULT_API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw unavailable();
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string } }) | null;
  if (!res.ok) {
    if (res.status >= 500 || !body?.error) throw unavailable();
    throw new VaultError(res.status, body.error.code, body.error.message);
  }
  return body as T;
}

export const vaultClient = {
  createAccessRequest(input: AccessRequestInput) {
    return call<AccessRequestResponse>('/api/partner/access-requests', { method: 'POST', partner: true, body: JSON.stringify(input) });
  },
  redeem(code: string) {
    return call<RedeemResponse>('/api/partner/documents/redeem', { method: 'POST', partner: true, body: JSON.stringify({ code }) });
  },
  /** The issuer registry is public: the key is fetched separately from the document it verifies. */
  /** Asks the college's EduVault records whether this exact roll number is enrolled there. */
  checkEnrolment(input: EnrolmentCheckInput) {
    return call<EnrolmentCheckResponse>('/api/partner/enrolments/check', { method: 'POST', partner: true, body: JSON.stringify(input) });
  },
  /** Every institution registered with EduVault (used to check a college is registered). */
  listIssuers() {
    return call<{ items: IssuerRegistryEntry[] }>('/api/registry/issuers');
  },
  getIssuer(institutionId: string) {
    return call<IssuerRegistryEntry>(`/api/registry/issuers/${encodeURIComponent(institutionId)}`);
  },
};
