import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import {
  DOCUMENT_TYPES,
  educationSchema,
  familySchema,
  personalSchema,
  supportSchema,
  type ApplicationDTO,
  type DocumentStatus,
  type DocumentType,
  type StudentProfileDTO,
} from '@edubridge/shared';
import { api, getErrorMessage } from './api';

/* ---------------------------------------------------------------- API */

export const studentApi = {
  async profile() {
    return (await api.get<{ profile: StudentProfileDTO }>('/profile/me')).data.profile;
  },
  async saveProfile(body: { personal?: unknown; education?: unknown }) {
    return (await api.patch<{ profile: StudentProfileDTO; rejected: string[] }>('/profile/me', body)).data.profile;
  },
  async application() {
    return (await api.get<{ application: ApplicationDTO | null }>('/applications/current')).data.application;
  },
  async start() {
    return (await api.post<{ application: ApplicationDTO }>('/applications/current')).data.application;
  },
  async saveApplication(body: { family?: unknown; support?: unknown }) {
    return (await api.patch<{ application: ApplicationDTO; rejected: string[] }>('/applications/current', body)).data.application;
  },
  async upload(type: DocumentType, file: File, extra: Record<string, string>, onProgress?: (pct: number) => void) {
    const form = new FormData();
    form.append('type', type);
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
    form.append('file', file);
    const { data } = await api.post<{ application: ApplicationDTO }>('/applications/current/documents', form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
    return data.application;
  },
  async removeDocument(id: string) {
    return (await api.delete<{ application: ApplicationDTO }>(`/applications/current/documents/${id}`)).data.application;
  },
  /** Starts "Verify using EduVault" and returns the EduVault consent page to send the student to. */
  async startVaultImport() {
    return (await api.post<{ consentUrl: string }>('/eduvault/requests')).data.consentUrl;
  },
  async completeVaultImport(body: { state: string; code?: string; error?: string }) {
    return (await api.post<{ outcome: DocumentStatus | 'DECLINED'; application: ApplicationDTO }>('/eduvault/complete', body)).data;
  },
  async submit() {
    return (await api.post<{ application: ApplicationDTO }>('/applications/current/submit', { declaration: true, consentToVerify: true })).data
      .application;
  },
};

/** Opens a private document in a new tab. The file is fetched with the user's token, never via a public URL. */
export async function openDocument(id: string) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(`/documents/${id}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw new Error(getErrorMessage(err, 'Could not open the document'));
  }
}

/** Where to return after EduVault sends the student back. Kept for this tab only. */
const VAULT_RETURN = 'eb-vault-return';
export const vaultReturn = {
  set(path: string) {
    try {
      sessionStorage.setItem(VAULT_RETURN, path);
    } catch {
      /* storage unavailable */
    }
  },
  take() {
    try {
      const v = sessionStorage.getItem(VAULT_RETURN);
      sessionStorage.removeItem(VAULT_RETURN);
      return v && v.startsWith('/dashboard') ? v : '/dashboard/application?step=documents';
    } catch {
      return '/dashboard/application?step=documents';
    }
  },
};

/* ---------------------------------------------------------- Data hook */

export function useStudentData() {
  const [profile, setProfile] = useState<StudentProfileDTO | null>(null);
  const [application, setApplication] = useState<ApplicationDTO | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([studentApi.profile(), studentApi.application()]);
      setProfile(p);
      setApplication(a);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { profile, application, setProfile, setApplication, error, reload: load, loading: application === undefined && !error };
}

/* --------------------------------------------------------- Completion */

export type SectionId = 'personal' | 'education' | 'family' | 'support' | 'documents';

export function sectionCompletion(profile: StudentProfileDTO | null, application: ApplicationDTO | null | undefined) {
  const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v ?? {}).success;
  const docs = application?.documents ?? [];
  return {
    personal: ok(personalSchema, profile?.personal),
    education: ok(educationSchema, profile?.education),
    family: ok(familySchema, application?.family),
    support: ok(supportSchema, application?.support),
    documents: DOCUMENT_TYPES.every((t) => docs.some((d) => d.type === t)),
  } satisfies Record<SectionId, boolean>;
}

/* ------------------------------------------------------------ Autosave */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Saves form values a moment after the user stops typing.
 * Returns the save state and a `flush` to save immediately (e.g. before leaving a step).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAutosave<T extends FieldValues>(form: UseFormReturn<T, any, any>, save: (values: T) => Promise<void>, delay = 900) {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async () => {
    const values = pending.current;
    if (!values) return;
    pending.current = null;
    setState('saving');
    try {
      await saveRef.current(values);
      setState('saved');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    const sub = form.watch((values) => {
      pending.current = JSON.parse(JSON.stringify(values)) as T;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(run, delay);
    });
    return () => {
      sub.unsubscribe();
      window.clearTimeout(timer.current);
      if (pending.current) void run();
    };
  }, [form, run, delay]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (pending.current) await run();
  }, [run]);

  return { state, flush };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso?: string, withTime = false) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}
