import { ChevronLeft, ChevronRight, ListChecks, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  RECOMMENDATION_LABELS,
  type DocumentStatus,
  type DocumentType,
  type QueueItemDTO,
  type QueueScope,
} from '@edubridge/shared';
import { ApplicationStatusBadge } from '@/components/application/status';
import { EmptyState, PageHeader, SkeletonRows } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/student';
import { cn, formatINR, timeAgo } from '@/lib/utils';
import { useQueue, verificationApi } from '@/lib/verification';

const SHORT: Record<DocumentType, string> = { MARKSHEET: 'Marks', INCOME_CERTIFICATE: 'Income', COLLEGE_ID: 'College ID', FEE_RECEIPT: 'Fee receipt' };
const DOT: Record<DocumentStatus, string> = {
  PENDING: 'bg-border-strong',
  PROCESSING: 'bg-info',
  VERIFIED: 'bg-success',
  REVIEW_REQUIRED: 'bg-warning',
  REJECTED: 'bg-danger',
  SERVICE_UNAVAILABLE: 'bg-warning',
};

export function DocumentStrip({ documents }: { documents: QueueItemDTO['documents'] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {DOCUMENT_TYPES.map((t) => documents.find((d) => d.type === t))
        .filter((d): d is QueueItemDTO['documents'][number] => !!d)
        .map((d) => (
          <span key={d.type} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground" title={`${DOCUMENT_TYPE_LABELS[d.type]}: ${DOCUMENT_STATUS_LABELS[d.status]}`}>
            <span className={cn('size-2 rounded-full', DOT[d.status])} aria-hidden />
            {SHORT[d.type]}
            <span className="sr-only">: {DOCUMENT_STATUS_LABELS[d.status]}</span>
          </span>
        ))}
    </div>
  );
}

const TAB_LABEL: Record<QueueScope, string> = {
  available: 'Waiting',
  // Nobody assigns work: "Start verification" holds an application for the person who started it.
  mine: 'Started by me',
  reviewed: 'Reviewed',
  all: 'All in verification',
};

export default function QueuePage({
  title,
  description,
  scopes,
}: {
  title: string;
  description?: string;
  scopes: QueueScope[];
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState<QueueScope>(scopes[0]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [claiming, setClaiming] = useState<string | null>(null);
  const { data, loading, error, reload } = useQueue({ scope, search: search || undefined, page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const start = async (id: string) => {
    setClaiming(id);
    try {
      await verificationApi.claim(id);
      navigate(`/dashboard/verify/${id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
      reload();
      setClaiming(null);
    }
  };

  const action = (a: QueueItemDTO) => {
    const unassigned = !a.assignee && (a.status === 'SUBMITTED' || a.status === 'UNDER_VERIFICATION');
    if (unassigned)
      return (
        <Button size="sm" variant="secondary" loading={claiming === a.id} onClick={() => start(a.id)}>
          Start verification
        </Button>
      );
    const canOpen = user!.role === 'ADMIN' || a.assignee?.id === user!.id || scope === 'reviewed';
    return canOpen ? (
      <Link to={`/dashboard/verify/${a.id}`} className={buttonVariants({ size: 'sm', variant: a.assignee?.id === user!.id ? 'primary' : 'ghost' })}>
        {a.assignee?.id === user!.id ? 'Continue' : 'Open'}
      </Link>
    ) : null;
  };

  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          {scopes.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-sunken p-1 ring-1 ring-border" role="tablist">
              {scopes.map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={scope === s}
                  onClick={() => {
                    setScope(s);
                    setPage(1);
                  }}
                  className={cn(
                    'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    scope === s ? 'bg-surface text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {TAB_LABEL[s]}
                </button>
              ))}
            </div>
          )}
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
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium">Application</th>
                <th className="px-5 py-3 font-medium">Course</th>
                <th className="px-5 py-3 text-right font-medium">Requested</th>
                <th className="px-5 py-3 font-medium">Documents</th>
                <th className="px-5 py-3 font-medium">{scope === 'reviewed' ? 'Recommendation' : 'Status'}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className={cn('transition-opacity', loading && 'opacity-60')}>
              {!data && !error && <SkeletonRows cols={6} />}
              {data?.items.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-sunken/50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{a.studentName}</p>
                    <p className="text-[13px] text-subtle">
                      {a.applicationNumber} · submitted {a.submittedAt ? timeAgo(a.submittedAt) || formatDate(a.submittedAt) : ''}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p>{[a.course, a.level && EDUCATION_LEVEL_LABELS[a.level]].filter(Boolean).join(' · ')}</p>
                    <p className="max-w-[240px] truncate text-[13px] text-subtle">{[a.institutionName, a.state].filter(Boolean).join(', ')}</p>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{a.requestedAmount ? formatINR(a.requestedAmount) : '—'}</td>
                  <td className="px-5 py-3.5">
                    <DocumentStrip documents={a.documents} />
                  </td>
                  <td className="px-5 py-3.5">
                    {scope === 'reviewed' && a.recommendation ? (
                      <div>
                        <Badge tone={a.recommendation === 'RECOMMEND' ? 'success' : a.recommendation === 'NOT_RECOMMENDED' ? 'danger' : 'warning'}>
                          {RECOMMENDATION_LABELS[a.recommendation].label}
                        </Badge>
                        <p className="mt-1 text-[13px] text-subtle">{formatDate(a.reviewedAt)}</p>
                      </div>
                    ) : (
                      <div>
                        <ApplicationStatusBadge status={a.status} />
                        {a.assignee && (
                          <p className="mt-1 text-[13px] text-subtle">
                            {a.assignee.id === user!.id ? 'You' : a.assignee.name} · {a.claimedAt && timeAgo(a.claimedAt)}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">{action(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <EmptyState
              icon={ListChecks}
              title={search ? 'No matching applications' : scope === 'mine' ? 'Nothing assigned to you' : scope === 'reviewed' ? 'No reviews yet' : 'The queue is empty'}
              text={
                search
                  ? 'Try a different search.'
                  : scope === 'mine'
                    ? 'Start verification on an application from the waiting list to see it here.'
                    : scope === 'reviewed'
                      ? 'Applications you finish reviewing will be listed here.'
                      : 'Newly submitted applications appear here, oldest first.'
              }
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
