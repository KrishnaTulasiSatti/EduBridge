import { toast } from 'sonner';
import { EducationSection, PersonalSection, type ShellRender } from '@/components/application/sections';
import { SaveIndicator } from '@/components/application/StepShell';
import { DefinitionList, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { formatDate, useStudentData } from '@/lib/student';

const shellFor =
  (title: string, description: string): ShellRender =>
  ({ children, onSubmit, saveState, busy }) => (
    <form onSubmit={onSubmit} noValidate className="rounded-xl border border-border bg-surface shadow-card">
      <CardHeader title={title} description={description} action={<SaveIndicator state={saveState} />} />
      <div className="px-5 py-6 sm:px-6">{children}</div>
      <div className="flex justify-end rounded-b-xl border-t border-border bg-sunken/60 px-5 py-3 sm:px-6">
        <Button type="submit" variant="secondary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  );

const personalShell = shellFor('Personal details', 'Your date of birth and home address.');
const educationShell = shellFor('Education', 'Your current course and institution.');

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, application, setProfile, loading, error } = useStudentData();
  const saved = () => toast.success('Profile saved');

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !profile)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-80" />
      </div>
    );

  return (
    <>
      <PageHeader title="Profile" description="Details you enter here are used to fill in your application." />
      <div className="space-y-6">
        {application && application.status !== 'DRAFT' && (
          <Alert tone="info">
            Your submitted application keeps the details you had at the time of submission. Changes here apply to future applications.
          </Alert>
        )}
        <Card>
          <CardHeader title="Account" description="Contact an administrator to change your name or email." />
          <CardBody>
            <DefinitionList
              items={[
                ['Name', user!.fullName],
                ['Email', user!.email],
                ['Mobile', user!.phone ? `+91 ${user!.phone}` : undefined],
                ['Member since', formatDate(user!.createdAt)],
              ]}
            />
          </CardBody>
        </Card>
        <PersonalSection profile={profile} onSaved={setProfile} onDone={saved} shell={personalShell} />
        <EducationSection profile={profile} onSaved={setProfile} onDone={saved} shell={educationShell} />
      </div>
    </>
  );
}
