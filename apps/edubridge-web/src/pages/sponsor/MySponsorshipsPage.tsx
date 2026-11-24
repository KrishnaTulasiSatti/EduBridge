import { HeartHandshake } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EDUCATION_LEVEL_LABELS, type SponsorshipDTO } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { ContactCard, SponsorshipStatusBadge, sponsorshipStatusLine } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getErrorMessage } from '@/lib/api';
import { sponsorApi, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

export default function MySponsorshipsPage() {
  const { data, setData, error } = useLoad(() => sponsorApi.sponsorships());
  const prefs = useLoad(() => sponsorApi.preferences());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const end = async (s: SponsorshipDTO) => {
    setBusy(s.id);
    try {
      setData(await sponsorApi.end(s.id));
      void prefs.reload();
      toast.success('Connection ended');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  const p = prefs.data;
  const connected = data?.filter((s) => s.status === 'CONNECTED').length ?? 0;

  return (
    <>
      <PageHeader
        title="My sponsorships"
        description="The students you are connected with. Contact them directly to arrange your support; no money passes through EduBridge."
      />

      {p && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Students connected" value={String(connected)} />
          <Stat label="Promised" value={formatINR(p.committed)} />
          <Stat label="Available" value={formatINR(p.available)} hint={`of ${formatINR(p.budget)} budget`} />
        </div>
      )}

      <Card className="overflow-hidden">
        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No connections yet"
            text="Find an approved student who matches your preferences and connect from their profile."
            action={
              <Link to="/dashboard/discover" className={buttonVariants()}>
                Find students
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((s) => (
              <li key={s.id} className={cn('px-5 py-4 sm:px-6', s.status === 'ENDED' && 'opacity-70')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/dashboard/discover/${s.student.applicationId}`} className="font-medium hover:underline">
                        {s.student.contact?.fullName ?? s.student.alias}
                      </Link>
                      <SponsorshipStatusBadge status={s.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[s.student.course, s.student.level && EDUCATION_LEVEL_LABELS[s.student.level], s.academicYear].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-0.5 text-[13px] text-subtle">
                      {s.reference} · {sponsorshipStatusLine(s)}
                    </p>
                  </div>
                  <div className="sm:w-36 sm:text-right">
                    <p className="text-lg font-semibold tabular-nums">{formatINR(s.amount)}</p>
                    <p className="text-[12px] text-subtle">promised</p>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:w-48 sm:justify-end">
                    {s.status === 'CONNECTED' &&
                      (confirming === s.id ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                          <Button size="sm" variant="danger" loading={busy === s.id} onClick={() => end(s)}>
                            End
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(s.id)}>
                          End connection
                        </Button>
                      ))}
                  </div>
                </div>
                {s.student.contact && <ContactCard className="mt-3" contact={s.student.contact} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
