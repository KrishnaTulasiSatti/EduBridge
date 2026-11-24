import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { VaultRole } from '@eduvault/shared';
import { FullPageLoader } from '@/components/ui/loaders';
import { useAuth } from '@/context/AuthContext';

export { FullPageLoader };

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: VaultRole[] }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** For login/register: signed-in users go straight on. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageLoader />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/dashboard'} replace />;
  }
  return <>{children}</>;
}
