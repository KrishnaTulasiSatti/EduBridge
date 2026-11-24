import { ChevronLeft, ChevronRight, FileCheck2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MARKSHEET_STATUS_LABELS, MARKSHEET_STATUSES } from '@eduvault/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { MarksheetStatusBadge } from '@/components/records/MarksheetDocument';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { formatDate, pct } from '@/lib/format';
import { useLoad, vaultApi } from '@/lib/vault';

export default function MarksheetsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(() => vaultApi.marksheets({ search: query, status, page }), [query, status, page]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader
        title="Marksheets"
        description="Drafts can be edited freely. Once issued, a marksheet is signed and can only be revoked."
        actions={
          user?.institution?.status === 'ACTIVE' && (
            <Link to="/dashboard/marksheets/new" className={buttonVariants()}>
              New marksheet
            </Link>
          )
        }
      />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student, roll number or document ID" className="pl-9" aria-label="Search marksheets" />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="sm:w-44"
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {MARKSHEET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MARKSHEET_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={FileCheck2} title={query || status !== 'ALL' ? 'No matching marksheets' : 'No marksheets yet'} />
        ) : (
          <div className="overflow-x-auto scrollbar-soft">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-border text-left text-[13px] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Semester</th>
                  <th className="px-5 py-3 text-right font-medium">Percentage</th>
                  <th className="px-5 py-3 font-medium">Document ID</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((m) => (
                  <tr key={m.id} onClick={() => navigate(`/dashboard/marksheets/${m.id}`)} className="cursor-pointer hover:bg-sunken/60">
                    <td className="px-5 py-3">
                      <Link to={`/dashboard/marksheets/${m.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {m.studentName}
                      </Link>
                      <p className="font-mono text-[12.5px] text-muted-foreground">{m.rollNumber}</p>
                    </td>
                    <td className="px-5 py-3">
                      Semester {m.semester}
                      <span className="block text-[13px] text-muted-foreground">{m.examSession}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{pct(m.percentage)}</td>
                    <td className="px-5 py-3 font-mono text-[12.5px]">{m.documentId ?? <span className="font-sans text-subtle">Not issued</span>}</td>
                    <td className="px-5 py-3">
                      <MarksheetStatusBadge status={m.status} />
                      <span className="block pt-0.5 text-[12px] text-subtle">{formatDate(m.issuedAt ?? m.updatedAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
            <span>
              Page {page} of {pages}
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
