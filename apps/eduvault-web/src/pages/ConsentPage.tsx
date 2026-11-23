import { Check, Clock, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CONSENT_STATUS_LABELS, SHARED_MARKSHEET_FIELDS } from '@eduvault/shared';
import { Logo, SimulationNotice } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { formatDate, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLoad, vaultApi } from '@/lib/vault';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border px-6 py-5 sm:px-8">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** The screen a student sees when a partner service asks for one of their documents. */
export default function ConsentPage() {
  const { requestId = '' } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useLoad(() => vaultApi.consent(requestId), [requestId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.marksheets.length && !selected) setSelected(data.marksheets[0].id);
  }, [data, selected]);

  const decide = async (kind: 'approve' | 'deny') => {
    setBusy(kind);
    setActionError(null);
    try {
      const url = kind === 'approve' ? await vaultApi.approve(requestId, selected!) : await vaultApi.deny(requestId);
      setLeaving(true);
      window.location.assign(url);
    } catch (e) {
      setActionError(getErrorMessage(e));
      setBusy(null);
    }
  };

  const switchAccount = async () => {
    await logout();
    navigate('/login', { replace: true, state: { from: `/consent/${requestId}` } });
  };

  const r = data?.request;
  const partner = r?.partner.name ?? 'A service';

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Logo to="/dashboard" />
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button size="sm" variant="ghost" onClick={switchAccount}>
              Not you?
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        {loading && !data && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Loading the request…
          </div>
        )}
        {error && <Alert tone="danger" title="This request cannot be opened">{error}</Alert>}

        {user && user.role !== 'STUDENT' && (
          <Alert tone="warning" title="Only students can answer document requests">
            You are signed in as {user.fullName}. Sign in with the student account the request is for.
          </Alert>
        )}

        {r && user?.role === 'STUDENT' && (
          <>
            <p className="text-sm text-muted-foreground">Document request</p>
            <h1 className="mt-1 font-display text-[30px] font-medium leading-tight sm:text-[34px]">
              {partner} would like to see one of your marksheets
            </h1>

            {r.status !== 'PENDING' ? (
              <Card className="mt-8 px-6 py-6 sm:px-8">
                <p className="font-medium">{CONSENT_STATUS_LABELS[r.status]}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.status === 'EXPIRED'
                    ? 'This request was not answered in time. Start again from the service that asked for it.'
                    : `You answered this request on ${formatDate(r.decidedAt, true)}.`}
                </p>
                {data.returnUrl && (
                  <Button className="mt-5" variant="secondary" onClick={() => window.location.assign(data.returnUrl!)}>
                    Return to {partner}
                  </Button>
                )}
              </Card>
            ) : (
              <Card className="mt-8 overflow-hidden">
                <div className="px-6 py-5 sm:px-8">
                  <p className="font-medium">{partner}</p>
                  <p className="text-sm text-muted-foreground">{r.partner.description} · Registered EduVault partner</p>
                </div>

                <Section title="Why it is needed">
                  <p className="leading-relaxed">{r.purpose}</p>
                  {r.reference && <p className="mt-1 text-sm text-muted-foreground">Reference: {r.reference}</p>}
                </Section>

                <Section title="Choose the marksheet to share">
                  {data.marksheets.length === 0 ? (
                    <p className="text-[15px] text-muted-foreground">
                      You have no issued marksheets yet. Ask your institution to issue your latest marksheet on EduVault, or decline and
                      upload a copy on {partner} instead.
                    </p>
                  ) : (
                    <div className="space-y-2" role="radiogroup" aria-label="Marksheet">
                      {data.marksheets.map((m) => {
                        const active = selected === m.id;
                        return (
                          <label
                            key={m.id}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
                              active ? 'border-primary bg-primary-soft/50' : 'border-border-strong hover:border-subtle',
                            )}
                          >
                            <input
                              type="radio"
                              name="marksheet"
                              checked={active}
                              onChange={() => setSelected(m.id)}
                              className="mt-1 size-4 cursor-pointer accent-[var(--primary)]"
                            />
                            <span className="min-w-0">
                              <span className="block text-[15px] font-medium">
                                Semester {m.semester} · {m.examSession}
                              </span>
                              <span className="block text-[13px] text-muted-foreground">
                                {m.institution.name} · {m.result === 'PASS' ? 'Pass' : 'Fail'}{typeof m.percentage === 'number' ? ` · ${pct(m.percentage)}` : ''} · {m.documentId}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Section>

                <Section title={`What ${partner} will receive`}>
                  <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {SHARED_MARKSHEET_FIELDS.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[15px]">
                        <Check className="mt-1 size-3.5 shrink-0 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted-foreground">Your email, password and other documents are not shared.</p>
                </Section>

                <Section title="How sharing works">
                  <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <li className="flex gap-2.5">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-subtle" />
                      If you allow, EduVault creates a one-time reference that {partner} can use once, within 10 minutes, to collect this
                      marksheet.
                    </li>
                    <li className="flex gap-2.5">
                      <FileText className="mt-0.5 size-4 shrink-0 text-subtle" />
                      The decision is recorded with a consent reference in your sharing history.
                    </li>
                    <li className="flex gap-2.5">
                      <Clock className="mt-0.5 size-4 shrink-0 text-subtle" />
                      This request expires on {formatDate(r.expiresAt, true)}.
                    </li>
                  </ul>
                </Section>

                <div className="flex flex-col-reverse gap-2 border-t border-border bg-sunken/50 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
                  <Button variant="secondary" loading={busy === 'deny'} disabled={!!busy || leaving} onClick={() => decide('deny')}>
                    Decline
                  </Button>
                  <Button loading={busy === 'approve'} disabled={!selected || !!busy || leaving} onClick={() => decide('approve')}>
                    Allow {partner} to see this marksheet
                  </Button>
                </div>
              </Card>
            )}

            {actionError && (
              <Alert tone="danger" className="mt-4">
                {actionError}
              </Alert>
            )}
            {leaving && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Returning you to {partner}…
              </p>
            )}
          </>
        )}

        <SimulationNotice className="mt-14" />
      </main>
    </div>
  );
}
