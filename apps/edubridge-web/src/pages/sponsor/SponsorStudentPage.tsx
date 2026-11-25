import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  EDUCATION_LEVEL_LABELS,
  MIN_SUPPORT,
  NEED_LEVEL_LABELS,
  SPECIAL_CIRCUMSTANCE_LABELS,
  connectSchema,
  type ExpenseKey,
} from '@edubridge/shared';
import { DefinitionList, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { ExpenseTable, FundingBar, MatchBreakdown, MatchScore } from '@/components/sponsorship/parts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatDate } from '@/lib/student';
import { sponsorApi, useLoad } from '@/lib/sponsorship';
import { formatINR } from '@/lib/utils';
import { LEVEL_TONE } from '@/pages/review/ReviewQueuePage';
import { yearOf } from './DiscoverPage';

export default function SponsorStudentPage() {
  const { id = '' } = useParams();
  const { data, error, reload } = useLoad(() => sponsorApi.student(id), [id]);
  const prefs = useLoad(() => sponsorApi.preferences());
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Skeleton className="h-96" />;
  const s = data.student;
  const max = Math.min(s.remaining, data.available);

  const submit = async () => {
    const body = { amount: amount.trim() ? Number(amount.replace(/,/g, '')) : Number.NaN, messageToStudent: message };
    const parsed = connectSchema.safeParse(body);
    const fe: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    else if (parsed.data.amount > s.remaining) fe.amount = `The student needs ${formatINR(s.remaining)} more`;
    else if (parsed.data.amount > data.available) fe.amount = `You have ${formatINR(data.available)} available`;
    if (Object.keys(fe).length || !parsed.success) {
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      await sponsorApi.connect(id, parsed.data);
      toast.success('You are now connected. The student’s contact details are in My sponsorships.');
      setAmount('');
      setMessage('');
      await reload();
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]])));
      toast.error(getErrorMessage(e));
      void reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/dashboard/discover" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Find students
      </Link>
      <PageHeader
        title={s.alias}
        description={[s.course, s.specialization].filter(Boolean).join(', ') + (s.level ? ` · ${EDUCATION_LEVEL_LABELS[s.level]}` : '')}
        meta={<Badge tone={LEVEL_TONE[s.needLevel]}>{NEED_LEVEL_LABELS[s.needLevel]}</Badge>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Support needed" description={`Approved for ${s.academicYear} on ${formatDate(s.approvedAt)}`} />
            <CardBody>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">Approved requirement</p>
                <p className="text-xl font-semibold tabular-nums">{formatINR(s.approvedAmount)}</p>
              </div>
              <FundingBar className="mt-4" approved={s.approvedAmount} promised={s.promised} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="About this student" description="The anonymised profile shown to sponsors." />
            <CardBody className="space-y-6">
              <DefinitionList
                items={[
                  ['Course', [s.course, s.specialization].filter(Boolean).join(', ') || undefined],
                  ['Year', yearOf(s)],
                  ['State', s.state],
                  ['Last exam', s.lastExamPercentage !== undefined ? `${s.lastExamPercentage}%` : undefined],
                  ['Documents verified', `${s.verifiedDocuments} of ${s.totalDocuments}`],
                  [
                    'Circumstances',
                    s.circumstances.length ? s.circumstances.map((c) => SPECIAL_CIRCUMSTANCE_LABELS[c]).join(', ') : <span className="text-subtle">None stated</span>,
                  ],
                ]}
              />
              {s.noteToSponsors && (
                <div>
                  <p className="text-[13px] text-muted-foreground">In the student’s words</p>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{s.noteToSponsors}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Annual education costs" description="As stated in the application, after verification." />
            <CardBody>
              <ExpenseTable expenses={s.expenses} highlight={(prefs.data?.categories ?? []) as ExpenseKey[]} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Support this student" />
            <CardBody>
              {s.mySponsorship ? (
                <Alert tone="success" title={`You are connected · ${formatINR(s.mySponsorship.amount)} promised`}>
                  The student’s name, email and phone number are in{' '}
                  <Link to="/dashboard/sponsorships" className="underline underline-offset-2">
                    My sponsorships
                  </Link>
                  . Contact them to arrange your support.
                </Alert>
              ) : s.remaining <= 0 ? (
                <p className="text-sm text-muted-foreground">This student’s requirement is fully covered.</p>
              ) : data.available < MIN_SUPPORT ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">You have {formatINR(data.available)} of your budget available.</p>
                  <Link to="/dashboard/preferences" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Change budget
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <Field
                    label="Amount you intend to give"
                    htmlFor="amount"
                    error={errors.amount}
                    hint={`Between ${formatINR(MIN_SUPPORT)} and ${formatINR(max)}`}
                    action={
                      <button type="button" className="cursor-pointer text-[13px] text-primary-ink hover:underline" onClick={() => setAmount(max.toLocaleString('en-IN'))}>
                        {max === s.remaining ? 'Cover the rest' : 'Use available'}
                      </button>
                    }
                  >
                    <Input
                      id="amount"
                      prefix="₹"
                      inputMode="numeric"
                      value={amount}
                      invalid={!!errors.amount}
                      onChange={(e) => {
                        setAmount(e.target.value.replace(/[^\d,]/g, ''));
                        setErrors((x) => ({ ...x, amount: '' }));
                      }}
                    />
                  </Field>
                  <Field label="Message to the student" htmlFor="message" optional error={errors.messageToStudent} hint="Shown to the student when you connect.">
                    <Textarea id="message" className="min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} />
                  </Field>
                  <Button className="w-full" onClick={submit} loading={busy}>
                    Connect with this student
                  </Button>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    When you connect, you and the student see each other’s name, email and phone number. You arrange the support directly; no money
                    passes through EduBridge.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why this student was suggested" action={<MatchScore score={s.match.score} />} />
            <CardBody>
              <MatchBreakdown match={s.match} />
            </CardBody>
          </Card>

          <p className="flex gap-2 px-1 text-[13px] leading-relaxed text-subtle">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            The student’s name and contact details are shared only with sponsors who connect. Their address, income and documents are never shared.
          </p>
        </div>
      </div>
    </>
  );
}
