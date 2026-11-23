import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  issuerRegisterSchema,
  studentRegisterSchema,
  type IssuerRegisterInput,
  type StudentRegisterInput,
} from '@eduvault/shared';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AuthLayout } from './AuthLayout';

type Kind = 'student' | 'institution';

const rules = [
  { label: '8 or more characters', test: (p: string) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'A number', test: (p: string) => /\d/.test(p) },
];

function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
      {rules.map((r) => (
        <li key={r.label} className={cn('flex items-center gap-1.5 text-[13px]', r.test(password) ? 'text-success' : 'text-subtle')}>
          <Check className="size-3.5" /> {r.label}
        </li>
      ))}
    </ul>
  );
}

function StudentForm() {
  const { registerStudent } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StudentRegisterInput>({ resolver: zodResolver(studentRegisterSchema), defaultValues: { fullName: '', email: '', password: '', activationCode: '' } });

  const onSubmit = async (values: StudentRegisterInput) => {
    setFormError(null);
    try {
      await registerStudent(values);
      navigate(from ?? '/dashboard', { replace: true });
    } catch (err) {
      const fields = getFieldErrors(err);
      if (fields) Object.entries(fields).forEach(([k, v]) => setError(k as keyof StudentRegisterInput, { message: v[0] }));
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field
        label="Activation code"
        htmlFor="activationCode"
        error={errors.activationCode?.message}
        hint="The 10-character code your institution gave you, e.g. K7QMX-4TZRA"
      >
        <Input id="activationCode" autoComplete="off" spellCheck={false} className="font-mono uppercase tracking-wider" invalid={!!errors.activationCode} {...register('activationCode')} />
      </Field>
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        <PasswordRules password={watch('password') ?? ''} />
      </Field>
      <Checkbox id="acceptTerms" label="I agree that EduVault stores my academic records and shares them only when I approve." {...register('acceptTerms')} />
      {errors.acceptTerms && <p className="-mt-3 text-[13px] text-danger">{errors.acceptTerms.message}</p>}
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Activate account
      </Button>
    </form>
  );
}

function InstitutionForm({ onDone }: { onDone: () => void }) {
  const { registerInstitution } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IssuerRegisterInput>({ resolver: zodResolver(issuerRegisterSchema) });
  const e = errors.institution;

  const onSubmit = async (values: IssuerRegisterInput) => {
    setFormError(null);
    try {
      await registerInstitution(values);
      onDone();
    } catch (err) {
      const fields = getFieldErrors(err);
      if (fields) Object.entries(fields).forEach(([k, v]) => setError(k as never, { message: v[0] }));
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <fieldset className="space-y-5">
        <legend className="mb-4 text-[15px] font-semibold">Institution</legend>
        <Field label="Institution name" htmlFor="inst-name" error={e?.name?.message}>
          <Input id="inst-name" invalid={!!e?.name} {...register('institution.name')} />
        </Field>
        <Field label="Affiliating university" htmlFor="inst-university" error={e?.university?.message}>
          <Input id="inst-university" invalid={!!e?.university} {...register('institution.university')} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Institution code" htmlFor="inst-code" error={e?.code?.message} hint="AISHE or university college code">
            <Input id="inst-code" className="uppercase" invalid={!!e?.code} {...register('institution.code')} />
          </Field>
          <Field label="Website" htmlFor="inst-website" optional error={e?.website?.message}>
            <Input id="inst-website" type="url" placeholder="https://" invalid={!!e?.website} {...register('institution.website')} />
          </Field>
          <Field label="City" htmlFor="inst-city" error={e?.city?.message}>
            <Input id="inst-city" invalid={!!e?.city} {...register('institution.city')} />
          </Field>
          <Field label="State" htmlFor="inst-state" error={e?.state?.message}>
            <Input id="inst-state" invalid={!!e?.state} {...register('institution.state')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border pt-6">
        <legend className="mb-4 pt-6 text-[15px] font-semibold">Your details</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} />
          </Field>
          <Field label="Designation" htmlFor="designation" error={errors.designation?.message} hint="e.g. Controller of Examinations">
            <Input id="designation" invalid={!!errors.designation} {...register('designation')} />
          </Field>
        </div>
        <Field label="Official email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          <PasswordRules password={watch('password') ?? ''} />
        </Field>
      </fieldset>

      <Checkbox
        id="acceptTerms"
        label="I am authorised to issue academic records on behalf of this institution."
        description="Only marksheets your institution has genuinely awarded should be issued."
        {...register('acceptTerms')}
      />
      {errors.acceptTerms && <p className="-mt-4 text-[13px] text-danger">{errors.acceptTerms.message}</p>}
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Register institution
      </Button>
    </form>
  );
}

export default function RegisterPage() {
  const location = useLocation();
  const [kind, setKind] = useState<Kind>(() => ((location.state as { kind?: Kind } | null)?.kind === 'institution' ? 'institution' : 'student'));
  const [pending, setPending] = useState(false);

  if (pending) {
    return (
      <AuthLayout aside={{ title: 'Only trusted institutions can issue.', text: 'An EduVault administrator checks every institution before it receives a signing key.' }}>
        <h1 className="font-display text-[32px] font-medium">Registration received</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Your institution is awaiting approval by an EduVault administrator. Once approved, a digital signing key is created for your
          institution and you can sign in to enrol students and issue marksheets.
        </p>
        <Link to="/" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-8')}>
          Return to the home page
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      wide={kind === 'institution'}
      aside={
        kind === 'student'
          ? { title: 'Your marksheets, in one place.', text: 'Your institution enrols you and gives you an activation code. Use it once to open your EduVault account.' }
          : { title: 'Issue records that can be checked anywhere.', text: 'Each marksheet you issue is signed with your institution’s key, so anyone can confirm it is genuine and unchanged.' }
      }
    >
      <h1 className="font-display text-[32px] font-medium">Create an account</h1>
      <div className="mt-6 grid grid-cols-2 rounded-lg bg-sunken p-1 ring-1 ring-border" role="tablist">
        {(['student', 'institution'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'cursor-pointer rounded-md px-3 py-2 text-sm transition-colors',
              kind === k ? 'bg-surface font-medium shadow-card ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {k === 'student' ? 'I am a student' : 'I represent an institution'}
          </button>
        ))}
      </div>
      <div className="mt-8">{kind === 'student' ? <StudentForm /> : <InstitutionForm onDone={() => setPending(true)} />}</div>
      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" state={location.state} className="font-medium text-primary-ink hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
