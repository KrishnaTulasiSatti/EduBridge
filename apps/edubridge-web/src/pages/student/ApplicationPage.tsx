import { useState } from 'react';
import { toast } from 'sonner';
import { DOCUMENT_TYPES, currentAcademicYear } from '@edubridge/shared';
import { ApplicationSummary } from '@/components/application/ApplicationSummary';
import { ApplicationWizard } from '@/components/application/ApplicationWizard';
import { DocumentCard } from '@/components/application/DocumentCard';
import { OutcomeNotice } from '@/components/application/OutcomeNotice';
import { ApplicationStatusBadge } from '@/components/application/status';
import { StatusTracker } from '@/components/application/StatusTracker';
import { PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { getErrorMessage } from '@/lib/api';
import { formatDate, studentApi, useStudentData } from '@/lib/student';

export default function ApplicationPage() {
  const { profile, application, setProfile, setApplication, loading, error } = useStudentData();
  const [starting, setStarting] = useState(false);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !profile)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );

  if (!application) {
    const start = async () => {
      setStarting(true);
      try {
        setApplication(await studentApi.start());
      } catch (e) {
        toast.error(getErrorMessage(e));
      } finally {
        setStarting(false);
      }
    };
    return (
      <>
        <PageHeader
          title="Application"
          description={`Apply for educational support for the ${currentAcademicYear().replace('-', '–')} academic year.`}
        />
        <Card>
          <CardBody className="py-8 sm:px-8">
            <h2 className="text-[17px] font-semibold">Before you begin</h2>
            <ul className="mt-4 max-w-2xl space-y-3 text-[15px] leading-relaxed text-muted-foreground">
              <li>You can submit one application for each academic year.</li>
              <li>Your answers are saved automatically, so you can complete it over several visits.</li>
              <li>Once submitted, the application is locked so that reviewers see exactly what you sent.</li>
              <li>Your name, contact details and documents are never shown to sponsors.</li>
            </ul>
            <Button size="lg" className="mt-8" loading={starting} onClick={start}>
              Start application
            </Button>
          </CardBody>
        </Card>
      </>
    );
  }

  const meta = (
    <>
      <span>{application.applicationNumber}</span>
      <span aria-hidden>·</span>
      <ApplicationStatusBadge status={application.status} />
    </>
  );

  if (application.status === 'DRAFT') {
    return (
      <>
        <PageHeader meta={meta} title="Your application" description="Your answers are saved automatically as you type." />
        <ApplicationWizard profile={profile} application={application} onProfile={setProfile} onApplication={setApplication} />
      </>
    );
  }

  const snapshot = application.profileSnapshot ?? profile;
  return (
    <>
      <PageHeader meta={meta} title="Your application" description={`Submitted on ${formatDate(application.submittedAt, true)}.`} />
      <OutcomeNotice application={application} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Submitted details" description="This is the information reviewers will see." />
            <CardBody>
              <ApplicationSummary profile={snapshot} application={application} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <CardBody className="space-y-4">
              {DOCUMENT_TYPES.map((t) => (
                <DocumentCard key={t} type={t} doc={application.documents.find((d) => d.type === t)} editable={false} />
              ))}
            </CardBody>
          </Card>
        </div>
        <Card className="lg:sticky lg:top-8 lg:self-start">
          <CardHeader title="Progress" />
          <CardBody>
            <StatusTracker application={application} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
