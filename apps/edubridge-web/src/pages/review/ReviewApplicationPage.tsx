import { ArrowLeft, Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DECISION_LABELS,
  DECISIONS,
  decisionSchema,
  DOCUMENT_TYPE_LABELS,
  NEED_LEVEL_LABELS,
  NEED_LEVELS,
  RECOMMENDATION_LABELS,
  type AssessmentDTO,
  type Decision,
  type NeedLevel,
} from '@edubridge/shared';
import { ApplicationSummary } from '@/components/application/ApplicationSummary';
import { ApplicationStatusBadge, DocumentStatusBadge } from '@/components/application/status';
import { PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { MeterRow, ProbabilityBars } from '@/components/review/charts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { reviewApi, useReviewDetail, type ReviewDetail } from '@/lib/review';
import { formatDate } from '@/lib/student';
import { cn, formatINR } from '@/lib/utils';
import { LEVEL_TONE } from './ReviewQueuePage';

function AssessmentCard({ assessment }: { assessment: AssessmentDTO }) {
  const r = assessment.ruleBased;
  return (
    <Card>
      <CardHeader title="Need assessment" description={`Rule-based score · ${r.version} · ${formatDate(assessment.assessedAt, true)}`} />
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="text-[40px] font-semibold leading-none tabular-nums tracking-tight">
            {r.score}
            <span className="ml-1 text-lg font-normal text-subtle">/ 100</span>
          </p>
          <Badge tone={LEVEL_TONE[r.level]} className="mb-1">
            {NEED_LEVEL_LABELS[r.level]}
          </Badge>
          <p className="mb-1 text-[13px] text-muted-foreground">High need from 65, medium from 40.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Income used: <span className="font-medium text-foreground">{formatINR(r.incomeUsed.amount)}</span>{' '}
          {r.incomeUsed.source === 'VERIFIED' ? '(confirmed on AP Seva during verification)' : '(as declared by the student; no verified figure recorded)'}
        </p>
        <div className="space-y-5">
          {r.factors.map((f) => (
            <div key={f.key}>
              <MeterRow label={f.label} value={f.points} max={f.max} valueText={`${f.points} / ${f.max}`} tip={f.detail} />
              <p className="mt-1.5 text-[13px] leading-snug text-subtle">{f.detail}</p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function MlCard({ assessment }: { assessment: AssessmentDTO }) {
  const ml = assessment.ml;
  return (
    <Card>
      <CardHeader
        title="ML second opinion"
        description="Experimental. Shown for comparison only; it never decides."
        action={
          <Link to="/dashboard/model" className="text-sm text-primary-ink hover:underline">
            Model details
          </Link>
        }
      />
      <CardBody className="space-y-4">
        {ml.status !== 'OK' || !ml.prediction ? (
          <p className="text-sm text-muted-foreground">{ml.message ?? 'No ML opinion is available.'}</p>
        ) : (
          <>
            {ml.model?.source === 'SYNTHETIC_DEMO' && (
              <Alert tone="warning" title="Demonstration model">
                Trained on synthetic data to show how the pipeline works. This is not a genuine assessment of this student. Do not base the decision on it.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Predicted</span>
              <Badge tone={LEVEL_TONE[ml.prediction]}>{NEED_LEVEL_LABELS[ml.prediction]}</Badge>
              <span className="text-[13px] text-muted-foreground">
                {ml.agreesWithRules ? (
                  <>
                    <Check className="mr-1 inline size-3.5 text-success" />
                    Agrees with the rule-based level
                  </>
                ) : (
                  <>
                    <TriangleAlert className="mr-1 inline size-3.5 text-warning" />
                    Differs from the rule-based level ({NEED_LEVEL_LABELS[assessment.ruleBased.level].toLowerCase()})
                  </>
                )}
              </span>
            </div>
            {ml.probabilities && <ProbabilityBars probabilities={ml.probabilities} />}
            {ml.model && (
              <p className="text-[13px] text-subtle">
                {ml.model.algorithm} · {ml.model.samples} {ml.model.source === 'SYNTHETIC_DEMO' ? 'synthetic samples' : 'reviewed decisions'} · macro F1{' '}
                {ml.model.macroF1.toFixed(2)} · trained {formatDate(ml.model.trainedAt)}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function VerificationCard({ detail }: { detail: ReviewDetail }) {
  const vr = detail.volunteerReview;
  return (
    <Card>
      <CardHeader
        title="Verification"
        action={
          <Link to={`/dashboard/verify/${detail.application.id}`} className="text-sm text-primary-ink hover:underline">
            Full record
          </Link>
        }
      />
      <CardBody className="space-y-5">
        {vr && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={vr.recommendation === 'RECOMMEND' ? 'success' : vr.recommendation === 'NOT_RECOMMENDED' ? 'danger' : 'warning'}>
                {RECOMMENDATION_LABELS[vr.recommendation].label}
              </Badge>
              <span className="text-[13px] text-subtle">
                {vr.by.name} · {formatDate(vr.at, true)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{vr.summary}</p>
          </div>
        )}
        <ul className="space-y-2">
          {detail.application.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{DOCUMENT_TYPE_LABELS[d.type]}</span>
              <DocumentStatusBadge status={d.status} />
            </li>
          ))}
        </ul>
        {detail.inconsistencies.length > 0 && (
          <div>
            <p className="text-sm font-medium">Differences found</p>
            <ul className="mt-2 space-y-1.5">
              {detail.inconsistencies.map((i, n) => (
                <li key={n} className="flex gap-2 text-[13px] text-muted-foreground">
                  <TriangleAlert className={cn('mt-0.5 size-3.5 shrink-0', i.severity === 'warning' ? 'text-warning' : 'text-info')} />
                  <span>
                    <span className="text-foreground">{i.field}</span>
                    {i.document && ` (${DOCUMENT_TYPE_LABELS[i.document]})`}: {i.application !== undefined && <>application {i.application}, </>}found {i.found}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const DECISION_TONE = { APPROVED: 'success', ON_HOLD: 'warning', REJECTED: 'danger' } as const;
const DECISION_DONE: Record<Decision, string> = { APPROVED: 'Approved', ON_HOLD: 'On hold', REJECTED: 'Not approved' };

function DecisionRecord({ detail }: { detail: ReviewDetail }) {
  const d = detail.decision!;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={DECISION_TONE[d.decision]}>{DECISION_DONE[d.decision]}</Badge>
        <Badge tone={LEVEL_TONE[d.needLevel]}>{NEED_LEVEL_LABELS[d.needLevel]}</Badge>
      </div>
      {d.approvedAmount !== undefined && (
        <p>
          Approved for sponsorship: <span className="font-medium">{formatINR(d.approvedAmount)}</span>
        </p>
      )}
      <div>
        <p className="text-[13px] text-muted-foreground">Reason (internal)</p>
        <p className="whitespace-pre-line">{d.reason}</p>
      </div>
      {d.messageToStudent && (
        <div>
          <p className="text-[13px] text-muted-foreground">Message to the student</p>
          <p className="whitespace-pre-line">{d.messageToStudent}</p>
        </div>
      )}
      <p className="text-[13px] text-subtle">
        {d.by.name} · {formatDate(d.at, true)}
      </p>
    </div>
  );
}

function DecisionForm({ detail, onDone }: { detail: ReviewDetail; onDone: (d: ReviewDetail) => void }) {
  const requested = detail.application.support.requestedAmount ?? 0;
  const [decision, setDecision] = useState<Decision | undefined>();
  const [needLevel, setNeedLevel] = useState<NeedLevel | undefined>(detail.decision?.needLevel ?? detail.assessment?.ruleBased.level);
  const [amount, setAmount] = useState(String(requested || ''));
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const body = {
      decision,
      needLevel,
      approvedAmount: decision === 'APPROVED' && amount.trim() ? Number(amount.replace(/,/g, '')) : undefined,
      reason,
      messageToStudent: message,
    };
    const parsed = decisionSchema.safeParse(body);
    const fe: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    if (decision === 'APPROVED' && body.approvedAmount && body.approvedAmount > requested) fe.approvedAmount = `Cannot exceed the ${formatINR(requested)} requested`;
    if (Object.keys(fe).length || !parsed.success) {
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      onDone(await reviewApi.decide(detail.application.id, parsed.data));
      window.scrollTo({ top: 0 });
      toast.success('Decision recorded');
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]])));
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Decision</legend>
        {DECISIONS.filter((d) => !(d === 'ON_HOLD' && detail.application.status === 'ON_HOLD')).map((d) => (
          <label
            key={d}
            className={cn('flex cursor-pointer gap-3 rounded-lg border px-3.5 py-3 transition-colors', decision === d ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong')}
          >
            <input
              type="radio"
              name="decision"
              className="mt-1 accent-[var(--primary)]"
              checked={decision === d}
              onChange={() => {
                setDecision(d);
                setErrors((e) => ({ ...e, decision: '' }));
              }}
            />
            <span>
              <span className="block text-sm font-medium">{DECISION_LABELS[d].label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{DECISION_LABELS[d].help}</span>
            </span>
          </label>
        ))}
        {errors.decision && <p className="text-[13px] text-danger">{errors.decision}</p>}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Need level</legend>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Pre-filled from the rule-based score. Your confirmed level is what the ML model learns from.</p>
        <div className="mt-2 flex gap-1 rounded-lg bg-sunken p-1 ring-1 ring-border">
          {NEED_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={needLevel === l}
              onClick={() => setNeedLevel(l)}
              className={cn(
                'flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
                needLevel === l ? 'bg-surface text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {NEED_LEVEL_LABELS[l].replace(' need', '')}
            </button>
          ))}
        </div>
        {errors.needLevel && <p className="mt-1.5 text-[13px] text-danger">{errors.needLevel}</p>}
      </fieldset>

      {decision === 'APPROVED' && (
        <Field label="Amount approved for sponsorship" htmlFor="approved-amount" error={errors.approvedAmount} hint={`Requested: ${formatINR(requested)}`}>
          <Input
            id="approved-amount"
            prefix="₹"
            inputMode="numeric"
            value={amount}
            invalid={!!errors.approvedAmount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d,]/g, ''));
              setErrors((x) => ({ ...x, approvedAmount: '' }));
            }}
          />
        </Field>
      )}
      <Field label="Reason" htmlFor="decision-reason" error={errors.reason} hint="Internal. Kept in the audit trail; not shown to the student.">
        <Textarea
          id="decision-reason"
          value={reason}
          invalid={!!errors.reason}
          className="min-h-20"
          onChange={(e) => {
            setReason(e.target.value);
            setErrors((x) => ({ ...x, reason: '' }));
          }}
        />
      </Field>
      <Field label="Message to the student" htmlFor="decision-message" optional hint="Shown on the student’s application.">
        <Textarea id="decision-message" value={message} className="min-h-20" onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Button className="w-full" onClick={submit} loading={busy}>
        Record decision
      </Button>
    </div>
  );
}

export default function ReviewApplicationPage() {
  const { id = '' } = useParams();
  const { data, setData, error } = useReviewDetail(id);
  const [busy, setBusy] = useState(false);

  if (error)
    return (
      <div className="space-y-4">
        <Link to="/dashboard/review" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Decisions
        </Link>
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-72" />
      </div>
    );

  const app = data.application;
  const snapshot = app.profileSnapshot ?? { personal: {}, education: {} };
  const reassess = async () => {
    setBusy(true);
    try {
      setData(await reviewApi.reassess(app.id));
      toast.success('Assessment updated');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/dashboard/review" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Decisions
      </Link>
      <PageHeader
        meta={
          <>
            <span>{app.applicationNumber}</span>
            <ApplicationStatusBadge status={app.status} />
          </>
        }
        title={data.student.name}
        description={[snapshot.education.course, snapshot.education.institutionName].filter(Boolean).join(' · ')}
        actions={
          data.canDecide && (
            <Button variant="secondary" onClick={reassess} loading={busy}>
              <RefreshCw /> Re-run assessment
            </Button>
          )
        }
      />

      {!data.assessment && app.status !== 'DRAFT' && (
        <Alert tone="info" className="mb-6">
          This application has not been assessed yet. It is assessed automatically once a volunteer completes verification.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {data.assessment && <AssessmentCard assessment={data.assessment} />}
          {data.assessment && <MlCard assessment={data.assessment} />}
          <VerificationCard detail={data} />
          <Card>
            <CardHeader title="Application details" description={`Submitted on ${formatDate(app.submittedAt, true)}`} />
            <CardBody>
              <ApplicationSummary profile={snapshot} application={app} />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader title={data.canDecide ? 'Decision' : 'Final decision'} description={data.canDecide ? 'The final eligibility decision is made by an administrator.' : undefined} />
            <CardBody className="space-y-6">
              {data.decision && <DecisionRecord detail={data} />}
              {data.canDecide && data.decision && <hr className="border-border" />}
              {data.canDecide ? (
                <DecisionForm key={data.decision?.at ?? 'new'} detail={data} onDone={setData} />
              ) : (
                !data.decision && <p className="text-sm text-muted-foreground">Not ready for a decision yet.</p>
              )}
            </CardBody>
          </Card>
          {data.decision?.decision === 'APPROVED' && (
            <Link to="/dashboard/review" className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
              Back to decisions
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
