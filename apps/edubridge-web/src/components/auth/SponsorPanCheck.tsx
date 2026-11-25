import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  sponsorPanStartSchema,
  type SponsorPanConfirmResponse,
  type SponsorPanStartResponse,
} from '@edubridge/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { api, getErrorMessage, getFieldErrors } from '@/lib/api';

export interface VerifiedPan {
  panToken: string;
  maskedPan: string;
  fullName: string;
}

/**
 * Sponsor sign-up: the PAN, name and date of birth are matched with the PAN registry, which emails a
 * 6-digit code to the address registered for that PAN. Entering the code verifies the PAN.
 * The steps run in a pop-up so the sign-up form stays short.
 */
export function SponsorPanCheck({
  fullName,
  verified,
  onVerified,
  onReset,
  onNameChange,
  error,
}: {
  fullName: string;
  verified: VerifiedPan | null;
  onVerified: (v: VerifiedPan) => void;
  onReset: () => void;
  onNameChange: (name: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pan, setPan] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<SponsorPanStartResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'start' | 'confirm' | null>(null);

  const sendCode = async () => {
    setMessage(null);
    setFieldErrors({});
    const parsed = sponsorPanStartSchema.safeParse({ pan, fullName, dateOfBirth });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errs);
      return;
    }
    setBusy('start');
    try {
      const { data } = await api.post<SponsorPanStartResponse>('/auth/sponsor-pan/start', parsed.data);
      setSent(data);
      setOtp('');
    } catch (err) {
      const fields = getFieldErrors(err);
      if (fields) setFieldErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      if (!fields?.pan && !fields?.dateOfBirth && !fields?.fullName) setMessage(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!sent) return;
    setMessage(null);
    setFieldErrors({});
    if (!/^\d{6}$/.test(otp.trim())) {
      setFieldErrors({ otp: 'Enter the 6-digit code' });
      return;
    }
    setBusy('confirm');
    try {
      const { data } = await api.post<SponsorPanConfirmResponse>('/auth/sponsor-pan/confirm', { reference: sent.reference, otp: otp.trim() });
      onVerified(data);
      setOpen(false);
    } catch (err) {
      const fields = getFieldErrors(err);
      if (fields?.otp) setFieldErrors({ otp: fields.otp[0] });
      else {
        setMessage(getErrorMessage(err));
        setSent(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setSent(null);
    setOtp('');
    setMessage(null);
    setFieldErrors({});
    onReset();
  };

  if (verified) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-success/25 bg-success-soft px-4 py-2.5">
        <div className="flex items-center gap-3">
          <BadgeCheck className="size-4 shrink-0 text-success" />
          <p className="text-sm">
            <span className="font-medium text-success">PAN verified</span>
            <span className="text-foreground/80"> · {verified.maskedPan}</span>
          </p>
        </div>
        <Button variant="link" size="sm" onClick={reset}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className={
          'flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-2.5 ' +
          (error ? 'border-danger bg-danger-soft/50' : 'border-border-strong bg-sunken/50')
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <ShieldCheck className="size-4 shrink-0 text-primary-ink" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Verify your PAN</p>
            <p className={error ? 'text-[13px] text-danger' : 'text-[13px] text-muted-foreground'}>{error ?? 'Required for every sponsor'}</p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Verify PAN
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Verify your PAN"
        description="Every sponsor is verified, so students know who is supporting them. We send a code to the email registered with your PAN."
        footer={
          !sent ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={sendCode} loading={busy === 'start'}>
                Send code
              </Button>
            </>
          ) : (
            <>
              <Button variant="link" size="sm" className="mr-auto" onClick={reset}>
                Change PAN
              </Button>
              <Button variant="ghost" onClick={sendCode} disabled={busy !== null}>
                Send a new code
              </Button>
              <Button onClick={confirm} loading={busy === 'confirm'}>
                Verify PAN
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          {message && <Alert tone="danger">{message}</Alert>}

          {!sent ? (
            <>
              <Field label="Full name" htmlFor="panName" hint="As printed on your PAN card" error={fieldErrors.fullName}>
                <Input id="panName" value={fullName} onChange={(e) => onNameChange(e.target.value)} autoComplete="name" invalid={!!fieldErrors.fullName} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="PAN" htmlFor="pan" error={fieldErrors.pan}>
                  <Input
                    id="pan"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    maxLength={10}
                    autoComplete="off"
                    placeholder="ABCPK1234L"
                    className="uppercase tracking-wide"
                    invalid={!!fieldErrors.pan}
                  />
                </Field>
                <Field label="Date of birth" htmlFor="dateOfBirth" error={fieldErrors.dateOfBirth}>
                  <Input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} invalid={!!fieldErrors.dateOfBirth} />
                </Field>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">
                We sent a 6-digit code to <span className="font-medium">{sent.otpSentTo}</span>. It is valid for 10 minutes.
              </p>
              <Field label="Code" htmlFor="otp" error={fieldErrors.otp}>
                <Input
                  id="otp"
                  value={otp}
                  autoFocus
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirm();
                    }
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="max-w-44 text-center tracking-[0.4em]"
                  invalid={!!fieldErrors.otp}
                />
              </Field>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
