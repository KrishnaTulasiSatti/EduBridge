import type { AnalyticsDTO, AuditCategory, AuditEntryDTO, Role } from '@edubridge/shared';
import { api } from './api';

export interface AuditFilters {
  category?: AuditCategory;
  action?: string;
  role?: Role;
  actor?: string;
  actorId?: string;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
}

/** Drops empty values so they are not sent as `?actor=`. */
const clean = (f: AuditFilters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));

export const analyticsApi = {
  async summary() {
    return (await api.get<AnalyticsDTO>('/analytics')).data;
  },
  async auditList(filters: AuditFilters) {
    return (await api.get<{ items: AuditEntryDTO[]; total: number; page: number; limit: number }>('/audit', { params: clean(filters) })).data;
  },
  async auditEntry(id: string) {
    return (await api.get<{ entry: AuditEntryDTO; related: AuditEntryDTO[] }>(`/audit/${id}`)).data;
  },
  /** Downloads the filtered log as CSV (through the API so the request carries the access token). */
  async exportCsv(filters: AuditFilters) {
    const { page: _page, ...rest } = filters;
    const res = await api.get('/audit/export', { params: clean(rest), responseType: 'blob' });
    const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? 'edubridge-audit.csv';
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/** "2026-11" → "Nov" (or "Nov 2026" with the year). */
export function monthLabel(key: string, withYear = false) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
