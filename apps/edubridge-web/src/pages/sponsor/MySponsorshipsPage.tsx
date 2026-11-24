import { Award, Copy, HeartHandshake, Send } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EDUCATION_LEVEL_LABELS, markSentSchema, type BankDetailsForSponsorDTO, type SponsorshipDTO } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { SponsorshipStatusBadge, sponsorshipStatusLine } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatDate } from '@/lib/student';
import { certificateLink, sponsorApi, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

const today = () => new Date().toISOString().slice(0, 10);

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="tabular-nums">{value}</span>
        <button
          type="button"
          className="cursor-pointer text-subtle hover:text-foreground"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => void navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copied`))}
        >
          <Copy className="size-3.5" />
        </button>
      </dd>
    </>
  );
}

/** Shows the student's bank details, then records the transfer the sponsor made. */
function SendPanel({ s, onDone, onClose }: { s: SponsorshipDTO; onDone: (items: SponsorshipDTO[]) => void; onClose: () => void }) {
  const [bank, setBank] = useState<BankDetailsForSponsorDTO | null>(null);
  const [loadingBank, setLoadingBank] = useState(false);
  const [form, setForm] = useState({ sentOn: today(), reference: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const showBank = async () => {
    setLoadingBank(true);
    try {
      setBank(await sponsorApi.bankDetails(s.id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingBank(false);
    }
  };

  const submit = async () => {
    const parsed = markSentSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      onDone(await sponsorApi.markSent(s.id, parsed.data));
      toast.success('Marked as sent. The student will confirm once it arrives.');
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]])));
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">1. Transfer {formatINR(s.amount)} to the student’s bank account</p>
        {bank ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <CopyRow label="Name" value={bank.accountHolderName} />
            <CopyRow label="Account number" value={bank.accountNumber} />
            <CopyRow label="IFSC" value={bank.ifsc} />
            <dt className="text-muted-foreground">Bank</dt>
            <dd>{bank.bankName}</dd>
          </dl>
        ) : (
          <Button size="sm" variant="secondary" className="mt-2" loading={loadingBank} onClick={showBank}>
            Show bank details
          </Button>
        )}
        <p className="mt-2 text-[13px] text-subtle">Use NEFT, IMPS or RTGS. Please keep these details private; viewing them is recorded.</p>
      </div>
      <div>
        <p className="text-sm font-medium">2. Record the transfer</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Date sent" htmlFor={`d-${s.id}`} error={errors.sentOn}>
            <Input id={`d-${s.id}`} type="date" max={today()} value={form.sentOn} invalid={!!errors.sentOn} onChange={(e) => set('sentOn', e.target.value)} />
          </Field>
          <Field label="Transaction reference (UTR)" htmlFor={`r-${s.id}`} error={errors.reference} hint="Shown in your bank app after the transfer">
            <Input id={`r-${s.id}`} value={form.reference} invalid={!!errors.reference} onChange={(e) => set('reference', e.target.value)} />
          </Field>
        </div>
        <Field label="Note" htmlFor={`n-${s.id}`} optional className="mt-4">
          <Textarea id={`n-${s.id}`} className="min-h-16" value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={500} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={busy}>
          <Send /> Mark as sent
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export default function MySponsorshipsPage() {
  const { data, setData, error } = useLoad(() => sponsorApi.sponsorships());
  const prefs = useLoad(() => sponsorApi.preferences());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const withdraw = async (s: SponsorshipDTO) => {
    setBusy(s.id);
    try {
      setData(await sponsorApi.withdraw(s.id));
      void prefs.reload();
      toast.success('Pledge withdrawn');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  const p = prefs.data;

  return (
    <>
      <PageHeader
        title="My sponsorships"
        description="Send pledged money straight to the student’s bank account and record the transfer here. Certificates are issued once the student confirms it arrived."
      />

      {p && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Confirmed" value={formatINR(p.confirmed)} />
          <Stat label="Pledged, not yet received" value={formatINR(p.committed - p.confirmed)} />
          <Stat label="Available" value={formatINR(p.available)} hint={`of ${formatINR(p.budget)} budget`} />
        </div>
      )}

      <Card className="overflow-hidden">
        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No sponsorships yet"
            text="Find an approved student who matches your preferences and pledge support from their profile."
            action={
              <Link to="/dashboard/discover" className={buttonVariants()}>
                Find students
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((s) => (
              <li key={s.id} className={cn('px-5 py-4 sm:px-6', s.status === 'CANCELLED' && 'opacity-70')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/dashboard/discover/${s.student.applicationId}`} className="font-medium hover:underline">
                        {s.student.alias}
                      </Link>
                      <SponsorshipStatusBadge status={s.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[s.student.course, s.student.level && EDUCATION_LEVEL_LABELS[s.student.level], s.academicYear].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-0.5 text-[13px] text-subtle">
                      {s.reference} · {sponsorshipStatusLine(s)}
                    </p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums sm:w-32 sm:text-right">{formatINR(s.amount)}</p>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:w-64 sm:justify-end">
                    {(s.status === 'PLEDGED' || (s.status === 'SENT' && s.payment?.notReceived)) && s.studentBankReady && sending !== s.id && confirming !== s.id && (
                      <Button size="sm" onClick={() => setSending(s.id)}>
                        <Send /> {s.status === 'SENT' ? 'Send again' : 'Send money'}
                      </Button>
                    )}
                    {s.status === 'PLEDGED' &&
                      sending !== s.id &&
                      (confirming === s.id ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                          <Button size="sm" variant="danger" loading={busy === s.id} onClick={() => withdraw(s)}>
                            Withdraw
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(s.id)}>
                          Withdraw pledge
                        </Button>
                      ))}
                    {s.certificate && !s.certificate.revoked && (
                      <Link to={certificateLink(s.certificate)} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                        <Award /> Certificate
                      </Link>
                    )}
                  </div>
                </div>
                {s.status === 'PLEDGED' && !s.studentBankReady && (
                  <p className="mt-2 text-[13px] text-muted-foreground">Waiting for the student to add their bank details. You can send the money once they do.</p>
                )}
                {s.status === 'SENT' && s.payment && (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    You sent it on {formatDate(s.payment.sentOn)}
                    {s.payment.toAccountLast4 && ` to the account ending ${s.payment.toAccountLast4}`} · UTR {s.payment.reference}
                  </p>
                )}
                {s.payment?.notReceived && s.status === 'SENT' && (
                  <Alert tone="warning" className="mt-3" title="The student says this money has not arrived">
                    {s.payment.notReceived.note ? `“${s.payment.notReceived.note}” ` : ''}Please check the transfer with your bank. If it failed, send it again and record the new reference.
                  </Alert>
                )}
                {sending === s.id && (
                  <div className="mt-4 rounded-lg border border-border bg-sunken/50 p-4">
                    <SendPanel
                      s={s}
                      onClose={() => setSending(null)}
                      onDone={(items) => {
                        setData(items);
                        setSending(null);
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
