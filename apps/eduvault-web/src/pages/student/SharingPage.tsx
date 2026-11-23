import { Share2 } from 'lucide-react';
import { CONSENT_STATUS_LABELS, type ConsentStatus } from '@eduvault/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { useLoad, vaultApi } from '@/lib/vault';

const tone: Record<ConsentStatus, BadgeTone> = {
  PENDING: 'neutral',
  APPROVED: 'info',
  REDEEMED: 'success',
  DENIED: 'neutral',
  EXPIRED: 'neutral',
};

export default function SharingPage() {
  const { data, error } = useLoad(vaultApi.myConsents);

  return (
    <>
      <PageHeader title="Sharing history" description="Every request to see your documents, what you decided and when the document was collected." />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      <Card>
        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={Share2} title="Nothing shared yet" text="When a service asks for one of your marksheets and you respond, it will be recorded here." />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((c) => (
              <li key={c.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.partner.name}
                      {c.marksheet && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          · Semester {c.marksheet.semester} marksheet
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{c.purpose}</p>
                  </div>
                  <Badge tone={tone[c.status]}>{CONSENT_STATUS_LABELS[c.status]}</Badge>
                </div>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-subtle">
                  <div>
                    <dt className="inline">Requested </dt>
                    <dd className="inline">{formatDate(c.createdAt, true)}</dd>
                  </div>
                  {c.decidedAt && (
                    <div>
                      <dt className="inline">{c.status === 'DENIED' ? 'Declined ' : 'Approved '}</dt>
                      <dd className="inline">{formatDate(c.decidedAt, true)}</dd>
                    </div>
                  )}
                  {c.redeemedAt && (
                    <div>
                      <dt className="inline">Collected </dt>
                      <dd className="inline">{formatDate(c.redeemedAt, true)}</dd>
                    </div>
                  )}
                  {c.consentReference && (
                    <div>
                      <dt className="inline">Reference </dt>
                      <dd className="inline font-mono">{c.consentReference}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
