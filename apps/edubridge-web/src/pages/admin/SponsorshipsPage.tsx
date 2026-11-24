import { Award, ChevronLeft, ChevronRight, HandCoins, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { confirmSponsorshipSchema, type SponsorshipDTO, type SponsorshipStatus } from '@edubridge/shared';
import { EmptyState, PageHeader, Stat } from '@/components/dashboard/widgets';
import { SponsorshipStatusBadge, sponsorshipStatusLine } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { adminSponsorshipApi, certificateLink, useAdminSponsorships, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

const today = () => new Date().toISOString().slice(0, 10);

function ConfirmPanel({ s, onDone, onClose }: { s: SponsorshipDTO; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ receivedOn: s.payment?.sentOn ?? today(), reference: s.payment?.reference ?? '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const submit = async () => {
    const parsed = confirmSponsorshipSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      await adminSponsorshipApi.confirm(s.id, parsed.data);
      toast.success('Funds confirmed and certificates issued');
      onDone();
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
      <p className="text-sm text-muted-foreground">
        Normally the student confirms the money themselves. Use this only once you have checked that {formatINR(s.amount)} from {s.sponsor.name} reached the student’s
        account (for example, after a “not received” report). The student’s funding is updated and certificates are issued to both.
      </p>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <Field label="Date received" htmlFor={`d-${s.id}`} error={errors.receivedOn}>
          <Input id={`d-${s.id}`} type="date" max={today()} value={form.receivedOn} invalid={!!errors.receivedOn} onChange={(e) => set('receivedOn', e.target.value)} />
        </Field>
        <Field label="Payment reference" htmlFor={`r-${s.id}`} error={errors.reference} hint="Bank transfer UTR, receipt number or similar">
          <Input id={`r-${s.id}`} value={form.reference} invalid={!!errors.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>
      </div>
      <Field label="Note" htmlFor={`n-${s.id}`} optional>
        <Textarea id={`n-${s.id}`} className="min-h-16" value={form.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={busy}>
          Confirm funds received
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function CancelPanel({ s, onDone, onClose }: { s: SponsorshipDTO; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await adminSponsorshipApi.cancel(s.id, reason);
      toast.success('Sponsorship cancelled');
      onDone();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {s.status === 'CONFIRMED'
          ? `This sponsorship is confirmed. Cancelling it removes ${formatINR(s.amount)} from the student’s confirmed funding and revokes both certificates. Only do this if the funds were returned.`
          : `The ${formatINR(s.amount)} reserved by this pledge becomes available to other sponsors again.`}
      </p>
      <Field label="Reason" htmlFor={`c-${s.id}`} optional hint="Kept in the audit log and shown to the sponsor.">
        <Textarea id={`c-${s.id}`} className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={submit} loading={busy}>
          Cancel sponsorship
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Keep
        </Button>
      </div>
    </div>
  );
}

export default function SponsorshipsPage() {
  const [status, setStatus] = useState<SponsorshipStatus | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<{ id: string; panel: 'confirm' | 'cancel' } | null>(null);
  const { data, loading, error, reload } = useAdminSponsorships({ status, search: search || undefined, page });
  const overview = useLoad(() => adminSponsorshipApi.overview());
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const t = overview.data?.totals;
  const c = overview.data?.counts;

  const done = () => {
    setOpen(null);
    reload();
    void overview.reload();
  };

  const tabs: { id?: SponsorshipStatus; label: string; count?: number }[] = [
    { label: 'All' },
    { id: 'PLEDGED', label: 'Waiting for sponsor', count: c?.PLEDGED },
    { id: 'SENT', label: 'Waiting for student', count: c?.SENT },
    { id: 'CONFIRMED', label: 'Received', count: c?.CONFIRMED },
    { id: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <>
      <PageHeader
        title="Sponsorships"
        description="Sponsors send money straight to students’ bank accounts and students confirm it arrived, so most sponsorships need nothing from you. Step in when a student reports money as not received."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Confirmed" value={t ? formatINR(t.confirmed) : '—'} hint={c ? `${c.CONFIRMED} sponsorship${c.CONFIRMED === 1 ? '' : 's'}` : undefined} />
        <Stat label="Pledged, not yet received" value={t ? formatINR(t.pledged) : '—'} hint={c ? `${c.PLEDGED} to send, ${c.SENT} sent` : undefined} />
        <Stat label="Still needed" value={t ? formatINR(t.remaining) : '—'} hint={t ? `${t.eligibleStudents} approved student${t.eligibleStudents === 1 ? '' : 's'}, ${t.visibleStudents} shown to sponsors` : undefined} />
        <Stat label="Fully funded" value={t ? t.fullyFunded : '—'} hint={t ? `${t.sponsors} sponsor${t.sponsors === 1 ? '' : 's'} with preferences set` : undefined} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1 rounded-lg bg-sunken p-1 ring-1 ring-border" role="tablist">
            {tabs.map((tb) => (
              <button
                key={tb.label}
                role="tab"
                aria-selected={status === tb.id}
                onClick={() => {
                  setStatus(tb.id);
                  setPage(1);
                }}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  status === tb.id ? 'bg-surface text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tb.label}
                {tb.count ? <span className="ml-1.5 tabular-nums text-subtle">{tb.count}</span> : null}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by reference, sponsor or student"
              aria-label="Search sponsorships"
              className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <ul className={cn('divide-y divide-border transition-opacity', loading && 'opacity-60')}>
          {data?.items.map((s) => (
            <li key={s.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.sponsor.name}</span>
                    <span className="text-subtle">→</span>
                    <Link to={`/dashboard/review/${s.student.applicationId}`} className="font-medium hover:underline">
                      {s.student.name}
                    </Link>
                    <SponsorshipStatusBadge status={s.status} />
                  </div>
                  <p className="mt-0.5 text-[13px] text-subtle">
                    {s.reference} · {s.student.applicationNumber} · {s.sponsor.email}
                    {s.sponsor.anonymous && ' · name hidden from student'}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {sponsorshipStatusLine(s)}
                    {s.status === 'SENT' && s.payment && ` · UTR ${s.payment.reference}${s.payment.toAccountLast4 ? ` to ••${s.payment.toAccountLast4}` : ''}`}
                    {s.status === 'CONFIRMED' && s.confirmation?.reference && ` · ref ${s.confirmation.reference}`}
                    {s.cancelNote && ` · “${s.cancelNote}”`}
                  </p>
                  {s.status === 'SENT' && s.payment?.notReceived && (
                    <p className="mt-1 text-[13px] font-medium text-danger">
                      Student reported not received on {new Date(s.payment.notReceived.at).toLocaleDateString('en-IN')}
                      {s.payment.notReceived.note && `: “${s.payment.notReceived.note}”`}
                    </p>
                  )}
                </div>
                <p className="text-lg font-semibold tabular-nums md:w-32 md:text-right">{formatINR(s.amount)}</p>
                <div className="flex shrink-0 gap-2 md:w-60 md:justify-end">
                  {(s.status === 'PLEDGED' || s.status === 'SENT') && (
                    <Button size="sm" variant="secondary" onClick={() => setOpen({ id: s.id, panel: 'confirm' })}>
                      Mark received
                    </Button>
                  )}
                  {s.status !== 'CANCELLED' && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen({ id: s.id, panel: 'cancel' })}>
                      Cancel
                    </Button>
                  )}
                  {s.certificate && (
                    <Link to={certificateLink(s.certificate)} className={buttonVariants({ size: 'sm', variant: 'ghost' })} aria-label="Sponsor certificate">
                      <Award />
                    </Link>
                  )}
                </div>
              </div>
              {open?.id === s.id && (
                <div className="mt-4 rounded-lg border border-border bg-sunken/50 p-4">
                  {open.panel === 'confirm' ? (
                    <ConfirmPanel s={s} onDone={done} onClose={() => setOpen(null)} />
                  ) : (
                    <CancelPanel s={s} onDone={done} onClose={() => setOpen(null)} />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {data && data.items.length === 0 && (
          <EmptyState
            icon={HandCoins}
            title={search ? 'No matching sponsorships' : status === 'PLEDGED' || status === 'SENT' ? 'Nothing waiting' : 'No sponsorships yet'}
            text={!search && !status ? 'When sponsors pledge support to approved students, their sponsorships appear here.' : undefined}
          />
        )}
        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
            <span>
              {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}
            </span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
