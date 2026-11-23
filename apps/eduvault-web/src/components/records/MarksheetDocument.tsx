import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MARKSHEET_RESULT_LABELS, MARKSHEET_STATUS_LABELS, type MarksheetDTO, type MarksheetStatus } from '@eduvault/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api';
import { formatBytes, formatDate, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fetchMarksheetPdf } from '@/lib/vault';

const statusTone: Record<MarksheetStatus, BadgeTone> = { DRAFT: 'neutral', ISSUED: 'success', REVOKED: 'danger' };

export function MarksheetStatusBadge({ status }: { status: MarksheetStatus }) {
  return <Badge tone={statusTone[status]}>{MARKSHEET_STATUS_LABELS[status]}</Badge>;
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[12px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 text-[15px]">{value}</dd>
    </div>
  );
}

/** Shows a private PDF inline. It is fetched with the user's token and shown from a temporary local URL. */
export function PdfViewer({ id, as, name, version }: { id: string; as: 'issuer' | 'student'; name: string; version?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    fetchMarksheetPdf(id, as)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => !cancelled && setError(getErrorMessage(e, 'Could not load the PDF')));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, as, version]);

  if (error) return <p className="px-6 py-10 text-center text-sm text-danger">{error}</p>;
  if (!url)
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading PDF…
      </div>
    );
  return (
    <div>
      <div className="no-print flex flex-wrap justify-end gap-2 border-b border-border px-4 py-2">
        <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ExternalLink /> Open in new tab
        </a>
        <a href={url} download={name} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <Download /> Download
        </a>
      </div>
      <iframe src={url} title={`Marksheet PDF ${name}`} className="h-[75vh] min-h-[520px] w-full bg-sunken" />
    </div>
  );
}

/** A marksheet: its key details, the uploaded PDF and, once issued, its signature. */
export function MarksheetDocument({ m, as }: { m: MarksheetDTO; as: 'issuer' | 'student' }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-card print:border-0 print:shadow-none">
      <header className="border-b border-border px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-[0.14em] text-subtle">{m.institution.university}</p>
            <h2 className="mt-1 font-display text-[22px] font-medium leading-tight">{m.institution.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="warning">Test record</Badge>
            <MarksheetStatusBadge status={m.status} />
          </div>
        </div>
      </header>

      <dl className="grid gap-x-8 gap-y-4 border-b border-border px-6 py-5 sm:grid-cols-3 sm:px-8">
        <Field label="Student" value={m.studentName} className="sm:col-span-2" />
        <Field label="Roll number" value={m.rollNumber} />
        <Field label="Programme" value={m.programme} className="sm:col-span-2" />
        <Field label="Semester" value={`Semester ${m.semester}`} />
        <Field label="Examination" value={`${m.examSession} · ${m.academicYear}`} className="sm:col-span-2" />
        <div>
          <dt className="text-[12px] uppercase tracking-wide text-subtle">Result</dt>
          <dd className="mt-0.5 text-[15px]">
            <span className={cn('font-medium', m.result === 'PASS' ? 'text-success' : 'text-danger')}>{MARKSHEET_RESULT_LABELS[m.result]}</span>
            {typeof m.percentage === 'number' && <span className="text-muted-foreground"> · {pct(m.percentage)}</span>}
          </dd>
        </div>
      </dl>

      {m.file ? (
        <PdfViewer id={m.id} as={as} name={m.file.name} version={m.file.sha256} />
      ) : (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">No PDF has been uploaded for this marksheet.</p>
      )}

      {m.signature ? (
        <footer className="space-y-3 border-t border-border bg-sunken/50 px-6 py-5 sm:px-8 print:bg-transparent">
          <p className="text-[13px] font-medium">
            Digitally signed by {m.institution.name} on {formatDate(m.issuedAt)}
          </p>
          <dl className="grid gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-subtle">Document ID</dt>
              <dd className="font-mono">{m.documentId}</dd>
            </div>
            <div>
              <dt className="text-subtle">Signature</dt>
              <dd>Ed25519 over the SHA-256 hash of the record and PDF</dd>
            </div>
            {m.file && (
              <div className="sm:col-span-2">
                <dt className="text-subtle">
                  PDF (SHA-256) · {m.file.name} · {formatBytes(m.file.size)}
                </dt>
                <dd className="break-all font-mono text-[12px]">{m.file.sha256}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-subtle">Signed record (SHA-256)</dt>
              <dd className="break-all font-mono text-[12px]">{m.signature.documentHash}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-subtle">Signing key</dt>
              <dd className="font-mono text-[12px]">
                {m.signature.keyId} · {m.signature.keyFingerprint}
              </dd>
            </div>
          </dl>
          {m.status === 'REVOKED' && (
            <p className="text-[13px] text-danger">
              Revoked on {formatDate(m.revokedAt)}
              {m.revocationReason ? ` — ${m.revocationReason}` : ''}. This marksheet can no longer be shared.
            </p>
          )}
        </footer>
      ) : (
        <footer className="border-t border-border bg-sunken/50 px-6 py-4 text-[13px] text-muted-foreground sm:px-8">
          Draft — not signed. Students cannot see this marksheet until it is issued.
          {m.file && ` Uploaded file: ${m.file.name} (${formatBytes(m.file.size)}).`}
        </footer>
      )}
    </article>
  );
}
