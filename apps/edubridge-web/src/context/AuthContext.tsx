import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@edubridge/shared';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api';

interface RegisterResult {
  user: PublicUser;
  pendingApproval?: boolean;
}

interface AuthContextValue {
  user: PublicUser | null;
  initializing: boolean;
  login: (input: LoginInput) => Promise<PublicUser>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Non-sensitive hint that a refresh cookie may exist, so guests skip a pointless /refresh call.
const SESSION_HINT = 'eb-has-session';
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
  const [user, setUser] = useState<PublicUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from the httpOnly refresh cookie on first load.
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

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await api.post<AuthResponse>('/auth/login', input);
    setAccessToken(data.accessToken);
    hint.set(true);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { data } = await api.post<AuthResponse & { pendingApproval?: boolean }>('/auth/register', input);
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      hint.set(true);
      setUser(data.user);
    }
    return { user: data.user, pendingApproval: data.pendingApproval };
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
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
