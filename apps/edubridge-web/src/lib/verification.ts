import { useCallback, useEffect, useState } from 'react';
import type {
  DocumentReviewInput,
  QueueItemDTO,
  QueueScope,
  VerificationDetailDTO,
  VerificationStatsDTO,
  VolunteerReviewInput,
} from '@edubridge/shared';
import { api, getErrorMessage } from './api';

export const verificationApi = {
  async detail(id: string) {
    return (await api.get<VerificationDetailDTO>(`/verification/applications/${id}`)).data;
  },
  async claim(id: string) {
    return (await api.post<VerificationDetailDTO>(`/verification/applications/${id}/claim`)).data;
  },
  async release(id: string) {
    await api.post(`/verification/applications/${id}/release`);
  },
  /** Full Aadhaar for the AP Seva search. Audited on the server; never cached. */
  async revealAadhaar(id: string, docId: string) {
    return (await api.post<{ aadhaarNumber: string }>(`/verification/applications/${id}/documents/${docId}/aadhaar`)).data.aadhaarNumber;
  },
  /** Re-runs the automatic college enrolment check against EduVault. */
  async recheckEnrolment(id: string) {
    return (await api.post<VerificationDetailDTO>(`/verification/applications/${id}/enrolment-check`)).data;
  },
  async reviewDocument(id: string, docId: string, body: DocumentReviewInput) {
    return (await api.post<VerificationDetailDTO>(`/verification/applications/${id}/documents/${docId}/review`, body)).data;
  },
  async submitReview(id: string, body: VolunteerReviewInput) {
    return (await api.post<VerificationDetailDTO>(`/verification/applications/${id}/review`, body)).data;
  },
};

export interface QueueParams {
  scope: QueueScope;
  search?: string;
  page?: number;
}

export function useQueue(params: QueueParams) {
  const [data, setData] = useState<{ items: QueueItemDTO[]; total: number; page: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/verification/queue', { params: JSON.parse(key) })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return { data, loading, error, reload: load };
}

export function useVerificationStats() {
  const [data, setData] = useState<VerificationStatsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<VerificationStatsDTO>('/verification/stats')
      .then((r) => setData(r.data))
      .catch((e) => setError(getErrorMessage(e)));
  }, []);
  return { data, error };
}

export function useVerificationDetail(id: string) {
  const [data, setData] = useState<VerificationDetailDTO | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await verificationApi.detail(id));
      setError(null);
    } catch (e) {
      setError({ message: getErrorMessage(e), status: (e as { response?: { status?: number } }).response?.status });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, error, reload: load };
}
