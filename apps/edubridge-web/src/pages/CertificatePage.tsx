import { ArrowLeft, CheckCircle2, Printer, XCircle } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EDUCATION_LEVEL_LABELS, type CertificateDTO } from '@edubridge/shared';
import { Logo } from '@/components/brand/Logo';
import { Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/student';
import { certificateApi, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

function Body({ c }: { c: CertificateDTO }) {
  const course = [c.course, c.level && EDUCATION_LEVEL_LABELS[c.level]].filter(Boolean).join(', ');
  if (c.kind === 'STUDENT_AWARD') {
    return (
      <>
        <p className="text-[13px] uppercase tracking-[0.18em] text-muted-foreground">Certificate of sponsorship award</p>
        <p className="mt-8 text-[15px] text-muted-foreground">This certifies that</p>
        <p className="mt-2 font-display text-[34px] font-medium leading-tight">{c.studentName}</p>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          {course ? `a ${course} student, ` : ''}has received educational sponsorship of
        </p>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{formatINR(c.amount)}</p>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          from <span className="text-foreground">{c.sponsorName}</span> for the {c.academicYear} academic year through EduBridge.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="text-[13px] uppercase tracking-[0.18em] text-muted-foreground">Certificate of appreciation</p>
      <p className="mt-8 text-[15px] text-muted-foreground">With gratitude to</p>
      <p className="mt-2 font-display text-[34px] font-medium leading-tight">{c.sponsorName}</p>
      <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">for sponsoring the education of a student in need with a contribution of</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{formatINR(c.amount)}</p>
      <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        towards the {c.academicYear} academic year{course ? ` of a ${course} student` : ''} ({c.studentAlias}), verified and administered by EduBridge.
      </p>
    </>
  );
}

export default function CertificatePage() {
  const { number = '' } = useParams();
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const { user } = useAuth();
  const { data: c, error } = useLoad(() => certificateApi.verify(number, code), [number, code]);
  const ok = c && c.status === 'VALID' && c.signature.valid;

  return (
    <div className="min-h-screen bg-background px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          {user ? (
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Dashboard
            </Link>
          ) : (
            <Logo />
          )}
          {c && (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer /> Print or save as PDF
            </Button>
          )}
        </div>

        {error && <Alert tone="danger" title="Certificate not found">Check the certificate number and verification code printed on it.</Alert>}
        {!c && !error && <Skeleton className="h-[520px]" />}

        {c && (
          <>
            <div
              className={cn(
                'mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm print:hidden',
                ok ? 'border-success/25 bg-success-soft text-success' : 'border-danger/25 bg-danger-soft text-danger',
              )}
            >
              {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
              <div>
                <p className="font-medium">
                  {ok ? 'Genuine certificate issued by EduBridge' : c.status === 'REVOKED' ? `This certificate was revoked on ${formatDate(c.revokedAt)}` : 'The signature on this certificate does not match'}
                </p>
                <p className="mt-0.5 text-foreground/75">
                  {c.signature.valid
                    ? 'Its contents match EduBridge’s digital signature (Ed25519) and have not been changed since it was issued.'
                    : 'Its contents differ from what EduBridge signed. Do not rely on it.'}
                </p>
              </div>
            </div>

            <article className="relative rounded-xl border border-border bg-surface px-8 py-14 text-center shadow-card print:rounded-none print:border-2 print:shadow-none sm:px-16">
              <div className="pointer-events-none absolute inset-3 rounded-lg border border-border print:inset-2" aria-hidden />
              <div className="relative">
                <div className="flex justify-center">
                  <Logo />
                </div>
                <div className="mt-10">
                  <Body c={c} />
                </div>
                {c.status === 'REVOKED' && <p className="mt-6 text-sm font-medium uppercase tracking-wider text-danger">Revoked</p>}
                <div className="mt-12 grid gap-6 border-t border-border pt-6 text-left text-[13px] sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">Certificate number</p>
                    <p className="mt-0.5 font-mono text-foreground">{c.number}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Issued</p>
                    <p className="mt-0.5 text-foreground">{formatDate(c.issuedAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Verification code</p>
                    <p className="mt-0.5 font-mono text-foreground">{code.toUpperCase()}</p>
                  </div>
                </div>
                <p className="mt-6 text-left text-[12px] leading-relaxed text-subtle">
                  Sponsorship {c.sponsorshipReference}. Verify at {window.location.origin}/certificates/{c.number} with the code above. Signed with key {c.signature.keyId}; SHA-256{' '}
                  <span className="break-all font-mono">{c.signature.hash}</span>.
                </p>
              </div>
            </article>
          </>
        )}
      </div>
    </div>
  );
}
