import { Award, Banknote, EyeOff, HeartHandshake, Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { bankDetailsSchema, type SponsorshipDTO, type StudentFundingDTO } from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { FundingBar, SponsorshipStatusBadge } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
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

const EMPTY_BANK = { accountHolderName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', bankName: '' };

/** Where sponsors send the money. Shown in full only to a sponsor who has pledged and still has to pay. */
function BankDetailsCard({ funding, onChange }: { funding: StudentFundingDTO; onChange: (f: StudentFundingDTO) => void }) {
  const saved = funding.bankDetails;
  const [editing, setEditing] = useState(!saved);
  const [form, setForm] = useState(EMPTY_BANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = async () => {
    const parsed = bankDetailsSchema.safeParse(form);
    const fe: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    if (form.accountNumber.replace(/\s+/g, '') !== form.confirmAccountNumber.replace(/\s+/g, '')) fe.confirmAccountNumber = 'The account numbers do not match';
    if (!parsed.success || Object.keys(fe).length) {
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      onChange(await fundingApi.saveBankDetails(parsed.data));
      setEditing(false);
      setForm(EMPTY_BANK);
      toast.success('Bank details saved');
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]])));
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (saved && !editing) {
    return (
      <Card>
        <CardHeader
          title="Bank account for sponsorships"
          description={`Saved ${formatDate(saved.updatedAt)}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Change
            </Button>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{saved.accountHolderName}</dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd className="tabular-nums">•••• {saved.accountNumberLast4}</dd>
            <dt className="text-muted-foreground">IFSC</dt>
            <dd className="tabular-nums">{saved.ifsc}</dd>
            <dt className="text-muted-foreground">Bank</dt>
            <dd>{saved.bankName}</dd>
          </dl>
          <p className="mt-4 text-[13px] text-subtle">Sponsors who pledge to you see these details so they can send the money directly to you.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={saved ? 'Change bank account' : 'Add your bank account'}
        description="Sponsors send the money straight to this account. Only a sponsor who has pledged to you can see it, and only until they have sent the money."
      />
      <CardBody className="space-y-4">
        <Field label="Name on the account" htmlFor="b-name" error={errors.accountHolderName} hint="Exactly as your bank shows it">
          <Input id="b-name" autoComplete="name" value={form.accountHolderName} invalid={!!errors.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account number" htmlFor="b-acc" error={errors.accountNumber}>
            <Input id="b-acc" inputMode="numeric" autoComplete="off" value={form.accountNumber} invalid={!!errors.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} />
          </Field>
          <Field label="Confirm account number" htmlFor="b-acc2" error={errors.confirmAccountNumber}>
            <Input
              id="b-acc2"
              inputMode="numeric"
              autoComplete="off"
              value={form.confirmAccountNumber}
              invalid={!!errors.confirmAccountNumber}
              onPaste={(e) => e.preventDefault()}
              onChange={(e) => set('confirmAccountNumber', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="IFSC code" htmlFor="b-ifsc" error={errors.ifsc} hint="11 characters, on your passbook or cheque">
            <Input id="b-ifsc" autoComplete="off" value={form.ifsc} invalid={!!errors.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} maxLength={11} />
          </Field>
          <Field label="Bank name" htmlFor="b-bank" error={errors.bankName}>
            <Input id="b-bank" value={form.bankName} invalid={!!errors.bankName} onChange={(e) => set('bankName', e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button loading={busy} onClick={submit}>
            <Landmark /> Save bank details
          </Button>
          {saved && (
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** Money the sponsor says they sent: the student confirms it arrived, or reports that it has not. */
function ReceiptActions({ s, onChange }: { s: SponsorshipDTO; onChange: (f: StudentFundingDTO) => void }) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const p = s.payment!;

  const received = async () => {
    setBusy('yes');
    try {
      onChange(await fundingApi.received(s.id));
      toast.success('Thank you. Your award certificate is ready.');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const notReceived = async () => {
    setBusy('no');
    try {
      onChange(await fundingApi.notReceived(s.id, note));
      setReporting(false);
      toast.success('Reported. Your sponsor and EduBridge have been told.');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-sunken/50 p-4">
      <p className="text-sm">
        Your sponsor sent <span className="font-medium">{formatINR(s.amount)}</span> on {formatDate(p.sentOn)}
        {p.toAccountLast4 && <> to your account ending {p.toAccountLast4}</>}.
      </p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Transaction reference (UTR): <span className="tabular-nums text-foreground">{p.reference}</span></p>
      {p.notReceived ? (
        <Alert tone="warning" className="mt-3" title="You reported that this money has not arrived">
          EduBridge will follow up with your sponsor. If it arrives now, you can still confirm it.
        </Alert>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">Check your bank account, then tell us whether the money arrived.</p>
      )}
      {reporting ? (
        <div className="mt-3 space-y-3">
          <Field label="What happened?" htmlFor={`nr-${s.id}`} optional>
            <Textarea id={`nr-${s.id}`} className="min-h-16" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={busy === 'no'} onClick={notReceived}>
              Report not received
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={busy === 'yes'} onClick={received}>
            <Banknote /> Yes, I received it
          </Button>
          {!p.notReceived && (
            <Button size="sm" variant="ghost" onClick={() => setReporting(true)}>
              Not received yet
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

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
            <p className="mt-2 text-[13px] text-subtle">A sponsor who pledges to you sees your bank details, including the name on the account, so they can send the money.</p>
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

      {!data.bankDetails && data.sponsorships.some((s) => s.status === 'PLEDGED') && (
        <Alert tone="warning" title="Add your bank account so your sponsor can send the money" className="mb-6">
          A sponsor has pledged support. They cannot send it until you add your bank details below.
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
                <p className="mt-4 text-[13px] text-muted-foreground">Sponsors send pledged money straight to your bank account. It counts as received once you confirm it here.</p>
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
                            : s.status === 'SENT'
                              ? `Sent ${formatDate(s.payment?.sentOn)}`
                              : s.status === 'PLEDGED'
                                ? `Pledged ${formatDate(s.createdAt)} · ${data.bankDetails ? 'your sponsor will send the money to your bank account' : 'add your bank details so the money can be sent'}`
                                : `Cancelled ${formatDate(s.cancelledAt)}`}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">{formatINR(s.amount)}</p>
                    </div>
                    {s.messageToStudent && <p className="mt-2.5 whitespace-pre-line border-l-2 border-border pl-3 text-sm text-muted-foreground">{s.messageToStudent}</p>}
                    {s.status === 'SENT' && s.payment && <ReceiptActions s={s} onChange={setData} />}
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

        <div className="space-y-6">
          <BankDetailsCard funding={data} onChange={setData} />
          {!fully && <VisibilityCard funding={data} onChange={setData} />}
        </div>
      </div>
    </>
  );
}
