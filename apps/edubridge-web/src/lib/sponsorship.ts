import { useCallback, useEffect, useState } from 'react';
import type {
  CertificateDTO,
  ConfirmSponsorshipInput,
  EducationLevel,
  NeedLevel,
  PledgeInput,
  SponsorPreferences,
  SponsorProfileDTO,
  SponsorStudentCardDTO,
  SponsorshipDTO,
  SponsorshipOverviewDTO,
  SponsorshipStatus,
  SponsorVisibilityInput,
  StudentFundingDTO,
} from '@edubridge/shared';
import { api, getErrorMessage } from './api';

export interface DiscoverResult {
  items: SponsorStudentCardDTO[];
  total: number;
  page: number;
  limit: number;
  available: number;
}
export interface DiscoverParams {
  sort: 'match' | 'need' | 'remaining';
  level?: EducationLevel;
  need?: NeedLevel;
  page: number;
}
export interface AdminSponsorships {
  items: SponsorshipDTO[];
  total: number;
  page: number;
  limit: number;
}

export const sponsorApi = {
  async preferences() {
    return (await api.get<{ profile: SponsorProfileDTO | null }>('/sponsor/preferences')).data.profile;
  },
  async savePreferences(body: SponsorPreferences) {
    return (await api.put<{ profile: SponsorProfileDTO }>('/sponsor/preferences', body)).data.profile;
  },
  async student(id: string) {
    return (await api.get<{ student: SponsorStudentCardDTO; available: number }>(`/sponsor/students/${id}`)).data;
  },
  async pledge(id: string, body: PledgeInput) {
    return (await api.post<{ sponsorship: SponsorshipDTO }>(`/sponsor/students/${id}/pledge`, body)).data.sponsorship;
  },
  async sponsorships() {
    return (await api.get<{ items: SponsorshipDTO[] }>('/sponsor/sponsorships')).data.items;
  },
  async withdraw(id: string) {
    return (await api.post<{ items: SponsorshipDTO[] }>(`/sponsor/sponsorships/${id}/withdraw`)).data.items;
  },
};

export const fundingApi = {
  async me() {
    return (await api.get<StudentFundingDTO>('/funding/me')).data;
  },
  async setVisibility(body: SponsorVisibilityInput) {
    return (await api.put<StudentFundingDTO>('/funding/me/visibility', body)).data;
  },
};

export const adminSponsorshipApi = {
  async overview() {
    return (await api.get<SponsorshipOverviewDTO>('/sponsorships/overview')).data;
  },
  async confirm(id: string, body: ConfirmSponsorshipInput) {
    return (await api.post<{ sponsorship: SponsorshipDTO }>(`/sponsorships/${id}/confirm`, body)).data.sponsorship;
  },
  async cancel(id: string, reason: string) {
    return (await api.post<{ sponsorship: SponsorshipDTO }>(`/sponsorships/${id}/cancel`, { reason })).data.sponsorship;
  },
};

export const certificateApi = {
  async verify(number: string, code: string) {
    return (await api.get<{ certificate: CertificateDTO }>(`/certificates/${encodeURIComponent(number)}`, { params: { code } })).data.certificate;
  },
};

export const certificateLink = (c: { number: string; code: string }) => `/certificates/${c.number}?code=${c.code}`;

/** Generic loader: returns data, error and a reload function. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
      setErrorCode(undefined);
    } catch (e) {
      setError(getErrorMessage(e));
      setErrorCode((e as { response?: { data?: { error?: { code?: string } } } }).response?.data?.error?.code);
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, setData, error, errorCode, loading, reload };
}

export function useDiscover(params: DiscoverParams) {
  const key = JSON.stringify(params);
  return useLoad(async () => (await api.get<DiscoverResult>('/sponsor/students', { params: JSON.parse(key) })).data, [key]);
}

export function useAdminSponsorships(params: { status?: SponsorshipStatus; search?: string; page: number }) {
  const key = JSON.stringify(params);
  const [data, setData] = useState<AdminSponsorships | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get<AdminSponsorships>('/sponsorships', { params: JSON.parse(key) })
        .then((r) => {
          setData(r.data);
          setError(null);
        })
        .catch((e) => setError(getErrorMessage(e)))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [key, tick]);
  return { data, setData, loading, error, reload: () => setTick((n) => n + 1) };
}

export const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);
