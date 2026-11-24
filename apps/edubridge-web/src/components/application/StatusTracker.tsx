import { Check, Clock, Pause, X } from 'lucide-react';
import type { ApplicationDTO, ApplicationStatus } from '@edubridge/shared';
import { formatDate } from '@/lib/student';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'SUBMITTED', title: 'Application submitted', current: 'We have received your application.' },
  { key: 'UNDER_VERIFICATION', title: 'Document verification', current: 'Your documents are being checked against official sources.' },
  { key: 'VOLUNTEER_REVIEWED', title: 'Volunteer review', current: 'A volunteer is comparing your documents with your application.' },
  { key: 'ASSESSED', title: 'Need assessment', current: 'Your financial need is being assessed.' },
  { key: 'APPROVED', title: 'Eligibility decision', current: 'An administrator is reviewing your application.' },
  { key: 'FULLY_FUNDED', title: 'Sponsorship', current: 'Show your profile to sponsors from the Sponsorship page. Sponsors who connect with you appear there with their contact details.' },
] as const;

/** How many stages are complete for each status. The stage after them is the current one. */
const COMPLETED: Record<ApplicationStatus, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  UNDER_VERIFICATION: 1,
  VOLUNTEER_REVIEWED: 3,
  ASSESSED: 4,
  ON_HOLD: 4,
  REJECTED: 5,
  APPROVED: 5,
  PARTIALLY_FUNDED: 5,
  FULLY_FUNDED: 6,
};

export function StatusTracker({ application }: { application: ApplicationDTO }) {
  const done = COMPLETED[application.status];
  const dateFor = (status: string) => [...application.history].reverse().find((h) => h.status === status)?.at;

  return (
    <ol className="space-y-0">
      {STAGES.map((stage, i) => {
        const isDone = i < done;
        const isCurrent = i === done;
        const isDecision = stage.key === 'APPROVED';
        const rejected = isDecision && application.status === 'REJECTED';
        const onHold = isDecision && application.status === 'ON_HOLD';

        let icon = <span className="size-2 rounded-full bg-border-strong" />;
        let ring = 'bg-surface ring-1 ring-border-strong';
        if (rejected) {
          icon = <X className="size-3.5" strokeWidth={2.5} />;
          ring = 'bg-danger text-white';
        } else if (isDone) {
          icon = <Check className="size-3.5" strokeWidth={2.5} />;
          ring = 'bg-primary text-primary-foreground';
        } else if (onHold) {
          icon = <Pause className="size-3.5" />;
          ring = 'bg-warning-soft text-warning ring-1 ring-warning/40';
        } else if (isCurrent) {
          icon = <Clock className="size-3.5" />;
          ring = 'bg-primary-soft text-primary-ink ring-1 ring-primary/40';
        }

        const date = isDone ? dateFor(stage.key === 'APPROVED' ? (rejected ? 'REJECTED' : 'APPROVED') : stage.key) : undefined;
        let detail: string | undefined;
        if (rejected) detail = 'Your application was not approved this time.';
        else if (onHold) detail = 'Your application is on hold. We may contact you for more information.';
        else if (isCurrent) detail = stage.current;

        return (
          <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STAGES.length - 1 && (
              <span className={cn('absolute left-[13px] top-8 bottom-1 w-px', isDone ? 'bg-primary/50' : 'bg-border')} aria-hidden />
            )}
            <span className={cn('relative z-10 grid size-7 shrink-0 place-items-center rounded-full', ring)}>{icon}</span>
            <div className="min-w-0 pt-0.5">
              <p className={cn('text-[15px]', isDone || isCurrent || rejected || onHold ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {rejected ? 'Not approved' : stage.title}
              </p>
              {date && <p className="text-[13px] text-subtle">{formatDate(date, true)}</p>}
              {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
