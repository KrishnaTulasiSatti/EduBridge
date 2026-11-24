import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerSchema, SELF_REGISTER_ROLES, type RegisterInput, type SelfRegisterRole } from '@edubridge/shared';
import { SponsorPanCheck, type VerifiedPan } from '@/components/auth/SponsorPanCheck';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AuthLayout } from './AuthLayout';

const roleOptions: Record<SelfRegisterRole, { title: string; text: string }> = {
  STUDENT: { title: 'Student', text: 'I need support for my education' },
  SPONSOR: { title: 'Sponsor', text: 'I want to support a student' },
  VOLUNTEER: { title: 'Volunteer', text: 'I want to help verify applications' },
};

const asides: Record<SelfRegisterRole, { title: string; text: string }> = {
  STUDENT: {
    title: 'One application, reviewed fairly.',
    text: 'You can follow your application at every stage. Your name, contact details and documents are never shown to sponsors.',
  },
  SPONSOR: {
    title: 'Support students you can trust.',
    text: 'Every student you see has verified documents and has been approved by an administrator. Sponsors verify their PAN when they sign up, and every contribution is recorded.',
  },
  VOLUNTEER: {
    title: 'Be the careful second look.',
    text: 'Volunteers compare documents with applications and flag anything that does not match. Accounts are activated by an administrator.',
  },
};

const rules = [
  { label: '8 or more characters', test: (p: string) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'A number', test: (p: string) => /\d/.test(p) },
];

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialRole = (SELF_REGISTER_ROLES as readonly string[]).includes(params.get('role') ?? '')
    ? (params.get('role') as SelfRegisterRole)
    : 'STUDENT';
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verifiedPan, setVerifiedPan] = useState<VerifiedPan | null>(null);
  const [panError, setPanError] = useState<string | undefined>();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: initialRole, fullName: '', email: '', phone: '', password: '' },
  });

  const role = watch('role');
  const password = watch('password') ?? '';
  const fullName = watch('fullName') ?? '';
  const isSponsor = role === 'SPONSOR';

  const onSubmit = async (values: RegisterInput) => {
    setFormError(null);
    setPanError(undefined);
    if (isSponsor && !verifiedPan) {
      setPanError('Verify your PAN before creating your account.');
      return;
    }
    try {
      const res = await registerUser({ ...values, panToken: isSponsor ? verifiedPan?.panToken : undefined });
      if (res.pendingApproval) {
        setPending(true);
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const fields = getFieldErrors(err);
      if (fields?.panToken) {
        // The verification expired or was already used: verify again.
        setVerifiedPan(null);
        setPanError(fields.panToken[0]);
        return;
      }
      if (fields) Object.entries(fields).forEach(([k, v]) => setError(k as keyof RegisterInput, { message: v[0] }));
      setFormError(getErrorMessage(err));
    }
  };

  if (pending) {
    return (
      <AuthLayout aside={asides.VOLUNTEER}>
        <h1 className="font-display text-[32px] font-medium">Thank you for volunteering</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Volunteers handle sensitive student documents, so an administrator reviews every volunteer account before it is
          activated. You will be able to sign in once your account is approved.
        </p>
        <Link to="/" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-8')}>
          Return to the home page
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout aside={asides[role]}>
      <h1 className="font-display text-[32px] font-medium">Create your account</h1>
      <p className="mt-2 text-muted-foreground">Choose how you would like to take part.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        <fieldset>
          <legend className="sr-only">I am joining as</legend>
          <div className="space-y-2">
            {SELF_REGISTER_ROLES.map((r) => {
              const active = role === r;
              return (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                    active ? 'border-primary bg-primary-soft/60' : 'border-border-strong bg-surface hover:border-subtle',
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={active}
                    onChange={() => setValue('role', r)}
                    className="size-4 cursor-pointer accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{roleOptions[r].title}</span>
                    <span className="block text-[13px] text-muted-foreground">{roleOptions[r].text}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field
          label="Full name"
          htmlFor="fullName"
          error={errors.fullName?.message}
          hint={role === 'STUDENT' ? 'As it appears on your college ID' : isSponsor ? 'As printed on your PAN card' : undefined}
        >
          <Input
            id="fullName"
            autoComplete="name"
            invalid={!!errors.fullName}
            readOnly={isSponsor && !!verifiedPan}
            {...register('fullName')}
          />
        </Field>

        {isSponsor && (
          <SponsorPanCheck
            fullName={fullName}
            verified={verifiedPan}
            error={panError}
            onVerified={(v) => {
              setVerifiedPan(v);
              setPanError(undefined);
              clearErrors('fullName');
            }}
            onReset={() => setVerifiedPan(null)}
            onNameError={(message) => setError('fullName', { message })}
          />
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Mobile number" htmlFor="phone" optional error={errors.phone?.message}>
          <Input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} prefix="+91" invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
            {rules.map((r) => (
              <li key={r.label} className={cn('flex items-center gap-1.5 text-[13px]', r.test(password) ? 'text-success' : 'text-subtle')}>
                <span className={cn('size-1.5 rounded-full', r.test(password) ? 'bg-success' : 'bg-border-strong')} />
                {r.label}
              </li>
            ))}
          </ul>
        </Field>

        <div>
          <Checkbox
            id="acceptTerms"
            {...register('acceptTerms')}
            label="I agree to the terms of use and privacy policy, and consent to EduBridge processing my information to verify and assess applications."
          />
          {errors.acceptTerms && <p className="mt-1.5 pl-7 text-[13px] text-danger">{errors.acceptTerms.message}</p>}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-ink hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
