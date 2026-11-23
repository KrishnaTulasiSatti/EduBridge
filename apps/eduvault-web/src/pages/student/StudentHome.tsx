import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { activationCodeSchema } from '@eduvault/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { MarksheetStatusBadge } from '@/components/records/MarksheetDocument';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatDate, pct } from '@/lib/format';
import { useLoad, vaultApi } from '@/lib/vault';

const linkSchema = z.object({ activationCode: activationCodeSchema });
type LinkInput = z.input<typeof linkSchema>;

function LinkEnrolment({ onLinked }: { onLinked: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LinkInput>({ resolver: zodResolver(linkSchema), defaultValues: { activationCode: '' } });

  const onSubmit = async (v: LinkInput) => {
    try {
      await vaultApi.linkEnrolment(v.activationCode);
      toast.success('Enrolment linked');
      reset();
      onLinked();
    } catch (e) {
      setError('activationCode', { message: getFieldErrors(e)?.activationCode?.[0] ?? getErrorMessage(e) });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
      <Field label="Activation code" htmlFor="code" error={errors.activationCode?.message} className="flex-1">
        <Input id="code" autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX" className="font-mono uppercase tracking-wider" invalid={!!errors.activationCode} {...register('activationCode')} />
      </Field>
      <Button type="submit" variant="secondary" className="sm:mt-[26px]" loading={isSubmitting}>
        Link
      </Button>
    </form>
  );
}

export default function StudentHome() {
  const { user } = useAuth();
  const marksheets = useLoad(vaultApi.myMarksheets);
  const enrolments = useLoad(vaultApi.myEnrolments);

  return (
    <>
      <PageHeader title="My documents" description={`Marksheets issued to you, ${user!.fullName.split(' ')[0]}. Only you can see them, and you decide who they are shared with.`} />
      {marksheets.error && <Alert tone="danger" className="mb-6">{marksheets.error}</Alert>}

      <Card>
        <CardHeader title="Marksheets" />
        {!marksheets.data ? (
          <CardBody className="space-y-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </CardBody>
        ) : marksheets.data.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No marksheets yet"
            text="When your institution issues a marksheet to you on EduVault, it will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {marksheets.data.map((m) => (
              <li key={m.id}>
                <Link to={`/dashboard/documents/${m.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken/60 sm:px-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
                    <FileText className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      Semester {m.semester} · {m.examSession}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {m.institution.name} · {m.result === 'PASS' ? 'Pass' : 'Fail'}{typeof m.percentage === 'number' ? ` · ${pct(m.percentage)}` : ''} · Issued {formatDate(m.issuedAt)}
                    </span>
                  </span>
                  <MarksheetStatusBadge status={m.status} />
                  <ChevronRight className="size-4 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Linked institutions" description="Marksheets from these enrolments appear above." />
        <CardBody className="space-y-6">
          {enrolments.data && enrolments.data.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {enrolments.data.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block text-[15px] font-medium">{e.institution.name}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {e.programme} · Roll no. {e.rollNumber}
                    </span>
                  </span>
                  <span className="text-[13px] text-subtle">Linked {formatDate(e.linkedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <p className="mb-3 text-sm text-muted-foreground">Studied at another institution on EduVault? Enter the activation code it gave you.</p>
            <LinkEnrolment
              onLinked={() => {
                void enrolments.reload();
                void marksheets.reload();
              }}
            />
          </div>
        </CardBody>
      </Card>
    </>
  );
}
