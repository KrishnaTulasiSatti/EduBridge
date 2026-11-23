import { Check, ChevronDown, FileText, Minus, ShieldAlert, ShieldCheck, ShieldX, X } from 'lucide-react';
import { toast } from 'sonner';
import { useState, type ReactNode } from 'react';
import type { DocumentStatus, DocumentVerificationDTO } from '@edubridge/shared';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDate, openDocument } from '@/lib/student';
import { cn } from '@/lib/utils';

const tone: Record<string, { icon: typeof ShieldCheck; cls: string }> = {
  VERIFIED: { icon: ShieldCheck, cls: 'text-success' },
  REVIEW_REQUIRED: { icon: ShieldAlert, cls: 'text-warning' },
  SERVICE_UNAVAILABLE: { icon: ShieldAlert, cls: 'text-warning' },
  REJECTED: { icon: ShieldX, cls: 'text-danger' },
};

export function VaultStatusIcon({ status, className }: { status: DocumentStatus; className?: string }) {
  const t = tone[status] ?? tone.REVIEW_REQUIRED;
  return <t.icon className={cn('size-5 shrink-0', t.cls, className)} aria-hidden />;
}

/** One-line description of an imported marksheet, e.g. "Semester 5 · November 2025 · Pass · 81.50%". */
export function marksheetLine(v: DocumentVerificationDTO) {
  const m = v.marksheet;
  const parts = [`Semester ${m.semester}`, m.examSession, m.result === 'PASS' ? 'Pass' : 'Fail'];
  if (typeof m.percentage === 'number') parts.push(`${m.percentage.toFixed(2)}%`);
  return parts.join(' · ');
}

/** Opens the signed marksheet PDF that was received from EduVault. */
export function ViewPdfButton({ documentId, className }: { documentId: string; className?: string }) {
  const view = async () => {
    try {
      await openDocument(documentId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Button size="sm" variant="secondary" className={className} onClick={view}>
      <FileText /> View marksheet PDF
    </Button>
  );
}

function CheckMark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Minus className="size-4 text-subtle" aria-label="Not checked" />;
  return ok ? <Check className="size-4 text-success" aria-label="Matches" /> : <X className="size-4 text-danger" aria-label="Does not match" />;
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-sm', mono && 'font-mono text-[12.5px]')}>{value}</dd>
    </div>
  );
}

/** Full breakdown of what was checked: details comparison, signature and the marksheet itself. */
export function VaultVerificationDetails({ verification: v, documentId }: { verification: DocumentVerificationDTO; documentId?: string }) {
  const m = v.marksheet;
  return (
    <div className="space-y-6">
      {documentId && <ViewPdfButton documentId={documentId} />}
      <section>
        <h4 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">Compared with your application</h4>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-sunken/60 text-left text-[13px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Detail</th>
                <th className="px-3 py-2 font-medium">Your application</th>
                <th className="px-3 py-2 font-medium">Marksheet</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {v.checks.map((c) => (
                <tr key={c.field}>
                  <td className="px-3 py-2 text-muted-foreground">{c.field}</td>
                  <td className="px-3 py-2">{c.application || <span className="text-subtle">Not provided</span>}</td>
                  <td className="px-3 py-2">{c.document}</td>
                  <td className="px-3 py-2">
                    <CheckMark ok={c.match} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">Digital signature</h4>
        <dl className="mt-1 divide-y divide-border">
          <Row
            label="Signature"
            value={
              <span className="inline-flex items-center gap-1.5">
                <CheckMark ok={v.signatureValid && v.hashMatches} />
                {v.signatureValid && v.hashMatches ? 'Valid — the content is exactly as issued' : 'Not valid'}
              </span>
            }
          />
          <Row
            label="Marksheet PDF"
            value={
              <span className="inline-flex items-center gap-1.5">
                <CheckMark ok={v.fileHashMatches} />
                {v.fileHashMatches ? `The exact file that was signed · ${formatBytes(v.marksheet.fileSize)}` : 'Not the file that was signed'}
              </span>
            }
          />
          <Row
            label="Issuer"
            value={
              <span className="inline-flex items-center gap-1.5">
                <CheckMark ok={v.issuerTrusted} />
                {v.issuer.name}
                {!v.issuerTrusted && <span className="text-warning"> (not currently a trusted issuer)</span>}
              </span>
            }
          />
          <Row label="Document ID" value={v.documentId} mono />
          <Row label="Signing key" value={`${v.keyId}${v.keyFingerprint ? ` · ${v.keyFingerprint}` : ''}`} mono />
          <Row label="SHA-256 of signed record" value={v.documentHash} mono />
          <Row label="SHA-256 of PDF" value={v.marksheet.fileSha256} mono />
          <Row label="Consent reference" value={v.consentReference} mono />
          <Row label="Checked on" value={formatDate(v.verifiedAt, true)} />
        </dl>
        <p className="mt-2 text-[13px] leading-relaxed text-subtle">
          A valid signature shows the marksheet was issued by this institution and has not been changed since. It does not by itself
          prove that the marks entered by the institution are correct.
        </p>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">Marksheet</h4>
        <dl className="mt-1 divide-y divide-border">
          <Row label="Student" value={`${m.studentName} · ${m.rollNumber}`} />
          <Row label="Programme" value={m.programme} />
          <Row label="Semester" value={`Semester ${m.semester} · ${m.examSession} · ${m.academicYear}`} />
          <Row label="Result" value={`${m.result === 'PASS' ? 'Pass' : 'Fail'}${typeof m.percentage === 'number' ? ` · ${m.percentage.toFixed(2)}%` : ''}`} />
          <Row label="Issued" value={formatDate(m.issuedAt)} />
        </dl>
        {m.testData && <p className="mt-2 text-[13px] text-subtle">This marksheet is marked as test data by EduVault.</p>}
      </section>
    </div>
  );
}

/** Compact summary with an expandable breakdown, used inside the document card. */
export function VaultVerificationSummary({
  status,
  verification,
  documentId,
}: {
  status: DocumentStatus;
  verification: DocumentVerificationDTO;
  documentId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex gap-3 px-4 py-3">
        <VaultStatusIcon status={status} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Imported from EduVault · {verification.issuer.name}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{marksheetLine(verification)}</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/85">{verification.summary}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
        <ViewPdfButton documentId={documentId} className="border-0 bg-transparent hover:bg-sunken" />
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          {open ? 'Hide verification details' : 'Show verification details'}
        </Button>
      </div>
      {open && (
        <div className="border-t border-border px-4 py-4">
          <VaultVerificationDetails verification={verification} />
        </div>
      )}
    </div>
  );
}
