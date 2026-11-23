import { ChevronRight, FileCheck2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { INSTITUTION_STATUS_LABELS } from '@eduvault/shared';
import { DefinitionList, EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { MarksheetStatusBadge } from '@/components/records/MarksheetDocument';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { greeting } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useLoad, vaultApi } from '@/lib/vault';

export default function IssuerHome() {
  const { user } = useAuth();
  const { data, error } = useLoad(vaultApi.issuerOverview);
  const inst = data?.institution;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user!.fullName.split(' ')[0]}`}
        description={inst ? `${inst.name} · ${inst.city}, ${inst.state}` : undefined}
        actions={
          inst?.status === 'ACTIVE' && (
            <Link to="/dashboard/marksheets/new" className={buttonVariants()}>
              New marksheet
            </Link>
          )
        }
      />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      {inst?.status === 'SUSPENDED' && (
        <Alert tone="warning" className="mb-6" title="Your institution is suspended">
          You can view existing records, but cannot enrol students or issue marksheets. Contact the EduVault administrator.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data ? (
          <>
            <Stat label="Students enrolled" value={data.students} />
            <Stat label="Accounts activated" value={data.linked} hint={data.students ? `of ${data.students}` : undefined} />
            <Stat label="Marksheets issued" value={data.marksheets.ISSUED ?? 0} hint={data.marksheets.REVOKED ? `${data.marksheets.REVOKED} revoked` : undefined} />
            <Stat label="Drafts" value={data.marksheets.DRAFT ?? 0} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Recently updated marksheets"
            action={
              <Link to="/dashboard/marksheets" className="text-sm text-primary-ink hover:underline">
                View all
              </Link>
            }
          />
          {!data ? (
            <CardBody>
              <Skeleton className="h-32" />
            </CardBody>
          ) : data.recent.length === 0 ? (
            <EmptyState icon={FileCheck2} title="No marksheets yet" text="Enrol your students, then create and issue their marksheets." className="py-10" />
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.map((m) => (
                <li key={m.id}>
                  <Link to={`/dashboard/marksheets/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/60 sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{m.studentName}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {m.rollNumber} · Semester {m.semester} · {m.examSession}
                      </span>
                    </span>
                    <MarksheetStatusBadge status={m.status} />
                    <ChevronRight className="size-4 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Institution" action={inst && <Badge tone={inst.status === 'ACTIVE' ? 'success' : 'warning'}>{INSTITUTION_STATUS_LABELS[inst.status]}</Badge>} />
          <CardBody>
            {inst ? (
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  ['University', inst.university],
                  ['Institution code', inst.code],
                  ['Approved', inst.approvedAt ? formatDate(inst.approvedAt) : undefined],
                  [
                    'Signing key fingerprint',
                    inst.signingKey ? <span className="font-mono text-[13px]">{inst.signingKey.fingerprint}</span> : undefined,
                  ],
                ]}
              />
            ) : (
              <Skeleton className="h-40" />
            )}
            <p className="mt-5 text-[13px] leading-relaxed text-subtle">
              Your private key never leaves EduVault. The fingerprint above identifies the public key that others use to check your
              signatures.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
