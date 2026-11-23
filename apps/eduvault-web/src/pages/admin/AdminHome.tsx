import { Activity as ActivityIcon, Building2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { greeting } from '@/lib/utils';
import { useLoad, vaultApi } from '@/lib/vault';
import { ActivityRow } from './shared';

const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

export default function AdminHome() {
  const { user } = useAuth();
  const overview = useLoad(vaultApi.adminOverview);
  const pending = useLoad(() => vaultApi.institutions({ status: 'PENDING' }));
  const [busy, setBusy] = useState<string | null>(null);
  const d = overview.data;

  const decide = async (id: string, name: string, status: 'ACTIVE' | 'REJECTED') => {
    setBusy(id + status);
    try {
      await vaultApi.setInstitutionStatus(id, status);
      toast.success(status === 'ACTIVE' ? `${name} approved and a signing key created` : `${name} was not approved`);
      void pending.reload();
      void overview.reload();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.fullName.split(' ')[0]}`} description="Institutions, records and sharing across EduVault." />
      {overview.error && <Alert tone="danger" className="mb-6">{overview.error}</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {d ? (
          <>
            <Stat label="Trusted institutions" value={d.institutions.ACTIVE ?? 0} hint={d.institutions.PENDING ? `${d.institutions.PENDING} awaiting approval` : undefined} />
            <Stat label="Student accounts" value={d.users.STUDENT ?? 0} />
            <Stat label="Marksheets issued" value={(d.marksheets.ISSUED ?? 0) + (d.marksheets.REVOKED ?? 0)} hint={d.marksheets.REVOKED ? `${d.marksheets.REVOKED} revoked` : undefined} />
            <Stat label="Documents shared" value={d.consents.REDEEMED ?? 0} hint={sum(d.consents) ? `${sum(d.consents)} requests in total` : undefined} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Institutions awaiting approval" description="Approving an institution creates its Ed25519 signing key." />
          <CardBody className="py-2">
            {!pending.data ? (
              <Skeleton className="my-3 h-16" />
            ) : pending.data.items.length === 0 ? (
              <EmptyState icon={Building2} title="No institutions waiting" className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {pending.data.items.map((i) => (
                  <li key={i.id} className="py-3">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {i.code} · {i.university} · {i.city}
                    </p>
                    {i.contact && (
                      <p className="text-[13px] text-subtle">
                        {i.contact.name}
                        {i.contact.designation ? `, ${i.contact.designation}` : ''} · {i.contact.email} · {formatDate(i.createdAt)}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" loading={busy === i.id + 'ACTIVE'} onClick={() => decide(i.id, i.name, 'ACTIVE')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" loading={busy === i.id + 'REJECTED'} onClick={() => decide(i.id, i.name, 'REJECTED')}>
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link to="/dashboard/activity" className="text-sm text-primary-ink hover:underline">
                View all
              </Link>
            }
          />
          {!d ? (
            <CardBody>
              <Skeleton className="h-40" />
            </CardBody>
          ) : d.recent.length === 0 ? (
            <EmptyState icon={ActivityIcon} title="No activity yet" className="py-8" />
          ) : (
            <ul className="divide-y divide-border">
              {d.recent.map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
