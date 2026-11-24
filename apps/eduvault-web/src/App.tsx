import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { FullPageLoader, GuestRoute, ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ActivityBar } from '@/components/ui/loaders';
import { buttonVariants } from '@/components/ui/button';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import LandingPage from '@/pages/LandingPage';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ConsentPage = lazy(() => import('@/pages/ConsentPage'));
const StudentHome = lazy(() => import('@/pages/student/StudentHome'));
const MarksheetPage = lazy(() => import('@/pages/student/MarksheetPage'));
const SharingPage = lazy(() => import('@/pages/student/SharingPage'));
const IssuerHome = lazy(() => import('@/pages/issuer/IssuerHome'));
const StudentsPage = lazy(() => import('@/pages/issuer/StudentsPage'));
const MarksheetsPage = lazy(() => import('@/pages/issuer/MarksheetsPage'));
const MarksheetEditor = lazy(() => import('@/pages/issuer/MarksheetEditor'));
const IssuerMarksheetPage = lazy(() => import('@/pages/issuer/IssuerMarksheetPage'));
const AdminHome = lazy(() => import('@/pages/admin/AdminHome'));
const InstitutionsPage = lazy(() => import('@/pages/admin/InstitutionsPage'));
const AccountsPage = lazy(() => import('@/pages/admin/AccountsPage'));
const ActivityPage = lazy(() => import('@/pages/admin/ActivityPage'));

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

function Home() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <AdminHome />;
  if (user?.role === 'ISSUER') return <IssuerHome />;
  return <StudentHome />;
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-[28px] font-medium">Page not found</p>
        <p className="mt-2 text-muted-foreground">The page you are looking for does not exist.</p>
        <Link to="/" className={buttonVariants({ variant: 'secondary', className: 'mt-6' })}>
          Go to EduVault home
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ActivityBar />
          <Suspense fallback={<FullPageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
              <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
              <Route path="/consent/:requestId" element={<ProtectedRoute><ConsentPage /></ProtectedRoute>} />

              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<Home />} />
                {/* Student */}
                <Route path="documents/:id" element={<ProtectedRoute roles={['STUDENT']}><MarksheetPage /></ProtectedRoute>} />
                <Route path="sharing" element={<ProtectedRoute roles={['STUDENT']}><SharingPage /></ProtectedRoute>} />
                {/* Institution */}
                <Route path="students" element={<ProtectedRoute roles={['ISSUER']}><StudentsPage /></ProtectedRoute>} />
                <Route path="marksheets" element={<ProtectedRoute roles={['ISSUER']}><MarksheetsPage /></ProtectedRoute>} />
                <Route path="marksheets/new" element={<ProtectedRoute roles={['ISSUER']}><MarksheetEditor /></ProtectedRoute>} />
                <Route path="marksheets/:id" element={<ProtectedRoute roles={['ISSUER']}><IssuerMarksheetPage /></ProtectedRoute>} />
                <Route path="marksheets/:id/edit" element={<ProtectedRoute roles={['ISSUER']}><MarksheetEditor /></ProtectedRoute>} />
                {/* Administrator */}
                <Route path="institutions" element={<ProtectedRoute roles={['ADMIN']}><InstitutionsPage /></ProtectedRoute>} />
                <Route path="accounts" element={<ProtectedRoute roles={['ADMIN']}><AccountsPage /></ProtectedRoute>} />
                <Route path="activity" element={<ProtectedRoute roles={['ADMIN']}><ActivityPage /></ProtectedRoute>} />
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
