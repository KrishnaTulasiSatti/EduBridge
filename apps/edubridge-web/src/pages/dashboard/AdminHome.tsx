import { Activity, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES, ROLE_LABELS, type Role } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { ACTION_LABELS, updateUserStatus, useAdminStats, useUsers } from '@/lib/useAdminData';
import { greeting, timeAgo } from '@/lib/utils';

export default function AdminHome() {
  const { user } = useAuth();
  const { data, error, reload } = useAdminStats();
  const pending = useUsers({ role: 'VOLUNTEER', status: 'PENDING_APPROVAL' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const approve = async (id: string, name: string) => {
    setBusyId(id);
    try {
      await updateUserStatus(id, 'ACTIVE');
      toast.success(`${name} can now sign in as a volunteer`);
      pending.reload();
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const submitted = data ? Object.entries(data.applications).reduce((s, [k, n]) => (k === 'DRAFT' ? s : s + n), 0) : 0;

  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.fullName.split(' ')[0]}`} description="An overview of activity across EduBridge." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data ? (
          <>
            <Stat label="Students" value={data.counts.STUDENT} />
            <Stat label="Sponsors" value={data.counts.SPONSOR} />
            <Stat label="Volunteers" value={data.counts.VOLUNTEER} hint={data.pendingVolunteers ? `${data.pendingVolunteers} awaiting approval` : undefined} />
            <Stat label="Applications submitted" value={submitted} hint={data.applications.DRAFT ? `${data.applications.DRAFT} in draft` : undefined} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Volunteer approvals" description="Volunteers can see student documents, so each account is approved manually." />
          <CardBody className="py-2">
            {pending.loading && !pending.data ? (
              <Skeleton className="my-3 h-12" />
            ) : pending.data?.items.length ? (
              <ul className="divide-y divide-border">
                {pending.data.items.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 py-3">
                    <Avatar name={u.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.fullName}</p>
                      <p className="truncate text-[13px] text-subtle">
                        {u.email} · {timeAgo(u.createdAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" loading={busyId === u.id} onClick={() => approve(u.id, u.fullName)}>
                      Approve
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={UserCheck} title="No pending volunteers" className="py-8" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Applications by status" action={<Link to="/dashboard/applications" className="text-sm text-primary-ink hover:underline">View all</Link>} />
          <CardBody className="py-2">
            {!data ? (
              <Skeleton className="my-3 h-32" />
            ) : (
              <ul className="divide-y divide-border">
                {APPLICATION_STATUSES.map((s) => (
                  <li key={s} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-muted-foreground">{APPLICATION_STATUS_LABELS[s]}</span>
                    <span className="tabular-nums">{data.applications[s] ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" description="The latest entries from the audit log." />
        <CardBody className="py-2">
          {!data ? (
            <Skeleton className="my-3 h-40" />
          ) : data.recentActivity.length ? (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <p className="min-w-0">
                    <span className="font-medium">{a.actor?.name ?? 'Unknown user'}</span>{' '}
                    <span className="text-muted-foreground">{ACTION_LABELS[a.action] ?? a.action.toLowerCase().replaceAll('_', ' ')}</span>
                    {a.actor?.role && <span className="text-subtle"> · {ROLE_LABELS[a.actor.role as Role]}</span>}
                  </p>
                  <span className="shrink-0 text-[13px] text-subtle">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Activity} title="No activity yet" className="py-8" />
          )}
        </CardBody>
      </Card>
    </>
  );
}
