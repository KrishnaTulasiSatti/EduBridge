import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError, VaultAuthResponse as AuthResponse } from '@eduvault/shared';

const baseURL = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export const api = axios.create({ baseURL, withCredentials: true });

// The access token lives only in memory (never localStorage) to limit XSS exposure.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<AuthResponse> | null = null;
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

/** Single-flight refresh: concurrent 401s share one refresh request. */
export function refreshSession() {
  refreshPromise ??= axios
    .post<AuthResponse>(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
    .then((r) => {
      setAccessToken(r.data.accessToken);
      return r.data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (axios.isAxiosError<ApiError>(err)) {
    if (!err.response) return 'Cannot reach the server. Check your connection and that the API is running.';
    return err.response.data?.error?.message ?? fallback;
  }
  return fallback;
}

export function getFieldErrors(err: unknown): Record<string, string[]> | undefined {
  if (axios.isAxiosError<ApiError>(err)) return err.response?.data?.error?.details;
  return undefined;
}
