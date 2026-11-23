import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IssuerRegisterInput, LoginInput, StudentRegisterInput, VaultAuthResponse, VaultUser } from '@eduvault/shared';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api';

interface AuthContextValue {
  user: VaultUser | null;
  initializing: boolean;
  login: (input: LoginInput) => Promise<VaultUser>;
  registerStudent: (input: StudentRegisterInput) => Promise<VaultUser>;
  registerInstitution: (input: IssuerRegisterInput) => Promise<VaultUser>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Non-sensitive hint that a refresh cookie may exist, so guests skip a pointless /refresh call.
const SESSION_HINT = 'ev-has-session';
const hint = {
  get: () => {
    try {
      return localStorage.getItem(SESSION_HINT) === '1';
    } catch {
      return true;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) localStorage.setItem(SESSION_HINT, '1');
      else localStorage.removeItem(SESSION_HINT);
    } catch {
      /* storage unavailable */
    }
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<VaultUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      hint.set(false);
      setUser(null);
    });
    if (!hint.get()) {
      setInitializing(false);
      return;
    }
    refreshSession()
      .then((r) => setUser(r.user))
      .catch(() => {
        hint.set(false);
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, []);

  const accept = useCallback((data: VaultAuthResponse) => {
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      hint.set(true);
      setUser(data.user);
    }
    return data.user;
  }, []);

  const login = useCallback(async (input: LoginInput) => accept((await api.post<VaultAuthResponse>('/auth/login', input)).data), [accept]);
  const registerStudent = useCallback(
    async (input: StudentRegisterInput) => accept((await api.post<VaultAuthResponse>('/auth/register/student', input)).data),
    [accept],
  );
  const registerInstitution = useCallback(
    async (input: IssuerRegisterInput) => (await api.post<VaultAuthResponse>('/auth/register/institution', input)).data.user,
    [],
  );

  const reload = useCallback(async () => {
    const { data } = await api.get<{ user: VaultUser }>('/auth/me');
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      hint.set(false);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, registerStudent, registerInstitution, logout, reload }),
    [user, initializing, login, registerStudent, registerInstitution, logout, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
