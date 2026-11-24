import { ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES, EDUCATION_LEVEL_LABELS } from '@edubridge/shared';
import { ApplicationStatusBadge } from '@/components/application/status';
import { EmptyState, PageHeader, SkeletonRows } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { formatDate } from '@/lib/student';
import { useApplicationList } from '@/lib/useAdminData';
import { cn, formatINR } from '@/lib/utils';

export default function ApplicationsPage() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApplicationList({ status, search: search || undefined, page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Submitted applications, newest first. Open one to see its documents and verification. Eligibility decisions arrive with the review module."
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative sm:w-80">
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
          <div className="sm:ml-auto sm:w-56">
            <Select
              aria-label="Filter by status"
              value={status}
              className="h-9 text-sm"
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All statuses</option>
              {APPLICATION_STATUSES.filter((s) => s !== 'DRAFT').map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium">Application</th>
                <th className="px-5 py-3 font-medium">Course</th>
                <th className="px-5 py-3 text-right font-medium">Requested</th>
                <th className="px-5 py-3 font-medium">Documents</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className={cn('transition-opacity', loading && 'opacity-60')}>
              {!data && !error && <SkeletonRows cols={6} />}
              {data?.items.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-sunken/50">
                  <td className="px-5 py-3.5">
                    <Link to={['SUBMITTED', 'UNDER_VERIFICATION', 'VOLUNTEER_REVIEWED'].includes(a.status) ? `/dashboard/verify/${a.id}` : `/dashboard/review/${a.id}`} className="font-medium hover:text-primary-ink hover:underline">
                      {a.studentName}
                    </Link>
                    <p className="text-[13px] text-subtle">{a.applicationNumber}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p>{[a.course, a.level && EDUCATION_LEVEL_LABELS[a.level]].filter(Boolean).join(' · ')}</p>
                    <p className="max-w-[260px] truncate text-[13px] text-subtle">{[a.institutionName, a.state].filter(Boolean).join(', ')}</p>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{a.requestedAmount ? formatINR(a.requestedAmount) : '—'}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{a.documentsUploaded} uploaded</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{formatDate(a.submittedAt)}</td>
                  <td className="px-5 py-3.5">
                    <ApplicationStatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <EmptyState
              icon={FileText}
              title={search || status !== 'ALL' ? 'No matching applications' : 'No applications yet'}
              text={search || status !== 'ALL' ? 'Try a different search or status.' : 'Submitted applications will appear here.'}
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
