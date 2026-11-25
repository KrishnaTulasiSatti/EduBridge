import { ChevronLeft, ChevronRight, Gavel, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DECISION_LABELS, NEED_LEVEL_LABELS, RECOMMENDATION_LABELS, type NeedLevel, type Recommendation } from '@edubridge/shared';
import { EmptyState, PageHeader, SkeletonRows } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/student';
import { useReviewQueue, type ReviewTab } from '@/lib/review';
import { cn, formatINR } from '@/lib/utils';

export const LEVEL_TONE: Record<NeedLevel, BadgeTone> = { HIGH: 'primary', MEDIUM: 'info', LOW: 'neutral' };
const REC_TONE: Record<Recommendation, BadgeTone> = { RECOMMEND: 'success', NEEDS_ADMIN_ATTENTION: 'warning', NOT_RECOMMENDED: 'danger' };
const DECISION_TONE = { APPROVED: 'success', ON_HOLD: 'warning', REJECTED: 'danger' } as const;

export default function ReviewQueuePage() {
  const [tab, setTab] = useState<ReviewTab>('awaiting');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useReviewQueue({ tab, search: search || undefined, page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const tabs: { id: ReviewTab; label: string; count?: number }[] = [
    { id: 'awaiting', label: 'Awaiting decision', count: data?.counts.awaiting },
    { id: 'on_hold', label: 'On hold', count: data?.counts.onHold },
    { id: 'decided', label: 'Decided' },
  ];

  return (
    <>
      <PageHeader
        title="Decisions"
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="flex gap-1 rounded-lg bg-sunken p-1 ring-1 ring-border" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setPage(1);
                }}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  tab === t.id ? 'bg-surface text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.count ? <span className="ml-1.5 tabular-nums text-subtle">{t.count}</span> : null}
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
              placeholder="Search by name, number or institution"
              aria-label="Search applications"
              className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium">Application</th>
                <th className="px-5 py-3 font-medium">Need score</th>
                <th className="px-5 py-3 font-medium">ML opinion</th>
                <th className="px-5 py-3 font-medium">Volunteer</th>
                <th className="px-5 py-3 font-medium">Verification</th>
                <th className="px-5 py-3 text-right font-medium">Requested</th>
                {tab === 'decided' && <th className="px-5 py-3 font-medium">Decision</th>}
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className={cn('transition-opacity', loading && 'opacity-60')}>
              {!data && !error && <SkeletonRows cols={tab === 'decided' ? 8 : 7} />}
              {data?.items.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-sunken/50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{a.studentName}</p>
                    <p className="max-w-[220px] truncate text-[13px] text-subtle">
                      {a.applicationNumber} · {a.institutionName}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    {a.score !== undefined && a.level ? (
                      <div className="flex items-center gap-2">
                        <span className="w-7 text-right text-[15px] font-semibold tabular-nums">{a.score}</span>
                        <Badge tone={LEVEL_TONE[a.level]}>{NEED_LEVEL_LABELS[a.level]}</Badge>
                      </div>
                    ) : (
                      <span className="text-subtle">Not assessed</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {a.mlPrediction ? (
                      <span className="text-muted-foreground">
                        {NEED_LEVEL_LABELS[a.mlPrediction]}
                        {a.mlSource === 'SYNTHETIC_DEMO' && <span className="ml-1.5 text-[12px] text-subtle">(demo model)</span>}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {a.recommendation ? (
                      <Badge tone={REC_TONE[a.recommendation as Recommendation]}>{RECOMMENDATION_LABELS[a.recommendation as Recommendation].label}</Badge>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {a.documentsVerified} of {a.documentsTotal} verified
                    {a.inconsistencies > 0 && <p className="text-[13px] text-warning">{a.inconsistencies} difference{a.inconsistencies > 1 ? 's' : ''}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{a.requestedAmount ? formatINR(a.requestedAmount) : '—'}</td>
                  {tab === 'decided' && (
                    <td className="px-5 py-3.5">
                      {a.decision && <Badge tone={DECISION_TONE[a.decision]}>{a.decision === 'APPROVED' ? 'Approved' : a.decision === 'REJECTED' ? 'Not approved' : DECISION_LABELS[a.decision].label}</Badge>}
                      <p className="mt-1 text-[13px] text-subtle">{formatDate(a.decidedAt)}</p>
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-right">
                    <Link to={`/dashboard/review/${a.id}`} className={buttonVariants({ size: 'sm', variant: tab === 'decided' ? 'ghost' : 'secondary' })}>
                      {tab === 'decided' ? 'Open' : 'Review'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <EmptyState
              icon={Gavel}
              title={search ? 'No matching applications' : tab === 'awaiting' ? 'Nothing waiting for a decision' : tab === 'on_hold' ? 'Nothing on hold' : 'No decisions yet'}
              text={tab === 'awaiting' && !search ? 'Applications appear here once a volunteer has verified them and the need assessment has run.' : undefined}
            />
          )}
        </div>

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
