import { Link } from 'react-router-dom';
import type { ApplicationDTO } from '@edubridge/shared';
import { Alert } from '@/components/ui/alert';
import { formatDate } from '@/lib/student';
import { formatINR } from '@/lib/utils';

/** The administrator's decision as the student sees it. */
export function OutcomeNotice({ application, className }: { application: ApplicationDTO; className?: string }) {
  const o = application.outcome;
  if (!o) return null;
  const decided = formatDate(o.decidedAt);
  if (o.decision === 'APPROVED')
    return (
      <Alert tone="success" title="Your application has been approved" className={className}>
        {o.approvedAmount ? `Approved for sponsorship of up to ${formatINR(o.approvedAmount)}. ` : ''}Decided on {decided}. To be matched with sponsors, show your anonymised profile on the{' '}
        <Link to="/dashboard/sponsorships" className="underline underline-offset-2">Sponsorship</Link> page.{o.message && <span className="mt-2 block whitespace-pre-line">{o.message}</span>}
      </Alert>
    );
  if (o.decision === 'ON_HOLD')
    return (
      <Alert tone="warning" title="Your application is on hold" className={className}>
        A reviewer needs a little more before deciding.{o.message && <span className="mt-2 block whitespace-pre-line">{o.message}</span>}
      </Alert>
    );
  return (
    <Alert tone="danger" title="Your application was not approved" className={className}>
      Decided on {decided}. You can apply again in the next academic year.
      {o.message && <span className="mt-2 block whitespace-pre-line">{o.message}</span>}
    </Alert>
  );
}
