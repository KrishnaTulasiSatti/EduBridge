import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DOCUMENT_TYPES, type ApplicationDTO, type StudentProfileDTO } from '@edubridge/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { sectionCompletion, studentApi, type SectionId } from '@/lib/student';
import { cn } from '@/lib/utils';
import { ApplicationSummary } from './ApplicationSummary';
import { DocumentCard } from './DocumentCard';
import { EducationSection, FamilySection, PersonalSection, SupportSection, type ShellRender } from './sections';
import { StepShell } from './StepShell';

const STEPS = [
  { id: 'personal', title: 'Personal details', description: 'Your date of birth and home address.' },
  { id: 'education', title: 'Education', description: 'Where and what you are currently studying.' },
  { id: 'family', title: 'Family and income', description: 'Your household and its annual income.' },
  { id: 'support', title: 'Support needed', description: 'Your education costs and the amount you are requesting.' },
  { id: 'documents', title: 'Documents', description: 'Upload the three documents used to verify your application.' },
  { id: 'review', title: 'Review and submit', description: 'Check your answers. You cannot edit the application after submitting.' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const SECTION_LABEL: Record<string, string> = {
  personal: 'Personal details',
  education: 'Education',
  family: 'Family and income',
  support: 'Support needed',
  documents: 'Documents',
};

export function ApplicationWizard({
  profile,
  application,
  onProfile,
  onApplication,
}: {
  profile: StudentProfileDTO;
  application: ApplicationDTO;
  onProfile: (p: StudentProfileDTO) => void;
  onApplication: (a: ApplicationDTO) => void;
}) {
  const [params, setParams] = useSearchParams();
  const stepId = (STEPS.find((s) => s.id === params.get('step'))?.id ?? 'personal') as StepId;
  const index = STEPS.findIndex((s) => s.id === stepId);
  const step = STEPS[index];
  const completion = sectionCompletion(profile, application);

  const go = useCallback(
    (id: StepId) => {
      setParams({ step: id }, { replace: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setParams],
  );
  const next = () => index < STEPS.length - 1 && go(STEPS[index + 1].id);
  const back = index > 0 ? () => go(STEPS[index - 1].id) : undefined;

  const shell: ShellRender = ({ children, onSubmit, saveState, busy }) => (
    <StepShell
      step={index + 1}
      total={STEPS.length}
      title={step.title}
      description={step.description}
      saveState={saveState}
      onSubmit={onSubmit}
      onBack={back}
      busy={busy}
    >
      {children}
    </StepShell>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Application steps" className="lg:sticky lg:top-8 lg:self-start">
        <ol className="flex gap-1 overflow-x-auto pb-1 scrollbar-soft lg:flex-col lg:overflow-visible">
          {STEPS.map((s, i) => {
            const done = s.id !== 'review' && completion[s.id as SectionId];
            const active = s.id === stepId;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] transition-colors',
                    active ? 'bg-surface font-medium text-foreground shadow-card ring-1 ring-border' : 'text-muted-foreground hover:bg-sunken hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-[12px]',
                      done ? 'bg-primary text-primary-foreground' : active ? 'ring-1 ring-primary text-primary-ink' : 'ring-1 ring-border-strong text-subtle',
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        {stepId === 'personal' && <PersonalSection key="personal" profile={profile} onSaved={onProfile} onDone={next} shell={shell} />}
        {stepId === 'education' && <EducationSection key="education" profile={profile} onSaved={onProfile} onDone={next} shell={shell} />}
        {stepId === 'family' && <FamilySection key="family" application={application} onSaved={onApplication} onDone={next} shell={shell} />}
        {stepId === 'support' && <SupportSection key="support" application={application} onSaved={onApplication} onDone={next} shell={shell} />}
        {stepId === 'documents' && (
          <StepShell
            step={index + 1}
            total={STEPS.length}
            title={step.title}
            description={step.description}
            onBack={back}
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
            continueLabel="Continue"
          >
            <div className="space-y-4">
              {DOCUMENT_TYPES.map((t) => (
                <DocumentCard
                  key={t}
                  type={t}
                  doc={application.documents.find((d) => d.type === t)}
                  editable
                  defaultRollNumber={profile.education.rollNumber}
                  onChange={onApplication}
                />
              ))}
            </div>
          </StepShell>
        )}
        {stepId === 'review' && (
          <ReviewStep
            profile={profile}
            application={application}
            completion={completion}
            onEdit={(s) => go(s)}
            onBack={back}
            onSubmitted={onApplication}
            stepNumber={index + 1}
          />
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  profile,
  application,
  completion,
  onEdit,
  onBack,
  onSubmitted,
  stepNumber,
}: {
  profile: StudentProfileDTO;
  application: ApplicationDTO;
  completion: Record<SectionId, boolean>;
  onEdit: (s: SectionId) => void;
  onBack?: () => void;
  onSubmitted: (a: ApplicationDTO) => void;
  stepNumber: number;
}) {
  const [declaration, setDeclaration] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Record<string, string[]> | null>(null);
  const incomplete = (Object.keys(completion) as SectionId[]).filter((k) => !completion[k]);

  useEffect(() => setProblems(null), [application.updatedAt]);

  const submit = async () => {
    setBusy(true);
    setProblems(null);
    try {
      const app = await studentApi.submit();
      onSubmitted(app);
      window.scrollTo({ top: 0 });
      toast.success('Your application has been submitted');
    } catch (e) {
      const details = getFieldErrors(e);
      if (details) setProblems(details);
      else toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      step={stepNumber}
      total={STEPS.length}
      title="Review and submit"
      description="Check your answers. You cannot edit the application after submitting."
      onBack={onBack}
      footer={
        <Button onClick={submit} loading={busy} disabled={incomplete.length > 0 || !declaration || !consent}>
          Submit application
        </Button>
      }
    >
      {incomplete.length > 0 && (
        <Alert tone="warning" title="A few sections still need your attention" className="mb-8">
          <ul className="mt-1 space-y-0.5">
            {incomplete.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => onEdit(s)} className="cursor-pointer underline underline-offset-4">
                  {SECTION_LABEL[s]}
                </button>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {problems && (
        <Alert tone="danger" title="We could not submit your application" className="mb-8">
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {Object.entries(problems).flatMap(([section, msgs]) =>
              msgs.map((m) => (
                <li key={section + m}>
                  {SECTION_LABEL[section] ?? section}: {m}
                </li>
              )),
            )}
          </ul>
        </Alert>
      )}

      <ApplicationSummary profile={profile} application={application} completion={completion} onEdit={onEdit} />

      <section className="mt-6 border-t border-border pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Documents</h3>
          <Button size="sm" variant="ghost" onClick={() => onEdit('documents')}>
            Edit
          </Button>
        </div>
        <ul className="space-y-2 text-[15px]">
          {DOCUMENT_TYPES.map((t) => {
            const d = application.documents.find((x) => x.type === t);
            return (
              <li key={t} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{SECTION_DOC_LABEL[t]}</span>
                {d ? <span className="truncate">{d.source === 'EDUVAULT' ? `Shared from EduVault · ${d.verification?.documentId ?? ''}` : d.originalName}</span> : <span className="text-warning">Not uploaded</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8 space-y-4 rounded-lg bg-sunken/70 p-5 ring-1 ring-border">
        <Checkbox
          id="declaration"
          checked={declaration}
          onChange={(e) => setDeclaration(e.target.checked)}
          label="I declare that the information in this application is true and complete to the best of my knowledge."
          description="Providing false information may lead to your application being rejected."
        />
        <Checkbox
          id="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          label="I consent to EduBridge volunteers and administrators verifying my documents with the issuing authorities and my institution."
        />
      </section>
    </StepShell>
  );
}

const SECTION_DOC_LABEL: Record<string, string> = {
  MARKSHEET: 'Academic marksheet',
  INCOME_CERTIFICATE: 'Income certificate',
  COLLEGE_ID: 'College ID card',
};
