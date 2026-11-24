import { Award, EyeOff, HeartHandshake } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { StudentFundingDTO } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { FundingBar, SponsorshipStatusBadge } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/student';
import { certificateLink, fundingApi, useLoad } from '@/lib/sponsorship';
import { formatINR } from '@/lib/utils';

const SHARED = [
  'Course, level and year of study',
  'The state you study in',
  'Your last exam percentage',
  'Your need level and the amount approved',
  'Your annual cost breakdown',
  'Special circumstances you selected',
  'The note below, if you write one',
];
const NOT_SHARED = ['Your name, email and phone number', 'Your address and college name', 'Family income and documents', 'Your Aadhaar number'];

function VisibilityCard({ funding, onChange }: { funding: StudentFundingDTO; onChange: (f: StudentFundingDTO) => void }) {
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState(funding.noteToSponsors ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => setNote(funding.noteToSponsors ?? ''), [funding.noteToSponsors]);

  const save = async (visible: boolean) => {
    setBusy(true);
    try {
      onChange(await fundingApi.setVisibility({ visible, noteToSponsors: note }));
      setEditing(false);
      toast.success(visible ? 'Your profile is now shown to sponsors' : 'Your profile is hidden from sponsors');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (funding.visible && !editing) {
    return (
      <Card>
        <CardHeader
          title="Shown to sponsors"
          description={`Since ${formatDate(funding.visibleSince)} as “${funding.alias}”`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {funding.noteToSponsors ? (
            <div>
              <p className="text-[13px] text-muted-foreground">Your note to sponsors</p>
              <p className="mt-1 whitespace-pre-line text-sm">{funding.noteToSponsors}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You have not written a note to sponsors.</p>
          )}
          <Button variant="secondary" size="sm" loading={busy} onClick={() => save(false)}>
            <EyeOff /> Hide my profile
          </Button>
          <p className="text-[13px] text-subtle">Hiding your profile does not affect pledges already made.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={funding.visible ? 'Edit what sponsors see' : 'Show your profile to sponsors'} description="Sponsors can only find you if you agree. You can hide your profile at any time." />
      <CardBody className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Sponsors will see</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {SHARED.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Sponsors will not see</p>
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
        {!funding.visible && (
          <Checkbox id="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} label="I agree to show this anonymised profile to sponsors on EduBridge" />
        )}
        <div className="flex gap-2">
          <Button loading={busy} disabled={!funding.visible && !agree} onClick={() => save(true)}>
            {funding.visible ? 'Save note' : 'Show my profile'}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
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
                : 'After an administrator approves your application, you can choose to show an anonymised profile to sponsors here.'
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
      <PageHeader title="Sponsorship" description="Sponsors who support you, and how much of your approved requirement is covered." />
      {fully && (
        <Alert tone="success" title="Your requirement is fully funded" className="mb-6">
          Every rupee of your approved requirement has been received from sponsors.
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Funding" />
            <CardBody>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">Approved requirement</p>
                <p className="text-xl font-semibold tabular-nums">{formatINR(data.approvedAmount)}</p>
              </div>
              <FundingBar className="mt-4" approved={data.approvedAmount} confirmed={data.confirmed} pledged={data.pledged} />
              {data.pledged > 0 && (
                <p className="mt-4 text-[13px] text-muted-foreground">Pledged amounts become confirmed once EduBridge receives the funds from the sponsor.</p>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Your sponsors" />
            {data.sponsorships.length === 0 ? (
              <EmptyState
                icon={HeartHandshake}
                title="No sponsors yet"
                text={data.visible ? 'Sponsors whose preferences match will see your profile.' : 'Show your profile to sponsors so they can find you.'}
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.sponsorships.map((s) => (
                  <li key={s.id} className="px-5 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{s.sponsor.name}</p>
                          <SponsorshipStatusBadge status={s.status} />
                        </div>
                        <p className="mt-0.5 text-[13px] text-subtle">
                          {s.status === 'CONFIRMED'
                            ? `Received ${formatDate(s.confirmation?.receivedOn)}`
                            : s.status === 'PLEDGED'
                              ? `Pledged ${formatDate(s.createdAt)}`
                              : `Cancelled ${formatDate(s.cancelledAt)}`}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">{formatINR(s.amount)}</p>
                    </div>
                    {s.messageToStudent && <p className="mt-2.5 whitespace-pre-line border-l-2 border-border pl-3 text-sm text-muted-foreground">{s.messageToStudent}</p>}
                    {s.certificate && !s.certificate.revoked && (
                      <Link to={certificateLink(s.certificate)} className={`${buttonVariants({ size: 'sm', variant: 'secondary' })} mt-3`}>
                        <Award /> Award certificate
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {!fully && <VisibilityCard funding={data} onChange={setData} />}
      </div>
    </>
  );
}
