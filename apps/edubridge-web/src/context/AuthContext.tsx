import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@edubridge/shared';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api';
import { clearActivity, isIdleExpired, markActivity } from '@/lib/session';

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
  /** True after this tab signed the user out for being idle (read once by the login page). */
  idleSignedOut: boolean;
  signOutIdle: () => Promise<void>;
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
  const [idleSignedOut, setIdleSignedOut] = useState(false);

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
    // Idle for too long since the last visit (e.g. the browser restored its old session): end it.
    if (isIdleExpired()) {
      hint.set(false);
      clearActivity();
      setIdleSignedOut(true);
      api.post('/auth/logout').catch(() => undefined).finally(() => setInitializing(false));
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

  // Signing out in one tab signs out every other open tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_HINT && e.newValue === null) {
        setAccessToken(null);
        setUser(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await api.post<AuthResponse>('/auth/login', input);
    setAccessToken(data.accessToken);
    markActivity();
    hint.set(true);
    setIdleSignedOut(false);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { data } = await api.post<AuthResponse & { pendingApproval?: boolean }>('/auth/register', input);
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      markActivity();
      hint.set(true);
      setIdleSignedOut(false);
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
      clearActivity();
      setUser(null);
    }
  }, []);

  const signOutIdle = useCallback(async () => {
    setIdleSignedOut(true);
    await logout();
  }, [logout]);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout, idleSignedOut, signOutIdle }),
    [user, initializing, login, register, logout, idleSignedOut, signOutIdle],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
