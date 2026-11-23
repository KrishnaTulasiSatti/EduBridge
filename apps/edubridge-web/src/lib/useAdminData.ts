import { useCallback, useEffect, useState } from 'react';
import type { AccountStatus, ApplicationSummaryDTO, PublicUser, Role } from '@edubridge/shared';
import { api, getErrorMessage } from './api';

export interface AdminStats {
  counts: Record<Role, number>;
  applications: Record<string, number>;
  pendingVolunteers: number;
  recentActivity: {
    id: string;
    action: string;
    resourceType: string;
    actor: { name?: string; role?: string } | null;
    createdAt: string;
  }[];
}

/** Fetches a list endpoint with debounced, serialised params. */
function useList<T>(url: string, params: object) {
  const [data, setData] = useState<{ items: T[]; total: number; page: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(url, { params: JSON.parse(key) })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [url, key]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return { data, loading, error, reload: load };
}

export function useAdminStats() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .get<AdminStats>('/users/stats')
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, []);
  useEffect(load, [load]);
  return { data, error, reload: load };
}

export interface UserFilters {
  role?: Role;
  status?: AccountStatus;
  search?: string;
  page?: number;
}
export const useUsers = (filters: UserFilters) => useList<PublicUser>('/users', filters);

export interface ApplicationFilters {
  status?: string;
  search?: string;
  page?: number;
}
export const useApplicationList = (filters: ApplicationFilters) => useList<ApplicationSummaryDTO>('/applications', filters);

export async function updateUserStatus(id: string, status: AccountStatus) {
  const { data } = await api.patch<{ user: PublicUser }>(`/users/${id}/status`, { status });
  return data.user;
}

export const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'created an account',
  LOGIN_SUCCESS: 'signed in',
  LOGIN_FAILED: 'had a failed sign-in attempt',
  ACCOUNT_LOCKED: 'was locked after repeated failed sign-ins',
  LOGOUT: 'signed out',
  REFRESH_TOKEN_REUSE: 'triggered a session security alert',
  USER_STATUS_CHANGED: 'changed an account status',
  APPLICATION_CREATED: 'started an application',
  APPLICATION_SUBMITTED: 'submitted an application',
  DOCUMENT_UPLOADED: 'uploaded a document',
  DOCUMENT_DELETED: 'removed a document',
  DOCUMENT_VIEWED: 'viewed a student document',
  EDUVAULT_IMPORTED: 'imported a marksheet from EduVault',
  VERIFICATION_CLAIMED: 'started verifying an application',
  VERIFICATION_RELEASED: 'returned an application to the queue',
  DOCUMENT_REVIEWED: 'recorded a document check',
  ENROLMENT_CHECKED: 'checked a college enrolment on EduVault',
  AADHAAR_VIEWED: 'viewed a student’s Aadhaar number',
  ASSESSMENT_RUN: 'ran a need assessment',
  APPLICATION_DECIDED: 'recorded an eligibility decision',
  MODEL_TRAINED: 'trained the need model',
  VOLUNTEER_REVIEW_SUBMITTED: 'submitted a volunteer review',
};
