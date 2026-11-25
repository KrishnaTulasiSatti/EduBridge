import { HeartHandshake } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { StudentFundingDTO } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { ContactCard, FundingBar, SponsorshipStatusBadge, sponsorshipStatusLine } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { fundingApi, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

const SHARED = [
  'Course, level and year of study',
  'The state you study in',
  'Your last exam percentage',
  'Your need level and the amount approved',
  'Your annual cost breakdown',
  'Special circumstances you selected',
  'The note below, if you write one',
];
const ON_CONNECT = ['Your name', 'Your email address', 'Your phone number'];
const NOT_SHARED = ['Your address and college name', 'Family income and documents', 'Your Aadhaar number'];

function VisibilityCard({ funding, onChange }: { funding: StudentFundingDTO; onChange: (f: StudentFundingDTO) => void }) {
  const [note, setNote] = useState(funding.noteToSponsors ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(funding.noteToSponsors ?? ''), [funding.noteToSponsors]);
  const changed = note.trim() !== (funding.noteToSponsors ?? '');

  const save = async () => {
    setBusy(true);
    try {
      onChange(await fundingApi.setNote({ noteToSponsors: note }));
      toast.success('Your note has been saved');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Shown to sponsors"
        description={funding.alias ? `Sponsors see your profile as “${funding.alias}”.` : undefined}
        action={<Badge tone="success">Visible</Badge>}
      />
      <CardBody className="space-y-5">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">All sponsors will see</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {SHARED.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">A sponsor who connects with you will also see</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {ON_CONNECT.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">No sponsor will see</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {NOT_SHARED.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
        <Field label="A note to sponsors" htmlFor="note" optional hint="What you are studying and what support would mean to you. Please do not include your name or contact details.">
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} />
        </Field>
        <Button variant="secondary" loading={busy} disabled={!changed} onClick={save}>
          Save note
        </Button>
      </CardBody>
    </Card>
  );
}

export default function SponsorshipPage() {
  const { data, setData, error } = useLoad(() => fundingApi.me());

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Skeleton className="h-80" />;

  if (!data.eligible) {
    return (
      <>
        <PageHeader title="Sponsorship" />
        <Card>
          <EmptyState
            icon={HeartHandshake}
            title={data.status === 'REJECTED' ? 'Not available for this application' : 'Available once your application is approved'}
            text={
              data.status === 'REJECTED'
                ? 'Your application was not approved, so it cannot be matched with sponsors.'
                : 'After an administrator approves your application, your anonymised profile is shown to sponsors.'
            }
            action={
              <Link to="/dashboard/application" className={buttonVariants({ variant: 'secondary' })}>
                View application
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const fully = data.status === 'FULLY_FUNDED';
  return (
    <>
      <PageHeader title="Sponsorship" description="Sponsors connected with you, and how much of your approved requirement they have promised." />
      {fully && (
        <Alert tone="success" title="Your requirement is fully covered" className="mb-6">
          Sponsors have promised your full approved requirement. Contact them to arrange the support.
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Support promised" />
            <CardBody>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">Approved requirement</p>
                <p className="text-xl font-semibold tabular-nums">{formatINR(data.approvedAmount)}</p>
              </div>
              <FundingBar className="mt-4" approved={data.approvedAmount} promised={data.promised} />
              <p className="mt-4 text-[13px] text-muted-foreground">
                EduBridge does not handle money. You and each sponsor arrange the support directly. Never pay anyone to receive sponsorship.
              </p>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Your sponsors" />
            {data.sponsorships.length === 0 ? (
              <EmptyState
                icon={HeartHandshake}
                title="No sponsors yet"
                text="Sponsors whose preferences match will see your profile."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.sponsorships.map((s) => (
                  <li key={s.id} className={cn('px-5 py-4 sm:px-6', s.status === 'ENDED' && 'opacity-70')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{s.sponsor.name}</p>
                          <SponsorshipStatusBadge status={s.status} />
                        </div>
                        <p className="mt-0.5 text-[13px] text-subtle">{sponsorshipStatusLine(s)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">{formatINR(s.amount)}</p>
                        <p className="text-[12px] text-subtle">promised</p>
                      </div>
                    </div>
                    {s.messageToStudent && <p className="mt-2.5 whitespace-pre-line border-l-2 border-border pl-3 text-sm text-muted-foreground">{s.messageToStudent}</p>}
                    {s.sponsor.contact && <ContactCard className="mt-3" contact={s.sponsor.contact} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">{!fully && <VisibilityCard funding={data} onChange={setData} />}</div>
      </div>
    </>
  );
}
