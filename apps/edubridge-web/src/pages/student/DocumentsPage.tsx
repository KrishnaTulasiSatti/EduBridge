import { FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DOCUMENT_TYPES } from '@edubridge/shared';
import { DocumentCard } from '@/components/application/DocumentCard';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useStudentData } from '@/lib/student';

export default function DocumentsPage() {
  const { profile, application, setApplication, loading, error } = useStudentData();

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );

  const editable = application?.status === 'DRAFT';

  return (
    <>
      <PageHeader
        title="Documents"
        description="These documents are used to verify your application. They are stored privately and are visible only to you and the reviewers."
      />
      {!application ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="No application yet"
            text="Start your application to upload documents."
            action={
              <Link to="/dashboard/application" className={buttonVariants({ variant: 'secondary' })}>
                Go to application
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {!editable && (
            <Alert tone="info">Documents cannot be changed after your application is submitted. Their verification status is shown below.</Alert>
          )}
          {DOCUMENT_TYPES.map((t) => (
            <div key={t} className="rounded-xl bg-surface shadow-card">
              <DocumentCard
                type={t}
                doc={application.documents.find((d) => d.type === t)}
                editable={editable}
                defaultRollNumber={profile?.education.rollNumber}
                onChange={setApplication}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
