import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConsentRequestDTO,
  InstitutionDTO,
  InstitutionStatus,
  MarksheetDTO,
  MarksheetInput,
  MarksheetStatus,
  StudentRecordDTO,
  StudentRecordInput,
  VaultUser,
} from '@eduvault/shared';
import { api, getErrorMessage } from './api';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Enrolment extends StudentRecordDTO {
  institution: { id: string; name: string };
}

export interface IssuerOverview {
  institution: {
    id: string;
    name: string;
    university: string;
    code: string;
    city: string;
    state: string;
    status: InstitutionStatus;
    approvedAt?: string;
    signingKey?: { keyId: string; fingerprint: string; createdAt: string };
  };
  students: number;
  linked: number;
  marksheets: Partial<Record<MarksheetStatus, number>>;
  recent: MarksheetDTO[];
}

export interface Activity {
  id: string;
  action: string;
  actorName?: string;
  actorRole?: string;
  resourceType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminOverview {
  institutions: Record<string, number>;
  users: Record<string, number>;
  marksheets: Record<string, number>;
  consents: Record<string, number>;
  recent: Activity[];
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const vaultApi = {
  /* Student */
  myMarksheets: async () => (await api.get<{ items: MarksheetDTO[] }>('/me/marksheets')).data.items,
  myMarksheet: async (id: string) => (await api.get<{ marksheet: MarksheetDTO }>(`/me/marksheets/${id}`)).data.marksheet,
  myEnrolments: async () => (await api.get<{ items: Enrolment[] }>('/me/enrolments')).data.items,
  linkEnrolment: async (activationCode: string) => (await api.post<{ items: Enrolment[] }>('/me/enrolments', { activationCode })).data.items,
  myConsents: async () => (await api.get<{ items: ConsentRequestDTO[] }>('/me/consents')).data.items,
  consent: async (id: string) =>
    (await api.get<{ request: ConsentRequestDTO; marksheets: MarksheetDTO[]; returnUrl?: string }>(`/consents/${encodeURIComponent(id)}`)).data,
  approve: async (id: string, marksheetId: string) =>
    (await api.post<{ redirectUrl: string }>(`/consents/${encodeURIComponent(id)}/approve`, { marksheetId })).data.redirectUrl,
  deny: async (id: string) => (await api.post<{ redirectUrl: string }>(`/consents/${encodeURIComponent(id)}/deny`)).data.redirectUrl,

  /* Issuer */
  issuerOverview: async () => (await api.get<IssuerOverview>('/issuer/overview')).data,
  students: async (p: { search?: string; page?: number; limit?: number }) => (await api.get<Page<StudentRecordDTO>>(`/issuer/students${qs(p)}`)).data,
  enrol: async (body: StudentRecordInput) =>
    (await api.post<{ student: StudentRecordDTO; activationCode: string }>('/issuer/students', body)).data,
  newCode: async (id: string) => (await api.post<{ activationCode: string }>(`/issuer/students/${id}/activation-code`)).data.activationCode,
  marksheets: async (p: { search?: string; status?: string; page?: number }) =>
    (await api.get<Page<MarksheetDTO>>(`/issuer/marksheets${qs(p)}`)).data,
  marksheet: async (id: string) => (await api.get<{ marksheet: MarksheetDTO }>(`/issuer/marksheets/${id}`)).data.marksheet,
  createMarksheet: async (body: MarksheetInput, file: File, onProgress?: (pct: number) => void) =>
    (await api.post<{ marksheet: MarksheetDTO }>('/issuer/marksheets', marksheetForm(body, file), progress(onProgress))).data.marksheet,
  updateMarksheet: async (id: string, body: MarksheetInput, file?: File, onProgress?: (pct: number) => void) =>
    (await api.put<{ marksheet: MarksheetDTO }>(`/issuer/marksheets/${id}`, marksheetForm(body, file), progress(onProgress))).data.marksheet,
  deleteMarksheet: async (id: string) => {
    await api.delete(`/issuer/marksheets/${id}`);
  },
  issue: async (id: string) => (await api.post<{ marksheet: MarksheetDTO }>(`/issuer/marksheets/${id}/issue`)).data.marksheet,
  revoke: async (id: string, reason: string) =>
    (await api.post<{ marksheet: MarksheetDTO }>(`/issuer/marksheets/${id}/revoke`, { reason })).data.marksheet,

  /* Admin */
  adminOverview: async () => (await api.get<AdminOverview>('/admin/overview')).data,
  institutions: async (p: { search?: string; status?: string; page?: number }) =>
    (await api.get<Page<InstitutionDTO>>(`/admin/institutions${qs(p)}`)).data,
  setInstitutionStatus: async (id: string, status: Exclude<InstitutionStatus, 'PENDING'>) =>
    (await api.patch<{ institution: InstitutionDTO }>(`/admin/institutions/${id}/status`, { status })).data.institution,
  users: async (p: { search?: string; role?: string; status?: string; page?: number }) =>
    (await api.get<Page<VaultUser>>(`/admin/users${qs(p)}`)).data,
  setUserStatus: async (id: string, status: 'ACTIVE' | 'SUSPENDED') =>
    (await api.patch<{ user: VaultUser }>(`/admin/users/${id}/status`, { status })).data.user,
  activity: async (p: { action?: string; page?: number }) => (await api.get<Page<Activity>>(`/admin/activity${qs(p)}`)).data,
};

/** Loads data with `fn` whenever `deps` change. Keeps the previous data while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, error, loading, reload };
}

/** Marksheet details go as form fields next to the PDF. */
function marksheetForm(body: MarksheetInput, file?: File) {
  const form = new FormData();
  Object.entries(body).forEach(([k, v]) => v !== undefined && v !== null && form.append(k, String(v)));
  if (file) form.append('file', file);
  return form;
}
const progress = (onProgress?: (pct: number) => void) => ({
  onUploadProgress: (e: { loaded: number; total?: number }) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
});

/** Fetches a marksheet PDF with the user's token. Files are never served from a public URL. */
export async function fetchMarksheetPdf(id: string, as: 'issuer' | 'student') {
  const path = as === 'issuer' ? `/issuer/marksheets/${id}/file` : `/me/marksheets/${id}/file`;
  const res = await api.get(path, { responseType: 'blob' });
  return res.data as Blob;
}

export const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Account created',
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  ACCOUNT_LOCKED: 'Account locked',
  LOGOUT: 'Signed out',
  REFRESH_TOKEN_REUSE: 'Session token reused',
  USER_STATUS_CHANGED: 'Account status changed',
  INSTITUTION_REGISTERED: 'Institution registered',
  INSTITUTION_STATUS_CHANGED: 'Institution status changed',
  SIGNING_KEY_CREATED: 'Signing key created',
  STUDENT_ENROLLED: 'Student enrolled',
  ACTIVATION_CODE_ISSUED: 'Activation code reissued',
  ENROLMENT_LINKED: 'Student account linked',
  MARKSHEET_CREATED: 'Marksheet drafted',
  MARKSHEET_ISSUED: 'Marksheet issued',
  MARKSHEET_REVOKED: 'Marksheet revoked',
  ACCESS_REQUESTED: 'Partner requested access',
  CONSENT_GRANTED: 'Consent given',
  CONSENT_DENIED: 'Consent declined',
  DOCUMENT_SHARED: 'Document shared',
  SHARE_REDEEM_FAILED: 'Invalid sharing reference used',
};
