import { Activity as ActivityIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { ACTION_LABELS, useLoad, vaultApi } from '@/lib/vault';
import { ActivityRow } from './shared';

export default function ActivityPage() {
  const [action, setAction] = useState('ALL');
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(() => vaultApi.activity({ action, page }), [action, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader title="Activity" description="A permanent record of sign-ins, issuing, consent decisions and every document shared. Entries cannot be edited or deleted." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      <Card>
        <div className="border-b border-border p-4">
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="sm:w-64"
            aria-label="Filter by activity"
          >
            <option value="ALL">All activity</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
          <EmptyState icon={ActivityIcon} title="No activity recorded" />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </ul>
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
