import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DOCUMENT_TYPE_LABELS, currentAcademicYear, requiredDocumentTypes } from '@edubridge/shared';
import { ApplicationStatusBadge, DocumentStatusBadge } from '@/components/application/status';
import { OutcomeNotice } from '@/components/application/OutcomeNotice';
import { StatusTracker } from '@/components/application/StatusTracker';
import { DefinitionList, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { formatDate, sectionCompletion, studentApi, useStudentData, type SectionId } from '@/lib/student';
import { cn, formatINR, greeting } from '@/lib/utils';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'personal', label: 'Personal details' },
  { id: 'education', label: 'Education' },
  { id: 'family', label: 'Family and income' },
  { id: 'support', label: 'Support needed' },
  { id: 'documents', label: 'Documents' },
];

export default function StudentHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { profile, application, loading, error } = useStudentData();
  const [starting, setStarting] = useState(false);
  const first = user!.fullName.split(' ')[0];

  const start = async () => {
    setStarting(true);
    try {
      await studentApi.start();
      navigate('/dashboard/application');
    } catch (e) {
      toast.error(getErrorMessage(e));
      setStarting(false);
    }
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !profile)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-56" />
      </div>
    );

  /* No application yet */
  if (!application) {
    const year = currentAcademicYear().replace('-', '–');
    return (
      <>
        <PageHeader title={`${greeting()}, ${first}`} description="Here you can apply for support and follow your application." />
        <Card>
          <CardBody className="grid gap-8 py-8 md:grid-cols-[1.2fr_1fr] md:gap-12 sm:px-8">
            <div>
              <h2 className="font-display text-[26px] font-medium leading-tight">Apply for the {year} academic year</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                The application has six short steps and usually takes about fifteen minutes.
              </p>
              <Button size="lg" className="mt-7" loading={starting} onClick={start}>
                Start application
              </Button>
            </div>
            <div className="rounded-lg bg-sunken/70 p-5 ring-1 ring-border">
              <p className="text-sm font-semibold">Keep these ready</p>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li>Your latest marksheet</li>
                <li>Family income certificate and its certificate number</li>
                <li>College ID card and your roll number</li>
                <li>This year’s fee and expense details</li>
              </ul>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  /* Draft in progress */
  if (application.status === 'DRAFT') {
    const done = sectionCompletion(profile, application);
    const count = SECTIONS.filter((s) => done[s.id]).length;
    const nextStep = SECTIONS.find((s) => !done[s.id])?.id ?? 'review';
    return (
      <>
        <PageHeader title={`${greeting()}, ${first}`} description="Your application is saved as a draft." />
        <Card>
          <CardHeader
            title="Continue your application"
            description={`Started ${formatDate(application.createdAt)}`}
            action={<ApplicationStatusBadge status={application.status} />}
          />
          <CardBody>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {count} of {SECTIONS.length} sections complete
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken ring-1 ring-border">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500 animate-bar" style={{ width: `${(count / SECTIONS.length) * 100}%` }} />
            </div>
            <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <li key={s.id} className="flex items-center gap-3 text-[15px]">
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-full',
                      done[s.id] ? 'bg-primary text-primary-foreground' : 'ring-1 ring-border-strong',
                    )}
                  >
                    {done[s.id] && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={done[s.id] ? '' : 'text-muted-foreground'}>{s.label}</span>
                </li>
              ))}
            </ul>
            <Link to={`/dashboard/application?step=${nextStep}`} className={cn(buttonVariants(), 'mt-7')}>
              {count === SECTIONS.length ? 'Review and submit' : 'Continue'}
            </Link>
          </CardBody>
        </Card>
      </>
    );
  }

  /* Submitted */
  return (
    <>
      <PageHeader title={`${greeting()}, ${first}`} description="Here is where your application stands." />
      <OutcomeNotice application={application} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Application progress" action={<ApplicationStatusBadge status={application.status} />} />
          <CardBody>
            <StatusTracker application={application} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" action={<Link to="/dashboard/application" className="text-sm text-primary-ink hover:underline">View</Link>} />
            <CardBody>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  ['Submitted', formatDate(application.submittedAt, true)],
                  ['Amount requested', application.support.requestedAmount ? formatINR(application.support.requestedAmount) : undefined],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <CardBody className="space-y-3">
              {requiredDocumentTypes(application.submittedAt).map((t) => {
                const d = application.documents.find((x) => x.type === t);
                return (
                  <div key={t} className="flex items-center justify-between gap-3 text-[15px]">
                    <span className="text-muted-foreground">{DOCUMENT_TYPE_LABELS[t]}</span>
                    {d && <DocumentStatusBadge status={d.status} />}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
