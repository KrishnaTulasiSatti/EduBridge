import { INSTITUTION_STATUS_LABELS, type InstitutionStatus } from '@eduvault/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ACTION_LABELS, type Activity } from '@/lib/vault';
import { formatDate } from '@/lib/format';

const instTone: Record<InstitutionStatus, BadgeTone> = { PENDING: 'warning', ACTIVE: 'success', SUSPENDED: 'danger', REJECTED: 'neutral' };

export function InstitutionStatusBadge({ status }: { status: InstitutionStatus }) {
  return <Badge tone={instTone[status]}>{INSTITUTION_STATUS_LABELS[status]}</Badge>;
}

/** A short, human description of an audit entry's details. */
function detail(a: Activity) {
  const m = a.metadata as Record<string, string | undefined>;
  if (m.documentId) return m.documentId;
  if (m.name) return m.name;
  if (m.partner && m.consentReference) return `${m.partner} · ${m.consentReference}`;
  if (m.partner) return m.partner;
  if (m.from && m.to) return `${m.from.toLowerCase()} → ${m.to.toLowerCase()}`;
  if (m.rollNumber) return m.rollNumber;
  if (m.email) return m.email;
  return undefined;
}

export function ActivityRow({ a }: { a: Activity }) {
  const d = detail(a);
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3 sm:px-6">
      <div className="min-w-0">
        <p className="text-[15px]">
          {ACTION_LABELS[a.action] ?? a.action}
          {d && <span className="text-muted-foreground"> · {d}</span>}
        </p>
        <p className="text-[13px] text-subtle">{a.actorName ?? 'Unknown user'}</p>
      </div>
      <time className="shrink-0 text-[13px] text-subtle" dateTime={a.createdAt}>
        {formatDate(a.createdAt, true)}
      </time>
    </li>
  );
}
