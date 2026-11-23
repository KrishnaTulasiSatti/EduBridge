import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@eduvault/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const fromConsent = from?.startsWith('/consent/');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginInput) => {
    setFormError(null);
    try {
      await login(values);
      navigate(from ?? '/dashboard', { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <AuthLayout
      aside={
        fromConsent
          ? { title: 'A service is asking for one of your documents.', text: 'Sign in to see exactly what is being requested and why. Nothing is shared unless you approve it.' }
          : undefined
      }
    >
      <h1 className="font-display text-[32px] font-medium">Sign in to EduVault</h1>
      <p className="mt-2 text-muted-foreground">
        {fromConsent ? 'Sign in to review the request.' : 'Students, institutions and administrators sign in here.'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          action={
            <button
              type="button"
              onClick={() => toast('Please contact your institution or the EduVault administrator to reset your password.')}
              className="cursor-pointer text-[13px] text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </button>
          }
        >
          <Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        No account yet?{' '}
        <Link to="/register" state={location.state} className="font-medium text-primary-ink hover:underline">
          Activate your EduVault account
        </Link>
      </p>
    </AuthLayout>
  );
}
