import {
  APPLICATION_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  type ApplicationStatus,
  type DocumentStatus,
} from '@edubridge/shared';
import { Badge, Dot, type BadgeTone } from '@/components/ui/badge';

const appTone: Record<ApplicationStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_VERIFICATION: 'info',
  VOLUNTEER_REVIEWED: 'info',
  ASSESSED: 'info',
  APPROVED: 'success',
  ON_HOLD: 'warning',
  REJECTED: 'danger',
  PARTIALLY_FUNDED: 'primary',
  FULLY_FUNDED: 'success',
};

const docTone: Record<DocumentStatus, BadgeTone> = {
  PENDING: 'neutral',
  PROCESSING: 'info',
  VERIFIED: 'success',
  REVIEW_REQUIRED: 'warning',
  REJECTED: 'danger',
  SERVICE_UNAVAILABLE: 'warning',
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge tone={appTone[status]}>
      <Dot /> {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge tone={docTone[status]}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}
