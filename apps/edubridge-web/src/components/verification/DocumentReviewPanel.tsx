import { Check, CircleAlert, CircleCheck, CircleHelp, Copy, Eye, ExternalLink, FileText, RefreshCw, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  CONTACT_METHOD_LABELS,
  CONTACT_METHODS,
  DOCUMENT_TYPE_LABELS,
  documentReviewSchema,
  INCOME_CERTIFICATE_VALIDITY_YEARS,
  incomeCertificateExpiry,
  incomeCertificateValid,
  AP_SEVA_PORTAL_URL,
  formatAadhaar,
  maskAadhaar,
  REVIEW_OUTCOME_LABELS,
  REVIEW_OUTCOMES,
  type DocumentDTO,
  type DocumentReviewDTO,
  type EnrolmentCheckDTO,
  type InstitutionCheckDTO,
  type ReviewOutcome,
  type VerificationCheck,
  type VerificationDetailDTO,
} from '@edubridge/shared';
import { DocumentStatusBadge } from '@/components/application/status';
import { VaultVerificationSummary } from '@/components/application/VaultVerification';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatBytes, formatDate, openDocument } from '@/lib/student';
import { cn } from '@/lib/utils';
import { verificationApi } from '@/lib/verification';

/* ------------------------------------------------------------ Pieces */

