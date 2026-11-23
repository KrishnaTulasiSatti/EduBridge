import { ArrowLeft, Building2, CheckCircle2, Circle, Mail, Phone, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  FINAL_DOCUMENT_STATUSES,
  RECOMMENDATION_LABELS,
  RECOMMENDATIONS,
  volunteerReviewSchema,
  type Recommendation,
  type VerificationDetailDTO,
} from '@edubridge/shared';
import { ApplicationSummary } from '@/components/application/ApplicationSummary';
import { ApplicationStatusBadge, DocumentStatusBadge } from '@/components/application/status';
import { PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { DocumentReviewPanel } from '@/components/verification/DocumentReviewPanel';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatDate } from '@/lib/student';
import { cn, formatINR } from '@/lib/utils';
import { useVerificationDetail, verificationApi } from '@/lib/verification';

function Checklist({ detail }: { detail: VerificationDetailDTO }) {
  const docs = DOCUMENT_TYPES.map((t) => detail.application.documents.find((d) => d.type === t)).filter((d) => !!d);
  const done = docs.filter((d) => FINAL_DOCUMENT_STATUSES.includes(d.status)).length;
  return (
    <Card>
      <CardHeader title="Checklist" description={`${done} of ${docs.length} documents checked`} />
      <CardBody className="space-y-3">
        {docs.map((d) => {
          const complete = FINAL_DOCUMENT_STATUSES.includes(d.status);
          return (
            <a key={d.id} href={`#doc-${d.type}`} className="flex items-center justify-between gap-3 text-sm hover:text-primary-ink">
              <span className="flex items-center gap-2">
                {complete ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-border-strong" />}
                {DOCUMENT_TYPE_LABELS[d.type]}
              </span>
              <DocumentStatusBadge status={d.status} />
            </a>
          );
        })}
      </CardBody>
    </Card>
  );
}

function Inconsistencies({ detail }: { detail: VerificationDetailDTO }) {
  const list = detail.inconsistencies;
  return (
    <Card>
      <CardHeader title="Differences found" description="Between the application and the documents" />
      <CardBody>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">None so far. Differences appear here as you record each check.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((i, n) => (
              <li key={n} className="flex gap-2.5 text-sm">
                <TriangleAlert className={cn('mt-0.5 size-4 shrink-0', i.severity === 'warning' ? 'text-warning' : 'text-info')} />
                <div className="min-w-0">
                  <p className="font-medium">
                    {i.field}
                    {i.document && <span className="font-normal text-subtle"> · {DOCUMENT_TYPE_LABELS[i.document]}</span>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {i.application !== undefined && (
                      <>
                        Application: <span className="text-foreground">{i.application}</span>
                        <br />
                      </>
                    )}
                    {i.application !== undefined ? 'Found: ' : ''}
                    <span className="text-foreground">{i.found}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function InstitutionCard({ detail }: { detail: VerificationDetailDTO }) {
  const c = detail.institutionCheck;
  return (
    <Card>
      <CardHeader title="Institution" />
      <CardBody className="space-y-2 text-sm">
        <p className="flex items-start gap-2">
          <Building2 className="mt-0.5 size-4 shrink-0 text-subtle" />
          <span>
            {c.entered.institutionName ?? 'Not provided'}
            {c.entered.university && <span className="block text-[13px] text-subtle">{c.entered.university}</span>}
          </span>
        </p>
        {c.result === 'REGISTERED' && (
          <Badge tone="success">
            Registered with EduVault · {c.match!.code}
          </Badge>
        )}
        {c.result === 'NOT_FOUND' && <Badge tone="warning">Not in the EduVault registry</Badge>}
        {c.result === 'UNAVAILABLE' && <Badge tone="neutral">Registry unavailable</Badge>}
      </CardBody>
    </Card>
  );
}

function ReviewSubmit({ detail, onDone }: { detail: VerificationDetailDTO; onDone: (d: VerificationDetailDTO) => void }) {
  const [recommendation, setRecommendation] = useState<Recommendation | undefined>();
  const [summary, setSummary] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const pending = detail.application.documents.filter((d) => !FINAL_DOCUMENT_STATUSES.includes(d.status));

  const submit = async () => {
    const parsed = volunteerReviewSchema.safeParse({ recommendation, summary });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      onDone(await verificationApi.submitReview(detail.application.id, parsed.data));
      window.scrollTo({ top: 0 });
      toast.success('Review submitted to the administrator');
    } catch (e) {
      const fe = getFieldErrors(e);
      toast.error(fe?.documents?.[0] ?? getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Submit your review" description="Your recommendation goes to an administrator, who makes the final decision." />
      <CardBody className="space-y-4">
        {pending.length > 0 && (
          <Alert tone="info">
            Record a result for {pending.map((d) => DOCUMENT_TYPE_LABELS[d.type].toLowerCase()).join(', ')} first. A source that was unavailable needs to be
            checked again.
          </Alert>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Recommendation</legend>
          {RECOMMENDATIONS.map((r) => (
            <label
              key={r}
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border px-3.5 py-3 transition-colors',
                recommendation === r ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong',
              )}
            >
              <input
                type="radio"
                name="recommendation"
                className="mt-1 accent-[var(--primary)]"
                checked={recommendation === r}
                onChange={() => {
                  setRecommendation(r);
                  setErrors((e) => ({ ...e, recommendation: '' }));
                }}
              />
              <span>
                <span className="block text-sm font-medium">{RECOMMENDATION_LABELS[r].label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{RECOMMENDATION_LABELS[r].help}</span>
              </span>
            </label>
          ))}
          {errors.recommendation && <p className="text-[13px] text-danger">{errors.recommendation}</p>}
        </fieldset>
        <Field label="Summary for the administrator" htmlFor="review-summary" error={errors.summary}>
          <Textarea
            id="review-summary"
            value={summary}
            invalid={!!errors.summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setErrors((x) => ({ ...x, summary: '' }));
            }}
          />
        </Field>
        <Button className="w-full" onClick={submit} loading={busy} disabled={pending.length > 0}>
          Submit review
        </Button>
      </CardBody>
    </Card>
  );
}

function SubmittedReview({ detail }: { detail: VerificationDetailDTO }) {
  const r = detail.volunteerReview!;
  return (
    <Card>
      <CardHeader title="Volunteer review" />
      <CardBody className="space-y-3">
        <Badge tone={r.recommendation === 'RECOMMEND' ? 'success' : r.recommendation === 'NOT_RECOMMENDED' ? 'danger' : 'warning'}>
          {RECOMMENDATION_LABELS[r.recommendation].label}
        </Badge>
        <p className="whitespace-pre-line text-sm leading-relaxed">{r.summary}</p>
        <p className="text-[13px] text-subtle">
          {r.by.name} · {formatDate(r.at, true)}
        </p>
      </CardBody>
    </Card>
  );
}

export default function VerifyApplicationPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, setData, error, reload } = useVerificationDetail(id);
  const [busy, setBusy] = useState(false);
  const backTo = user!.role === 'ADMIN' ? '/dashboard/verification' : '/dashboard/queue';

  if (error)
    return (
      <div className="space-y-4">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the queue
        </Link>
        <Alert tone={error.status === 403 ? 'warning' : 'danger'}>{error.message}</Alert>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );

  const app = data.application;
  const snapshot = app.profileSnapshot ?? { personal: {}, education: {} };
  const inStage = app.status === 'SUBMITTED' || app.status === 'UNDER_VERIFICATION';
  const assignedToOther = data.assignee && data.assignee.id !== user!.id;

  const claim = async () => {
    setBusy(true);
    try {
      setData(await verificationApi.claim(app.id));
      toast.success('Verification started. Documents are now marked “in progress”.');
    } catch (e) {
      toast.error(getErrorMessage(e));
      void reload();
    } finally {
      setBusy(false);
    }
  };
  const release = async () => {
    setBusy(true);
    try {
      await verificationApi.release(app.id);
      toast.success('Returned to the queue. Results you recorded are kept.');
      if (user!.role === 'ADMIN') void reload();
      else navigate(backTo);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const docs = DOCUMENT_TYPES.map((t) => app.documents.find((d) => d.type === t)).filter((d) => !!d);

  return (
    <>
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Verification queue
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
          <>
            {inStage && !data.assignee && (
              <Button onClick={claim} loading={busy}>
                Start verification
              </Button>
            )}
            {data.assignee && (data.canEdit || user!.role === 'ADMIN') && (
              <Button variant="secondary" onClick={release} loading={busy}>
                {data.canEdit ? 'Return to queue' : 'Unassign'}
              </Button>
            )}
          </>
        }
      />

      {assignedToOther && (
        <Alert tone="info" className="mb-6">
          {data.assignee!.name} started verifying this application on {formatDate(data.assignee!.claimedAt, true)}. You can view it but not record results.
        </Alert>
      )}
      {app.status === 'VOLUNTEER_REVIEWED' && (
        <Alert tone="success" className="mb-6">
          Preliminary verification is complete. The application is waiting for an administrator’s assessment.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Documents"
              description={data.canEdit ? 'Check each document against its official source and record the result.' : undefined}
            />
            <CardBody className="space-y-4">
              {docs.map((d) => (
                <DocumentReviewPanel key={d.id} detail={data} doc={d} onSaved={setData} />
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Application details" description={`Submitted on ${formatDate(app.submittedAt, true)}`} />
            <CardBody>
              <ApplicationSummary profile={snapshot} application={app} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Checklist detail={data} />
          <Inconsistencies detail={data} />
          {data.volunteerReview ? <SubmittedReview detail={data} /> : data.canEdit && <ReviewSubmit detail={data} onDone={setData} />}
          <InstitutionCard detail={data} />
          <Card>
            <CardHeader title="Student contact" description="For questions about the documents only" />
            <CardBody className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-subtle" /> {data.student.email}
              </p>
              {data.student.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-subtle" /> {data.student.phone}
                </p>
              )}
              {app.family.annualFamilyIncome !== undefined && (
                <p className="pt-2 text-[13px] text-muted-foreground">Declared annual family income: {formatINR(app.family.annualFamilyIncome)}</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
