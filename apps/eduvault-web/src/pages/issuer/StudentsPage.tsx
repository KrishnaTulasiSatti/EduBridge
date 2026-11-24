import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Copy, Search, Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { activationCodeRequestSchema, studentRecordSchema, type ActivationCodeResult, type StudentRecordDTO, type StudentRecordInput } from '@eduvault/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useLoad, vaultApi } from '@/lib/vault';

type CodeShown = ActivationCodeResult & { name: string };

function EnrolForm({ onEnrolled, onCancel }: { onEnrolled: (s: StudentRecordDTO, result: ActivationCodeResult) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StudentRecordInput>({ resolver: zodResolver(studentRecordSchema), defaultValues: { admissionYear: new Date().getFullYear() } });
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (v: StudentRecordInput) => {
    setFormError(null);
    try {
      const { student, ...result } = await vaultApi.enrol(v);
      onEnrolled(student, result);
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) Object.entries(f).forEach(([k, m]) => setError(k as keyof StudentRecordInput, { message: m[0] }));
      setFormError(getErrorMessage(e));
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader title="Enrol a student" description="Use the details exactly as they appear in your institution’s records." />
      <CardBody>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
              <Input id="fullName" invalid={!!errors.fullName} {...register('fullName')} />
            </Field>
            <Field label="Roll number" htmlFor="rollNumber" error={errors.rollNumber?.message}>
              <Input id="rollNumber" className="uppercase" invalid={!!errors.rollNumber} {...register('rollNumber')} />
            </Field>
            <Field label="Programme" htmlFor="programme" error={errors.programme?.message} hint="e.g. B.Tech Computer Science and Engineering">
              <Input id="programme" invalid={!!errors.programme} {...register('programme')} />
            </Field>
            <Field label="Year of admission" htmlFor="admissionYear" error={errors.admissionYear?.message}>
              <Input id="admissionYear" type="number" inputMode="numeric" invalid={!!errors.admissionYear} {...register('admissionYear', { valueAsNumber: true })} />
            </Field>
            <Field label="Student’s email" htmlFor="email" error={errors.email?.message} hint="The activation code is sent here.">
              <Input id="email" type="email" autoComplete="off" invalid={!!errors.email} {...register('email')} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={isSubmitting}>
              Enrol student
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Asks for (or confirms) the student's email, then creates a new code and emails it. */
function NewCodeDialog({ student, onClose, onDone }: { student: StudentRecordDTO | null; onClose: () => void; onDone: (r: ActivationCodeResult) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEmail(student?.email ?? '');
    setError(null);
  }, [student]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!student) return;
    const parsed = activationCodeRequestSchema.safeParse({ email });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    try {
      onDone(await vaultApi.newCode(student.id, parsed.data.email));
    } catch (err) {
      setError(getFieldErrors(err)?.email?.[0] ?? getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!student}
      onClose={onClose}
      title="New activation code"
      description={student ? `A new code will be emailed to ${student.fullName}. Their old code stops working.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-code" loading={busy}>
            Send new code
          </Button>
        </>
      }
    >
      <form id="new-code" onSubmit={submit} noValidate>
        <Field label="Student’s email" htmlFor="new-code-email" error={error ?? undefined}>
          <Input id="new-code-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />
        </Field>
      </form>
    </Dialog>
  );
}

export default function StudentsPage() {
  const { user } = useAuth();
  const canWrite = user?.institution?.status === 'ACTIVE';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState<CodeShown | null>(null);
  const [renewing, setRenewing] = useState<StudentRecordDTO | null>(null);
  const { data, error, reload } = useLoad(() => vaultApi.students({ search: query, page }), [query, page]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.activationCode);
      toast.success('Code copied');
    } catch {
      toast.error('Could not copy. Please select the code and copy it manually.');
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader
        title="Students"
        description="Students enrolled at your institution. Each one activates their EduVault account with a one-time code."
        actions={
          canWrite &&
          !adding && (
            <Button onClick={() => setAdding(true)}>Enrol student</Button>
          )
        }
      />

      {adding && (
        <EnrolForm
          onCancel={() => setAdding(false)}
          onEnrolled={(s, result) => {
            setAdding(false);
            setCode({ name: s.fullName, ...result });
            void reload();
          }}
        />
      )}

      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

      <Card>
        <div className="border-b border-border p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or roll number" className="pl-9" aria-label="Search students" />
          </div>
        </div>

        {!data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Users} title={query ? 'No matching students' : 'No students enrolled yet'} text={query ? 'Try a different search.' : 'Enrol a student to issue their marksheets.'} />
        ) : (
          <div className="overflow-x-auto scrollbar-soft">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-[13px] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Programme</th>
                  <th className="px-5 py-3 font-medium">EduVault account</th>
                  <th className="px-5 py-3 text-right font-medium">Issued</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{s.fullName}</p>
                      <p className="font-mono text-[12.5px] text-muted-foreground">{s.rollNumber}</p>
                      {s.email && <p className="text-[12.5px] text-subtle">{s.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.programme}
                      <span className="block text-[13px] text-subtle">Admitted {s.admissionYear}</span>
                    </td>
                    <td className="px-5 py-3">
                      {s.linked ? (
                        <Badge tone="success">Activated {formatDate(s.linkedAt)}</Badge>
                      ) : (
                        <Badge>Not activated</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.marksheets}</td>
                    <td className="px-5 py-3 text-right">
                      {!s.linked && canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => setRenewing(s)}>
                          New code
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
            <span>
              Page {page} of {pages}
            </span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={!!code}
        onClose={() => setCode(null)}
        title="Activation code"
        description={
          code
            ? code.emailed
              ? `We emailed this code to ${code.name} at ${code.email}. They use it once to activate their EduVault account. It is shown only now, in case the email does not arrive.`
              : `The email to ${code.email} could not be sent, so please give this code to ${code.name} yourself. They use it once to activate their EduVault account. It is shown only now.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={copy}>
              <Copy /> Copy
            </Button>
            <Button onClick={() => setCode(null)}>Done</Button>
          </>
        }
      >
        <p className="rounded-lg bg-sunken py-4 text-center font-mono text-[26px] font-semibold tracking-[0.2em] ring-1 ring-border">{code?.activationCode}</p>
      </Dialog>

      <NewCodeDialog
        student={renewing}
        onClose={() => setRenewing(null)}
        onDone={(result) => {
          setCode({ name: renewing!.fullName, ...result });
          setRenewing(null);
          void reload();
        }}
      />
    </>
  );
}
