import { Building2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { INSTITUTION_STATUS_LABELS, INSTITUTION_STATUSES, type InstitutionDTO, type InstitutionStatus } from '@eduvault/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useLoad, vaultApi } from '@/lib/vault';
import { InstitutionStatusBadge } from './shared';

const actions: Record<InstitutionStatus, { to: Exclude<InstitutionStatus, 'PENDING'>; label: string; variant: 'secondary' | 'ghost' | 'danger' }[]> = {
  PENDING: [
    { to: 'ACTIVE', label: 'Approve', variant: 'secondary' },
    { to: 'REJECTED', label: 'Reject', variant: 'ghost' },
  ],
  ACTIVE: [{ to: 'SUSPENDED', label: 'Suspend', variant: 'danger' }],
  SUSPENDED: [{ to: 'ACTIVE', label: 'Reinstate', variant: 'secondary' }],
  REJECTED: [],
};

export default function InstitutionsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const { data, setData, error } = useLoad(() => vaultApi.institutions({ search: query, status }), [query, status]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const change = async (i: InstitutionDTO, to: Exclude<InstitutionStatus, 'PENDING'>) => {
    setBusy(i.id);
    try {
      const updated = await vaultApi.setInstitutionStatus(i.id, to);
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === i.id ? updated : x)) });
      toast.success(`${i.name}: ${INSTITUTION_STATUS_LABELS[to].toLowerCase()}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Institutions" description="Only trusted institutions can issue marksheets. Suspending one stops new issues; existing signatures stay checkable." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or university" className="pl-9" aria-label="Search institutions" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48" aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            {INSTITUTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INSTITUTION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Building2} title="No institutions found" />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{i.name}</p>
                    <InstitutionStatusBadge status={i.status} />
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {i.code} · {i.university} · {i.city}, {i.state}
                  </p>
                  {i.contact && (
                    <p className="text-[13px] text-subtle">
                      {i.contact.name}
                      {i.contact.designation ? `, ${i.contact.designation}` : ''} · {i.contact.email}
                    </p>
                  )}
                  <p className="mt-1.5 text-[13px] text-subtle">
                    {i.counts ? `${i.counts.students} students · ${i.counts.issued} marksheets issued · ` : ''}
                    Registered {formatDate(i.createdAt)}
                    {i.approvedAt ? ` · Approved ${formatDate(i.approvedAt)}` : ''}
                  </p>
                  {i.signingKey && <p className="mt-1 font-mono text-[12px] text-muted-foreground">Key {i.signingKey.fingerprint}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {actions[i.status].map((a) => (
                    <Button key={a.to} size="sm" variant={a.variant} loading={busy === i.id} onClick={() => change(i, a.to)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
