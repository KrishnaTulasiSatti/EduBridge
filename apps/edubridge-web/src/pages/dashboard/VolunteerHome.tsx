import { ArrowRight, ExternalLink, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AP_SEVA_PORTAL_URL } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { greeting, timeAgo } from '@/lib/utils';
import { useQueue, useVerificationStats } from '@/lib/verification';
import { DocumentStrip } from '@/pages/verification/QueuePage';

const guidelines = [
  'Compare every document with the details entered in the application.',
  'Check income certificates on the official AP Seva portal: search the student’s Aadhaar and match the application number.',
  'Confirm enrolment with the institution for every college ID card.',
  'Do not download, copy or share student documents or Aadhaar numbers outside EduBridge.',
  'If you are unsure about a document, mark it for admin review rather than guessing.',
];

export default function VolunteerHome() {
  const { user } = useAuth();
  const stats = useVerificationStats();
  const mine = useQueue({ scope: 'mine' });
  const statPlaceholder = stats.error ? '–' : <Skeleton className="mt-1 h-7 w-12" />;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user!.fullName.split(' ')[0]}`}
        description="Thank you for helping keep EduBridge fair and trustworthy."
        actions={
          <Link to="/dashboard/queue" className={buttonVariants()}>
            Open the queue <ArrowRight />
          </Link>
        }
      />
      {stats.error && <Alert tone="danger" className="mb-6">{stats.error}</Alert>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for a volunteer" value={stats.data?.available ?? statPlaceholder} />
        <Stat label="Assigned to you" value={stats.data?.mine ?? statPlaceholder} />
        <Stat label="Reviewed by you" value={stats.data?.reviewedByMe ?? statPlaceholder} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Your current work" />
          {!mine.data && !mine.error ? (
            <ul className="divide-y divide-border" aria-hidden>
              {[0, 1].map((i) => (
                <li key={i} className="px-5 py-4 sm:px-6">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-56 max-w-full" />
                  <Skeleton className="mt-2.5 h-5 w-32" />
                </li>
              ))}
            </ul>
          ) : mine.data && mine.data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {mine.data.items.map((a) => (
                <li key={a.id}>
                  <Link to={`/dashboard/verify/${a.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-sunken/50 sm:px-6">
                    <div className="min-w-0">
                      <p className="font-medium">{a.studentName}</p>
                      <p className="truncate text-[13px] text-subtle">
                        {a.applicationNumber} · started {a.claimedAt ? timeAgo(a.claimedAt) : ''}
                      </p>
                      <div className="mt-1.5">
                        <DocumentStrip documents={a.documents} />
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ListChecks}
              title="Nothing assigned to you"
              text="Pick an application from the queue to start verifying it. The oldest applications are listed first."
              action={
                <Link to="/dashboard/queue" className={buttonVariants({ variant: 'secondary' })}>
                  View the queue
                </Link>
              }
            />
          )}
        </Card>
        <Card>
          <CardHeader title="Verification guidelines" />
          <CardBody>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-subtle">
              {guidelines.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
            <a
              href={AP_SEVA_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
            >
              Open the AP Seva portal <ExternalLink className="size-3.5" />
            </a>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
