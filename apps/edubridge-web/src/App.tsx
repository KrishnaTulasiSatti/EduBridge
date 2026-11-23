import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { NAVIGATION } from '@/components/layout/navigation';
import { FullPageLoader, GuestRoute, ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import LandingPage from '@/pages/LandingPage';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'));
const UsersPage = lazy(() => import('@/pages/dashboard/UsersPage'));
const ComingSoon = lazy(() => import('@/pages/dashboard/ComingSoon'));
const ApplicationPage = lazy(() => import('@/pages/student/ApplicationPage'));
const DocumentsPage = lazy(() => import('@/pages/student/DocumentsPage'));
const ProfilePage = lazy(() => import('@/pages/student/ProfilePage'));
const EduVaultCallback = lazy(() => import('@/pages/student/EduVaultCallback'));
const ApplicationsPage = lazy(() => import('@/pages/admin/ApplicationsPage'));
const QueuePage = lazy(() => import('@/pages/verification/QueuePage'));
const VerifyApplicationPage = lazy(() => import('@/pages/verification/VerifyApplicationPage'));
const ReviewQueuePage = lazy(() => import('@/pages/review/ReviewQueuePage'));
const ReviewApplicationPage = lazy(() => import('@/pages/review/ReviewApplicationPage'));
const ModelPage = lazy(() => import('@/pages/review/ModelPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// Pages that are not built yet render a placeholder.
const placeholderPaths = [
  ...new Set(
    Object.values(NAVIGATION)
      .flat()
      .filter((n) => n.phase)
      .map((n) => n.to.replace('/dashboard/', '')),
  ),
];

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      toastOptions={{
        style: {
          borderRadius: 10,
          background: 'var(--surface)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-sans)',
        },
      }}
    />
  );
}

const student = ['STUDENT'] as const;

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<FullPageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
              <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />

              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardHome />} />
                <Route path="application" element={<ProtectedRoute roles={[...student]}><ApplicationPage /></ProtectedRoute>} />
                <Route path="documents" element={<ProtectedRoute roles={[...student]}><DocumentsPage /></ProtectedRoute>} />
                <Route path="profile" element={<ProtectedRoute roles={[...student]}><ProfilePage /></ProtectedRoute>} />
                <Route path="eduvault/callback" element={<ProtectedRoute roles={[...student]}><EduVaultCallback /></ProtectedRoute>} />
                <Route path="applications" element={<ProtectedRoute roles={['ADMIN']}><ApplicationsPage /></ProtectedRoute>} />
                <Route
                  path="queue"
                  element={
                    <ProtectedRoute roles={['VOLUNTEER']}>
                      <QueuePage key="queue" title="Verification queue" description="Applications waiting for preliminary verification, oldest first. Start one to claim it." scopes={['available', 'mine']} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reviewed"
                  element={
                    <ProtectedRoute roles={['VOLUNTEER']}>
                      <QueuePage key="reviewed" title="Reviewed" description="Applications you have verified and the recommendation you gave." scopes={['reviewed']} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="verification"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <QueuePage key="verification" title="Verification" description="Document verification across every application. Admins can also verify applications themselves." scopes={['all', 'available', 'mine', 'reviewed']} />
                    </ProtectedRoute>
                  }
                />
                <Route path="verify/:id" element={<ProtectedRoute roles={['VOLUNTEER', 'ADMIN']}><VerifyApplicationPage /></ProtectedRoute>} />
                <Route path="review" element={<ProtectedRoute roles={['ADMIN']}><ReviewQueuePage /></ProtectedRoute>} />
                <Route path="review/:id" element={<ProtectedRoute roles={['ADMIN']}><ReviewApplicationPage /></ProtectedRoute>} />
                <Route path="model" element={<ProtectedRoute roles={['ADMIN']}><ModelPage /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute roles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
                {placeholderPaths.map((p) => (
                  <Route key={p} path={p} element={<ComingSoon />} />
                ))}
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <ThemedToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
