import { useCallback, useEffect, useState } from 'react';
import type {
  AssessmentDTO,
  DecisionDTO,
  DecisionInput,
  ModelStatusDTO,
  ReviewQueueItemDTO,
  VerificationDetailDTO,
} from '@edubridge/shared';
import { api, getErrorMessage } from './api';

export type ReviewDetail = VerificationDetailDTO & { assessment?: AssessmentDTO; decision?: DecisionDTO; canDecide: boolean };
export type ReviewTab = 'awaiting' | 'on_hold' | 'decided';
export interface ReviewQueue {
  items: ReviewQueueItemDTO[];
  total: number;
  page: number;
  limit: number;
  counts: { awaiting: number; onHold: number };
}

export const reviewApi = {
  async detail(id: string) {
    return (await api.get<ReviewDetail>(`/review/applications/${id}`)).data;
  },
  async reassess(id: string) {
    return (await api.post<ReviewDetail>(`/review/applications/${id}/assess`)).data;
  },
  async decide(id: string, body: DecisionInput) {
    return (await api.post<ReviewDetail>(`/review/applications/${id}/decision`, body)).data;
  },
  async model() {
    return (await api.get<ModelStatusDTO>('/review/model')).data;
  },
  async train(source: 'REVIEWED_DECISIONS' | 'SYNTHETIC_DEMO') {
    return (await api.post<ModelStatusDTO>('/review/model/train', { source }, { timeout: 180_000 })).data;
  },
};

export function useReviewQueue(params: { tab: ReviewTab; search?: string; page?: number }) {
  const [data, setData] = useState<ReviewQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get<ReviewQueue>('/review/queue', { params: JSON.parse(key) })
        .then((r) => {
          setData(r.data);
          setError(null);
        })
        .catch((e) => setError(getErrorMessage(e)))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [key]);
  return { data, loading, error };
}

export function useReviewDetail(id: string) {
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await reviewApi.detail(id));
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, setData, error, reload: load };
}

export function useModelStatus() {
  const [data, setData] = useState<ModelStatusDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await reviewApi.model());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, setData, error, reload: load };
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
