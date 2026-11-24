import { ChevronLeft, ChevronRight, HandCoins, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { SponsorshipDTO, SponsorshipStatus } from '@edubridge/shared';
import { EmptyState, PageHeader, Stat } from '@/components/dashboard/widgets';
import { SponsorshipStatusBadge, sponsorshipStatusLine } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { adminSponsorshipApi, useAdminSponsorships, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

function EndPanel({ s, onDone, onClose }: { s: SponsorshipDTO; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await adminSponsorshipApi.end(s.id, reason);
      toast.success('Connection ended');
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
        Ending this connection hides each side’s contact details from the other. The {formatINR(s.amount)} promised becomes available to other sponsors again.
      </p>
      <Field label="Reason" htmlFor={`c-${s.id}`} optional hint="Kept in the audit log. Not shown to the student.">
        <Textarea id={`c-${s.id}`} className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={submit} loading={busy}>
          End connection
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
  const [open, setOpen] = useState<string | null>(null);
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
    { id: 'CONNECTED', label: 'Connected', count: c?.CONNECTED },
    { id: 'ENDED', label: 'Ended' },
  ];

  return (
    <>
      <PageHeader
        title="Sponsorships"
        description="Sponsors connect with approved students and arrange support with them directly; no money passes through EduBridge. You can end a connection if something is wrong."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Promised by sponsors" value={t ? formatINR(t.promised) : '—'} hint={c ? `${c.CONNECTED} active connection${c.CONNECTED === 1 ? '' : 's'}` : undefined} />
        <Stat label="Still needed" value={t ? formatINR(t.remaining) : '—'} hint={t ? `${t.eligibleStudents} approved student${t.eligibleStudents === 1 ? '' : 's'} not fully covered` : undefined} />
        <Stat label="Shown to sponsors" value={t ? t.visibleStudents : '—'} hint="Students who agreed to be listed" />
        <Stat label="Fully supported" value={t ? t.fullySupported : '—'} hint={t ? `${t.sponsors} sponsor${t.sponsors === 1 ? '' : 's'} with preferences set` : undefined} />
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
              aria-label="Search connections"
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
                    <span className="font-medium">{s.sponsor.contact?.fullName ?? s.sponsor.name}</span>
                    <span className="text-subtle">→</span>
                    <Link to={`/dashboard/review/${s.student.applicationId}`} className="font-medium hover:underline">
                      {s.student.contact?.fullName ?? s.student.alias}
                    </Link>
                    <SponsorshipStatusBadge status={s.status} />
                  </div>
                  <p className="mt-0.5 text-[13px] text-subtle">
                    {[s.reference, s.student.applicationNumber, s.sponsor.contact?.email, s.student.contact?.email].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {sponsorshipStatusLine(s)}
                    {s.endNote && ` · “${s.endNote}”`}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums md:w-32 md:text-right">{formatINR(s.amount)}</p>
                <div className="flex shrink-0 gap-2 md:w-40 md:justify-end">
                  {s.status === 'CONNECTED' && open !== s.id && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(s.id)}>
                      End connection
                    </Button>
                  )}
                </div>
              </div>
              {open === s.id && (
                <div className="mt-4 rounded-lg border border-border bg-sunken/50 p-4">
                  <EndPanel s={s} onDone={done} onClose={() => setOpen(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {data && data.items.length === 0 && (
          <EmptyState
            icon={HandCoins}
            title={search ? 'No matching connections' : 'No connections yet'}
            text={!search && !status ? 'When sponsors connect with approved students, the connections appear here.' : undefined}
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
