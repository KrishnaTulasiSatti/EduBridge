import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, FileText, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  currentAcademicYear,
  MARKSHEET_RESULT_LABELS,
  MARKSHEET_RESULTS,
  MAX_MARKSHEET_BYTES,
  marksheetSchema,
  type MarksheetInput,
} from '@eduvault/shared';
import { PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLoad, vaultApi } from '@/lib/vault';

/** Drop area for the marksheet PDF. */
function PdfPicker({
  file,
  existing,
  error,
  onPick,
}: {
  file: File | null;
  existing?: { name: string; size: number };
  error?: string;
  onPick: (f: File | null, error?: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (f?: File) => {
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return onPick(null, 'Choose a PDF file');
    if (f.size > MAX_MARKSHEET_BYTES) return onPick(null, 'The PDF is larger than 5 MB');
    onPick(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const shown = file ? { name: file.name, size: file.size } : existing;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
          over ? 'border-primary bg-primary-soft/50' : error ? 'border-danger bg-danger-soft/40' : 'border-border-strong bg-sunken/50',
        )}
      >
        {shown ? (
          <div className="flex items-center gap-3 text-left">
            <span className="grid size-10 place-items-center rounded-lg bg-surface text-primary-ink ring-1 ring-border">
              <FileText className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{shown.name}</p>
              <p className="text-[13px] text-subtle">
                {formatBytes(shown.size)}
                {!file && existing ? ' · currently uploaded' : ''}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>
              {existing || file ? 'Replace' : 'Choose'}
            </Button>
          </div>
        ) : (
          <>
            <Upload className="size-5 text-subtle" />
            <p className="mt-2 text-sm">
              Drag the marksheet PDF here, or{' '}
              <button type="button" onClick={() => input.current?.click()} className="cursor-pointer font-medium text-primary-ink underline underline-offset-4">
                choose a file
              </button>
            </p>
            <p className="mt-1 text-[13px] text-subtle">PDF only, up to 5 MB</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label="Marksheet PDF"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            pick(f);
          }}
        />
      </div>
      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export default function MarksheetEditor() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const students = useLoad(() => vaultApi.students({ page: 1, limit: 100 }));
  const existing = useLoad(() => (id ? vaultApi.marksheet(id) : Promise.resolve(null)), [id]);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [progress, setProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MarksheetInput>({
    resolver: zodResolver(marksheetSchema),
    defaultValues: { studentRecordId: '', semester: '', academicYear: currentAcademicYear(), examSession: '', result: 'PASS', percentage: '' },
  });

  useEffect(() => {
    const m = existing.data;
    if (!m) return;
    reset({
      studentRecordId: m.studentRecordId,
      semester: String(m.semester),
      academicYear: m.academicYear,
      examSession: m.examSession,
      result: m.result,
      percentage: m.percentage === undefined ? '' : String(m.percentage),
    });
  }, [existing.data, reset]);

  const onSubmit = async (values: MarksheetInput) => {
    setFormError(null);
    if (!editing && !file) {
      setFileError('Upload the marksheet PDF');
      return;
    }
    setProgress(0);
    try {
      const m = editing
        ? await vaultApi.updateMarksheet(id!, values, file ?? undefined, setProgress)
        : await vaultApi.createMarksheet(values, file!, setProgress);
      toast.success(editing ? 'Draft saved' : 'Draft created');
      navigate(`/dashboard/marksheets/${m.id}`);
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) {
        Object.entries(f).forEach(([k, v]) => (k === 'file' ? setFileError(v[0]) : setError(k as keyof MarksheetInput, { message: v[0] })));
      }
      setFormError(getErrorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  if (editing && existing.data && existing.data.status !== 'DRAFT') {
    return <Alert tone="warning">Issued marksheets cannot be edited.</Alert>;
  }
  if ((editing && !existing.data && !existing.error) || !students.data) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <>
      <Link to={editing ? `/dashboard/marksheets/${id}` : '/dashboard/marksheets'} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-4')}>
        <ArrowLeft /> Back
      </Link>
      <PageHeader
        title={editing ? 'Edit draft marksheet' : 'New marksheet'}
        description="Upload the marksheet PDF and fill in a few details. It is saved as a draft; nothing is signed or visible to the student until you issue it."
      />
      {existing.error && <Alert tone="danger" className="mb-6">{existing.error}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        <Card>
          <CardHeader title="Marksheet PDF" description="The official marksheet as issued by your examination section. When issued, this exact file is signed." />
          <CardBody>
            <PdfPicker
              file={file}
              existing={editing ? existing.data?.file : undefined}
              error={fileError}
              onPick={(f, err) => {
                setFile(f);
                setFileError(err);
              }}
            />
            {progress !== null && (
              <div className="mt-3">
                <p className="text-[13px] text-muted-foreground">Uploading… {progress}%</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Details" description="Used to find and check the marksheet. Enter them as printed on the PDF." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Student" htmlFor="studentRecordId" error={errors.studentRecordId?.message} className="sm:col-span-2">
              <Select id="studentRecordId" disabled={editing} invalid={!!errors.studentRecordId} {...register('studentRecordId')}>
                <option value="">Select a student</option>
                {students.data.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} · {s.rollNumber} · {s.programme}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Semester" htmlFor="semester" error={errors.semester?.message}>
              <Select id="semester" invalid={!!errors.semester} {...register('semester')}>
                <option value="">Select</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    Semester {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Academic year" htmlFor="academicYear" error={errors.academicYear?.message} hint="Format 2025-26">
              <Input id="academicYear" invalid={!!errors.academicYear} {...register('academicYear')} />
            </Field>
            <Field label="Examination session" htmlFor="examSession" error={errors.examSession?.message} hint="e.g. November 2025">
              <Input id="examSession" invalid={!!errors.examSession} {...register('examSession')} />
            </Field>
            <Field label="Result" htmlFor="result" error={errors.result?.message}>
              <Select id="result" invalid={!!errors.result} {...register('result')}>
                {MARKSHEET_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {MARKSHEET_RESULT_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Overall percentage" htmlFor="percentage" optional error={errors.percentage?.message} hint="As printed on the marksheet">
              <Input id="percentage" type="number" inputMode="decimal" step="0.01" min={0} max={100} invalid={!!errors.percentage} {...register('percentage')} />
            </Field>
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={isSubmitting}>
            {editing ? 'Save draft' : 'Create draft'}
          </Button>
          <Link to="/dashboard/marksheets" className={buttonVariants({ variant: 'ghost' })}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
