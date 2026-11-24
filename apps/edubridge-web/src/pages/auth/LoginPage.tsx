import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@edubridge/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { IDLE_MINUTES } from '@/lib/session';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const { login, idleSignedOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
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
    <AuthLayout>
      <h1 className="font-display text-[32px] font-medium">Sign in</h1>
      <p className="mt-2 text-muted-foreground">Welcome back to EduBridge.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        {!formError && idleSignedOut && (
          <Alert tone="info">You were signed out because there was no activity for {IDLE_MINUTES} minutes. Please sign in again.</Alert>
        )}
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
              onClick={() => toast('Please contact an administrator to reset your password.')}
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
        New to EduBridge?{' '}
        <Link to="/register" className="font-medium text-primary-ink hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
