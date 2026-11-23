import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { VAULT_ROLE_LABELS, VAULT_ROLES, type VaultUser } from '@eduvault/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useLoad, vaultApi } from '@/lib/vault';

const statusLabel = { ACTIVE: 'Active', PENDING_APPROVAL: 'Awaiting approval', SUSPENDED: 'Suspended' } as const;
const statusTone = { ACTIVE: 'success', PENDING_APPROVAL: 'warning', SUSPENDED: 'danger' } as const;

export default function AccountsPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, setData, error } = useLoad(() => vaultApi.users({ search: query, role, page }), [query, role, page]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const change = async (u: VaultUser, status: 'ACTIVE' | 'SUSPENDED') => {
    setBusy(u.id);
    try {
      const updated = await vaultApi.setUserStatus(u.id, status);
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? updated : x)) });
      toast.success(`${u.fullName}: ${statusLabel[status].toLowerCase()}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader title="Accounts" description="Student, institution and administrator accounts. Suspending an account signs it out everywhere." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="pl-9" aria-label="Search accounts" />
          </div>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="sm:w-48"
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            {VAULT_ROLES.map((r) => (
              <option key={r} value={r}>
                {VAULT_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>

        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Users} title="No accounts found" />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <Avatar name={u.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{u.fullName}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {u.email} · {u.institution?.name ?? VAULT_ROLE_LABELS[u.role]}
                  </p>
                </div>
                <div className="hidden text-right text-[13px] text-subtle md:block">
                  {u.lastLoginAt ? `Last sign-in ${formatDate(u.lastLoginAt)}` : `Joined ${formatDate(u.createdAt)}`}
                </div>
                <Badge tone={statusTone[u.status]}>{statusLabel[u.status]}</Badge>
                <div className="w-24 text-right">
                  {u.id !== me?.id && u.role !== 'ADMIN' && u.status === 'ACTIVE' && (
                    <Button size="sm" variant="ghost" loading={busy === u.id} onClick={() => change(u, 'SUSPENDED')}>
                      Suspend
                    </Button>
                  )}
                  {u.status === 'SUSPENDED' && (
                    <Button size="sm" variant="ghost" loading={busy === u.id} onClick={() => change(u, 'ACTIVE')}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </li>
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
