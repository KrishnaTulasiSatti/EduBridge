import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABELS,
  NEED_LEVELS,
  NEED_LEVEL_LABELS,
  SPECIAL_CIRCUMSTANCE_LABELS,
  type EducationLevel,
  type NeedLevel,
  type SponsorStudentCardDTO,
} from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { FundingBar, MatchScore } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { useDiscover, type DiscoverParams } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';
import { LEVEL_TONE } from '@/pages/review/ReviewQueuePage';

export function yearOf(s: Pick<SponsorStudentCardDTO, 'currentYear' | 'durationYears'>) {
  return s.currentYear && s.durationYears ? `Year ${s.currentYear} of ${s.durationYears}` : undefined;
}

function StudentCard({ s }: { s: SponsorStudentCardDTO }) {
  const strongest = [...s.match.factors].filter((f) => f.value >= 0.99 && !f.detail.startsWith('You ')).slice(0, 2);
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <p className="font-medium">{s.alias}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[s.course, s.specialization].filter(Boolean).join(', ')}
            {s.level && ` · ${EDUCATION_LEVEL_LABELS[s.level]}`}
          </p>
          <p className="text-[13px] text-subtle">{[yearOf(s), s.state].filter(Boolean).join(' · ')}</p>
        </div>
        <MatchScore score={s.match.score} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 px-5">
        <Badge tone={LEVEL_TONE[s.needLevel]}>{NEED_LEVEL_LABELS[s.needLevel]}</Badge>
        {s.circumstances.slice(0, 2).map((c) => (
          <Badge key={c}>{SPECIAL_CIRCUMSTANCE_LABELS[c]}</Badge>
        ))}
        {s.circumstances.length > 2 && <Badge>+{s.circumstances.length - 2}</Badge>}
      </div>
      {strongest.length > 0 && (
        <ul className="mt-4 space-y-1 px-5 text-[13px] text-muted-foreground">
          {strongest.map((f) => (
            <li key={f.key}>{f.detail}</li>
          ))}
        </ul>
      )}
      <div className="mt-auto px-5 pb-5 pt-5">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Still needed</span>
          <span className="font-medium tabular-nums">
            {formatINR(s.remaining)} <span className="font-normal text-subtle">of {formatINR(s.approvedAmount)}</span>
          </span>
        </div>
        <FundingBar approved={s.approvedAmount} confirmed={s.confirmed} pledged={s.pledged} compact />
        <div className="mt-4 flex items-center justify-between">
          {s.mySponsorship ? <span className="text-[13px] text-primary-ink">You pledged {formatINR(s.mySponsorship.amount)}</span> : <span />}
          <Link to={`/dashboard/discover/${s.id}`} className={buttonVariants({ size: 'sm', variant: s.mySponsorship ? 'ghost' : 'secondary' })}>
            View profile
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default function DiscoverPage() {
  const [params, setParams] = useState<DiscoverParams>({ sort: 'match', page: 1 });
  const { data, loading, error, errorCode } = useDiscover(params);
  const set = (p: Partial<DiscoverParams>) => setParams((x) => ({ ...x, page: 1, ...p }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  if (errorCode === 'PREFERENCES_REQUIRED') return <Navigate to="/dashboard/preferences" replace />;

  return (
    <>
      <PageHeader
        title="Find students"
        description="Approved students whose documents have been verified and who agreed to be shown. Profiles are anonymised: no names, contact details or documents."
        meta={data ? <span>{formatINR(data.available)} of your budget available</span> : undefined}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg bg-sunken p-1 ring-1 ring-border" role="tablist" aria-label="Sort">
          {(
            [
              ['match', 'Best match'],
              ['need', 'Highest need'],
              ['remaining', 'Largest need left'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={params.sort === k}
              onClick={() => set({ sort: k })}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                params.sort === k ? 'bg-surface text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <div className="w-44">
            <Select aria-label="Level of study" value={params.level ?? ''} onChange={(e) => set({ level: (e.target.value || undefined) as EducationLevel | undefined })} className="h-9 text-sm">
              <option value="">All levels</option>
              {EDUCATION_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {EDUCATION_LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select aria-label="Need level" value={params.need ?? ''} onChange={(e) => set({ need: (e.target.value || undefined) as NeedLevel | undefined })} className="h-9 text-sm">
              <option value="">Any need</option>
              {NEED_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {NEED_LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error && errorCode !== 'PREFERENCES_REQUIRED' && <Alert tone="danger">{error}</Alert>}
      {!data && loading && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      )}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            icon={Search}
            title={params.level || params.need ? 'No students match these filters' : 'No students need support right now'}
            text={params.level || params.need ? 'Try removing a filter.' : 'Students appear here once they are approved and choose to be shown to sponsors.'}
          />
        </Card>
      )}
      {data && data.items.length > 0 && (
        <div className={cn('grid gap-5 transition-opacity md:grid-cols-2 xl:grid-cols-3', loading && 'opacity-60')}>
          {data.items.map((s) => (
            <StudentCard key={s.id} s={s} />
          ))}
        </div>
      )}
      {data && data.total > data.limit && (
        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button size="icon" variant="ghost" disabled={params.page >= pages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
