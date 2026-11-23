import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, type AccountStatus, type PublicUser, type Role } from '@edubridge/shared';
import { EmptyState, PageHeader } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge, Dot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/student';
import { updateUserStatus, useUsers } from '@/lib/useAdminData';
import { cn } from '@/lib/utils';

const statusTone: Record<AccountStatus, 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  SUSPENDED: 'danger',
};
const statusLabel: Record<AccountStatus, string> = {
  ACTIVE: 'Active',
  PENDING_APPROVAL: 'Awaiting approval',
  SUSPENDED: 'Suspended',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const [role, setRole] = useState<Role | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useUsers({ role, search: search || undefined, page });
  const [busy, setBusy] = useState<string | null>(null);

  const change = async (u: PublicUser, status: AccountStatus) => {
    setBusy(u.id);
    try {
      await updateUserStatus(u.id, status);
      toast.success(`${u.fullName}: ${statusLabel[status].toLowerCase()}`);
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader title="Users" description="Approve volunteers and manage access to EduBridge." />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="flex gap-1 overflow-x-auto scrollbar-thin" role="tablist">
            {[undefined, ...ROLES].map((r) => (
              <button
                key={r ?? 'ALL'}
                type="button"
                role="tab"
                aria-selected={role === r}
                onClick={() => {
                  setRole(r);
                  setPage(1);
                }}
                className={cn(
                  'cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                  role === r ? 'bg-sunken font-medium text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r ? ROLE_LABELS[r] : 'All'}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              aria-label="Search users"
              className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className={cn('transition-opacity', loading && 'opacity-60')}>
              {data?.items.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-sunken/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} className="size-8 text-xs" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.fullName}
                          {u.id === me?.id && <span className="ml-1.5 font-normal text-subtle">(you)</span>}
                        </p>
                        <p className="truncate text-[13px] text-subtle">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{ROLE_LABELS[u.role]}</td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone[u.status]}>
                      <Dot /> {statusLabel[u.status]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    {u.id !== me?.id && (
                      <>
                        {u.status === 'PENDING_APPROVAL' && (
                          <Button size="sm" variant="secondary" loading={busy === u.id} onClick={() => change(u, 'ACTIVE')}>
                            Approve
                          </Button>
                        )}
                        {u.status === 'ACTIVE' && (
                          <Button size="sm" variant="ghost" loading={busy === u.id} onClick={() => change(u, 'SUSPENDED')}>
                            Suspend
                          </Button>
                        )}
                        {u.status === 'SUSPENDED' && (
                          <Button size="sm" variant="ghost" loading={busy === u.id} onClick={() => change(u, 'ACTIVE')}>
                            Reactivate
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <EmptyState icon={Users} title="No users found" text="Try a different filter or search." />}
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