export function ChecksTable({ checks }: { checks: VerificationCheck[] }) {
  if (!checks.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="border-b border-border bg-sunken/60 text-left text-[13px] text-muted-foreground">
            <th className="px-3.5 py-2 font-medium">Check</th>
            <th className="px-3.5 py-2 font-medium">Application</th>
            <th className="px-3.5 py-2 font-medium">Official source</th>
            <th className="w-10 px-3.5 py-2" />
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.field} className="border-b border-border last:border-0">
              <td className="px-3.5 py-2.5 text-muted-foreground">{c.field}</td>
              <td className="px-3.5 py-2.5">{c.application ?? <span className="text-subtle">—</span>}</td>
              <td className={cn('px-3.5 py-2.5', !c.match && 'font-medium text-warning')}>{c.document}</td>
              <td className="px-3.5 py-2.5">
                {c.match ? <Check className="size-4 text-success" aria-label="Matches" /> : <X className="size-4 text-warning" aria-label="Does not match" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewRecord({ review }: { review: DocumentReviewDTO }) {
  return (
    <div className="space-y-3 rounded-lg bg-sunken/50 p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Result recorded: {REVIEW_OUTCOME_LABELS[review.outcome].label}</p>
        <p className="text-[13px] text-subtle">
          {review.by.name} · {formatDate(review.at, true)}
        </p>
      </div>
      <ChecksTable checks={review.checks} />
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{review.note}</p>
    </div>
  );
}

function OutcomePicker({ value, onChange, error }: { value?: ReviewOutcome; onChange: (v: ReviewOutcome) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Result</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {REVIEW_OUTCOMES.map((o) => (
          <label
            key={o}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border px-3.5 py-3 transition-colors',
              value === o ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong',
            )}
          >
            <input type="radio" name="outcome" className="mt-1 accent-[var(--primary)]" checked={value === o} onChange={() => onChange(o)} />
            <span>
              <span className="block text-sm font-medium">{REVIEW_OUTCOME_LABELS[o].label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{REVIEW_OUTCOME_LABELS[o].help}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </fieldset>
  );
}

function CopyValue({ value, copyText }: { value: string; copyText?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText ?? value);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy. Please select the number instead.');
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-sunken px-2 py-0.5 font-mono text-[13px] ring-1 ring-border">
      {value}
      <button type="button" onClick={copy} className="cursor-pointer text-subtle hover:text-foreground" aria-label="Copy">
        <Copy className="size-3.5" />
      </button>
    </span>
  );
}

/** Masked by default. Revealing fetches the number from the server (audited) and hides it again after a minute. */
function AadhaarValue({ applicationId, doc }: { applicationId: string; doc: DocumentDTO }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!doc.aadhaarLast4) return <span className="text-subtle">(not provided)</span>;

  const reveal = async () => {
    setBusy(true);
    try {
      const n = await verificationApi.revealAadhaar(applicationId, doc.id);
      setValue(n);
      setTimeout(() => setValue(null), 60_000);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return value ? (
    <CopyValue value={formatAadhaar(value)} copyText={value} />
  ) : (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[13px]">{maskAadhaar(doc.aadhaarLast4)}</span>
      <button
        type="button"
        onClick={reveal}
        disabled={busy}
        className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-primary-ink hover:underline disabled:opacity-50"
      >
        <Eye className="size-3.5" /> Show
      </button>
    </span>
  );
}

const ENROLMENT_TONE: Record<EnrolmentCheckDTO['result'], { icon: typeof CircleCheck; cls: string; title: string }> = {
  ENROLLED: { icon: CircleCheck, cls: 'text-success', title: 'Enrolled at the college' },
  NOT_ENROLLED: { icon: CircleAlert, cls: 'text-warning', title: 'Not found in the college’s records' },
  INSTITUTION_NOT_REGISTERED: { icon: CircleHelp, cls: 'text-subtle', title: 'College not on EduVault' },
  UNAVAILABLE: { icon: CircleAlert, cls: 'text-warning', title: 'EduVault unavailable' },
};

/** Result of looking up the roll number in the college's EduVault enrolment records. */
function EnrolmentResult({
  check,
  status,
  canRecheck,
  applicationId,
  onSaved,
}: {
  check?: EnrolmentCheckDTO;
  status: DocumentDTO['status'];
  canRecheck: boolean;
  applicationId: string;
  onSaved: (d: VerificationDetailDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    setBusy(true);
    try {
      onSaved(await verificationApi.recheckEnrolment(applicationId));
      toast.success('Enrolment checked');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const button = canRecheck && (
    <Button size="sm" variant="ghost" loading={busy} onClick={recheck}>
      <RefreshCw /> {check ? 'Check again' : 'Check enrolment'}
    </Button>
  );

  if (!check)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken/50 px-4 py-3 ring-1 ring-border">
        <p className="text-sm text-muted-foreground">Enrolment has not been checked against EduVault yet.</p>
        {button}
      </div>
    );

  const t = ENROLMENT_TONE[check.result];
  const automatic = check.result === 'ENROLLED' && status === 'VERIFIED';
  return (
    <div className="space-y-3 rounded-lg bg-sunken/50 p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex gap-2.5">
          <t.icon className={cn('mt-0.5 size-5 shrink-0', t.cls)} />
          <div>
            <p className="text-sm font-medium">
              {t.title}
              {check.institution && <span className="font-normal text-subtle"> · {check.institution.name} ({check.institution.code})</span>}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{check.summary}</p>
          </div>
        </div>
        {!automatic && button}
      </div>
      {check.record && (
        <p className="text-[13px] text-muted-foreground">
          College record: <span className="text-foreground">{check.record.fullName}</span> · {check.record.programme} · admitted {check.record.admissionYear}
        </p>
      )}
      <ChecksTable checks={check.checks} />
      <p className="text-[13px] text-subtle">
        Checked {formatDate(check.checkedAt, true)}
        {automatic && ' · Verified automatically. No call to the college is needed.'}
      </p>
    </div>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-subtle">{children}</ol>;
}

/* -------------------------------------------------------------- Form */

type Values = Record<string, string>;

/** Shows "Valid until ..." or "Expired on ..." as soon as an issue date is entered. */
function validityHint(issueDate?: string) {
  if (!issueDate || Number.isNaN(new Date(issueDate).getTime())) return undefined;
  if (new Date(issueDate) > new Date()) return 'This date is in the future';
  const until = formatDate(incomeCertificateExpiry(issueDate).toISOString());
  return incomeCertificateValid(issueDate) ? `Valid until ${until}` : `Expired on ${until}`;
}

function toPayload(type: DocumentDTO['type'], v: Values) {
  const num = (s?: string) => (s === undefined || s.trim() === '' ? undefined : Number(s.replace(/,/g, '')));
  const base = { type, outcome: v.outcome, note: v.note ?? '' };
  switch (type) {
    case 'INCOME_CERTIFICATE':
      return { ...base, portalCertificateNumber: v.portalCertificateNumber, holderName: v.holderName, annualIncome: num(v.annualIncome), issueDate: v.issueDate };
    case 'COLLEGE_ID':
      return {
        ...base,
        contactMethod: v.contactMethod || undefined,
        contactedAt: v.contactedAt,
        confirmedBy: v.confirmedBy,
        enrolmentConfirmed: v.enrolmentConfirmed === '' || v.enrolmentConfirmed === undefined ? undefined : v.enrolmentConfirmed === 'yes',
        nameOnCard: v.nameOnCard,
      };
    default:
      return { ...base, nameOnDocument: v.nameOnDocument, percentage: num(v.percentage) };
  }
}

function initialValues(review?: DocumentReviewDTO): Values {
  if (!review) return {};
  const out: Values = { outcome: review.outcome, note: review.note };
  for (const [k, v] of Object.entries(review.recorded)) {
    out[k] = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
  }
  return out;
}

function ReviewForm({
  applicationId,
  doc,
  institution,
  onSaved,
  onCancel,
}: {
  applicationId: string;
  doc: DocumentDTO;
  institution: InstitutionCheckDTO;
  onSaved: (d: VerificationDetailDTO) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(doc.review));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const text = (k: string, label: string, props: Partial<Parameters<typeof Input>[0]> & { hint?: string } = {}) => {
    const { hint, ...rest } = props;
    return (
      <Field label={label} htmlFor={`${doc.id}-${k}`} error={errors[k]} hint={hint}>
        <Input id={`${doc.id}-${k}`} value={values[k] ?? ''} invalid={!!errors[k]} onChange={(e) => set(k)(e.target.value)} {...rest} />
      </Field>
    );
  };

  const save = async () => {
    const payload = toPayload(doc.type, values);
    const parsed = documentReviewSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] ??= issue.message;
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      onSaved(await verificationApi.reviewDocument(applicationId, doc.id, parsed.data));
      toast.success(`${DOCUMENT_TYPE_LABELS[doc.type]}: result saved`);
    } catch (e) {
      const fe = getFieldErrors(e);
      if (fe) setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])));
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border border-border p-4 sm:p-5">
      {doc.type === 'INCOME_CERTIFICATE' && (
        <>
          <Steps>
            <li>
              Open the{' '}
              <a href={AP_SEVA_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline">
                AP Seva portal <ExternalLink className="size-3.5" />
              </a>
              .
            </li>
            <li>
              Enter the student’s Aadhaar number <AadhaarValue applicationId={applicationId} doc={doc} /> in the search box at the top and search.
            </li>
            <li>
              In the list of services, find the income certificate with application number{' '}
              {doc.certificateNumber ? <CopyValue value={doc.certificateNumber} /> : '(not provided)'}, check it is <em>Approved</em>, and open it.
            </li>
            <li>Enter exactly what the certificate shows below. EduBridge compares it with the application.</li>
            <li>An income certificate is valid for {INCOME_CERTIFICATE_VALIDITY_YEARS} years from its date of issue.</li>
          </Steps>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('portalCertificateNumber', 'Application number on the portal')}
            {text('holderName', 'Name on the certificate', { hint: 'Often the student; sometimes a parent' })}
            {text('annualIncome', 'Annual income shown', { prefix: '₹', inputMode: 'numeric' })}
            {text('issueDate', 'Date of issue', { type: 'date', hint: validityHint(values.issueDate) })}
          </div>
        </>
      )}

      {doc.type === 'COLLEGE_ID' && (
        <>
          <Steps>
            {institution.result === 'NOT_FOUND' && <li>Find the office contact on the college’s official website.</li>}
            <li>
              Contact the examination or admissions office and ask them to confirm that roll number{' '}
              {doc.rollNumber ? <CopyValue value={doc.rollNumber} /> : '(not provided)'} is currently enrolled.
            </li>
            <li>Never share the student’s documents with the college. Only confirm the enrolment.</li>
          </Steps>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How the college was contacted" htmlFor={`${doc.id}-contactMethod`} error={errors.contactMethod}>
              <Select id={`${doc.id}-contactMethod`} value={values.contactMethod ?? ''} invalid={!!errors.contactMethod} onChange={(e) => set('contactMethod')(e.target.value)}>
                <option value="">Select</option>
                {CONTACT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {CONTACT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            {text('contactedAt', 'Date contacted', { type: 'date' })}
            {text('confirmedBy', 'Confirmed by', { hint: 'Name and role, e.g. “S. Reddy, exam cell”' })}
            {text('nameOnCard', 'Name on the ID card')}
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium">Did the college confirm current enrolment?</legend>
              <div className="mt-2 flex gap-5">
                {[
                  ['yes', 'Yes, enrolled'],
                  ['no', 'No / not confirmed'],
                ].map(([v, l]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name={`${doc.id}-enrol`} className="accent-[var(--primary)]" checked={values.enrolmentConfirmed === v} onChange={() => set('enrolmentConfirmed')(v)} />
                    {l}
                  </label>
                ))}
              </div>
              {errors.enrolmentConfirmed && <p className="mt-1.5 text-[13px] text-danger">{errors.enrolmentConfirmed}</p>}
            </fieldset>
          </div>
        </>
      )}

      {doc.type === 'MARKSHEET' && (
        <>
          <Steps>
            <li>Open the uploaded marksheet and check it looks genuine: institution name, seal and signature, no visible edits.</li>
            <li>Enter the name and percentage printed on it. If in doubt, mark it for admin review.</li>
          </Steps>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('nameOnDocument', 'Name on the marksheet')}
            {text('percentage', 'Percentage / CGPA as percentage', { inputMode: 'decimal' })}
          </div>
        </>
      )}

      <OutcomePicker value={values.outcome as ReviewOutcome | undefined} onChange={set('outcome')} error={errors.outcome} />
      <Field label="Note" htmlFor={`${doc.id}-note`} error={errors.note} hint="What you checked and anything an administrator should know. Kept in the audit trail.">
        <Textarea id={`${doc.id}-note`} value={values.note ?? ''} invalid={!!errors.note} onChange={(e) => set('note')(e.target.value)} className="min-h-20" />
      </Field>
      <div className="flex gap-2">
        <Button onClick={save} loading={busy}>
          Save result
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Panel */

export function DocumentReviewPanel({
  detail,
  doc,
  onSaved,
}: {
  detail: VerificationDetailDTO;
  doc: DocumentDTO;
  onSaved: (d: VerificationDetailDTO) => void;
}) {
  const [editing, setEditing] = useState(false);
  const signatureVerified = doc.source === 'EDUVAULT' && doc.status === 'VERIFIED';
  const isCollegeId = doc.type === 'COLLEGE_ID';
  const enrolmentVerified = isCollegeId && doc.status === 'VERIFIED' && doc.enrolmentCheck?.result === 'ENROLLED';
  const canRecord = detail.canEdit && !signatureVerified && !enrolmentVerified;
  // A college ID is checked automatically first; contacting the college is the fallback.
  const automaticResultShown = isCollegeId && !!doc.enrolmentCheck && doc.enrolmentCheck.result !== 'INSTITUTION_NOT_REGISTERED';
  const showForm = canRecord && (editing || (!doc.review && !automaticResultShown));

  const view = async () => {
    try {
      await openDocument(doc.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const meta = [
    doc.source === 'EDUVAULT' ? 'Shared from EduVault' : `${formatBytes(doc.size)} · uploaded ${formatDate(doc.uploadedAt)}`,
    doc.certificateNumber && `Certificate no. ${doc.certificateNumber}`,
    doc.rollNumber && `Roll no. ${doc.rollNumber}`,
    doc.aadhaarLast4 && `Aadhaar ${maskAadhaar(doc.aadhaarLast4)}`,
  ].filter(Boolean);

  return (
    <section className="rounded-xl border border-border" id={`doc-${doc.type}`}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-subtle ring-1 ring-border">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{DOCUMENT_TYPE_LABELS[doc.type]}</p>
            <p className="text-[13px] text-subtle">{meta.join(' · ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DocumentStatusBadge status={doc.status} />
          {doc.source !== 'EDUVAULT' && (
            <Button size="sm" variant="secondary" onClick={view}>
              View
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4 border-t border-border px-5 py-4">
        {doc.source === 'EDUVAULT' && doc.verification && (
          <VaultVerificationSummary status={doc.status} verification={doc.verification} documentId={doc.id} />
        )}
        {isCollegeId && (
          <EnrolmentResult
            check={doc.enrolmentCheck}
            status={doc.status}
            canRecheck={detail.canEdit && !enrolmentVerified}
            applicationId={detail.application.id}
            onSaved={onSaved}
          />
        )}
        {signatureVerified && (
          <p className="text-[13px] text-muted-foreground">Verified by the issuing institution’s digital signature. No manual check is needed.</p>
        )}
        {doc.review && !showForm && <ReviewRecord review={doc.review} />}
        {canRecord && !showForm && (doc.review || automaticResultShown) && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {doc.review ? 'Change result' : 'Confirm with the college instead'}
          </Button>
        )}
        {showForm && (
          <ReviewForm
            applicationId={detail.application.id}
            doc={doc}
            institution={detail.institutionCheck}
            onCancel={doc.review || automaticResultShown ? () => setEditing(false) : undefined}
            onSaved={(d) => {
              setEditing(false);
              onSaved(d);
            }}
          />
        )}
        {!detail.canEdit && !doc.review && !signatureVerified && !doc.enrolmentCheck && <p className="text-sm text-subtle">No result recorded yet.</p>}
      </div>
    </section>
  );
}
