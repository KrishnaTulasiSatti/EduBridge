import { ArrowUpRight, FileText, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  aadhaarError,
  ALLOWED_UPLOAD_TYPES,
  DOCUMENT_TYPE_LABELS,
  feeReceiptProblem,
  maskAadhaar,
  MAX_UPLOAD_BYTES,
  type ApplicationDTO,
  type DocumentDTO,
  type DocumentType,
} from '@edubridge/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { formatBytes, formatDate, openDocument, studentApi, vaultReturn } from '@/lib/student';
import { cn, formatINR } from '@/lib/utils';
import { DocumentStatusBadge } from './status';
import { VaultVerificationSummary } from './VaultVerification';

export const DOCUMENT_INFO: Record<
  DocumentType,
  { description: string; extra?: { key: 'certificateNumber' | 'rollNumber' | 'receiptAmount'; label: string; hint: string } }
> = {
  MARKSHEET: {
    description: 'Your most recent semester or year-end marksheet.',
  },
  INCOME_CERTIFICATE: {
    description: 'Family income certificate issued by the revenue department.',
    extra: { key: 'certificateNumber', label: 'Certificate or application number', hint: 'Printed on your income certificate' },
  },
  COLLEGE_ID: {
    description: 'The front side of your current college identity card.',
    extra: { key: 'rollNumber', label: 'Roll number on your ID card', hint: 'As printed on the card' },
  },
  FEE_RECEIPT: {
    description: 'Your latest college fee receipt. The amount must match the tuition fee you entered.',
    extra: { key: 'receiptAmount', label: 'Amount on the receipt', hint: 'In whole rupees, as printed on the receipt' },
  },
};

/** "Verify using EduVault": sends the student to EduVault to consent to sharing their marksheet. */
function VaultOption() {
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await studentApi.startVaultImport();
      vaultReturn.set(location.pathname + location.search);
      window.location.assign(url);
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-sunken/40 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Verify using EduVault</p>
        <Badge tone="primary">Recommended</Badge>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        If your institution issues marksheets through EduVault, you can share one directly. You will be asked to sign in to EduVault
        and approve what is shared. Its digital signature is checked straight away.
      </p>
      <Button className="mt-3" variant="secondary" size="sm" loading={busy} onClick={start}>
        Continue to EduVault <ArrowUpRight />
      </Button>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export function DocumentCard({
  type,
  doc,
  editable,
  tuitionFee,
  onChange,
}: {
  type: DocumentType;
  doc?: DocumentDTO;
  editable: boolean;
  /** Fee receipt: the tuition fee from "Support needed", which the receipt amount must equal. */
  tuitionFee?: number;
  onChange?: (app: ApplicationDTO) => void;
}) {
  const info = DOCUMENT_INFO[type];
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isAmount = info.extra?.key === 'receiptAmount';
  const [extraValue, setExtraValue] = useState(String((info.extra && doc?.[info.extra.key]) ?? ''));
  const [extraError, setExtraError] = useState<string | undefined>();
  const [aadhaar, setAadhaar] = useState('');
  const [aadhaarErr, setAadhaarErr] = useState<string | undefined>();
  const needsAadhaar = type === 'INCOME_CERTIFICATE';
  const [error, setError] = useState<string | null>(null);

  const showDropzone = editable && (!doc || replacing);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      setError('Please choose a PDF, JPG or PNG file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('This file is larger than 5 MB. Please upload a smaller copy.');
      return;
    }
    if (info.extra && !extraValue.trim()) {
      setExtraError(`Enter the ${info.extra.label.toLowerCase()} first`);
      return;
    }
    if (isAmount) {
      const problem = feeReceiptProblem(Number(extraValue), tuitionFee);
      if (problem) {
        setExtraError(problem);
        return;
      }
    }
    const fields: Record<string, string> = info.extra ? { [info.extra.key]: extraValue.trim() } : {};
    if (needsAadhaar) {
      const problem = aadhaarError(aadhaar);
      if (problem) {
        setAadhaarErr(problem);
        return;
      }
      fields.aadhaarNumber = aadhaar;
    }
    setProgress(0);
    try {
      const app = await studentApi.upload(type, file, fields, setProgress);
      onChange?.(app);
      setReplacing(false);
      toast.success(`${DOCUMENT_TYPE_LABELS[type]} uploaded`);
    } catch (e) {
      const fieldErrors = getFieldErrors(e);
      if (info.extra && fieldErrors?.[info.extra.key]) setExtraError(fieldErrors[info.extra.key][0]);
      if (fieldErrors?.aadhaarNumber) setAadhaarErr(fieldErrors.aadhaarNumber[0]);
      setError(getErrorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    if (!doc) return;
    setRemoving(true);
    try {
      onChange?.(await studentApi.removeDocument(doc.id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setRemoving(false);
    }
  };

  const view = async () => {
    if (!doc) return;
    try {
      await openDocument(doc.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="rounded-xl border border-border">
      <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="font-medium">{DOCUMENT_TYPE_LABELS[type]}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{info.description}</p>
        </div>
        {doc && <DocumentStatusBadge status={doc.status} />}
      </div>

      <div className="space-y-4 border-t border-border px-5 py-4">
        {doc?.source === 'EDUVAULT' && doc.verification && (
          <>
            <VaultVerificationSummary status={doc.status} verification={doc.verification} documentId={doc.id} />
            {editable && !replacing && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" loading={removing} onClick={remove}>
                  Remove
                </Button>
              </div>
            )}
          </>
        )}

        {doc && doc.source !== 'EDUVAULT' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-subtle ring-1 ring-border">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.originalName}</p>
                <p className="text-[13px] text-subtle">
                  {formatBytes(doc.size)} · Uploaded {formatDate(doc.uploadedAt)}
                  {doc.certificateNumber && ` · No. ${doc.certificateNumber}`}
                  {doc.rollNumber && ` · Roll no. ${doc.rollNumber}`}
                  {doc.receiptAmount !== undefined && ` · ${formatINR(doc.receiptAmount)}`}
                  {doc.aadhaarLast4 && ` · Aadhaar ${maskAadhaar(doc.aadhaarLast4)}`}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={view}>
                View
              </Button>
              {editable && !replacing && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
                    Replace
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" loading={removing} onClick={remove}>
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {showDropzone && (
          <>
            {type === 'MARKSHEET' && (
              <>
                <VaultOption />
                <p className="pt-1 text-[13px] font-medium text-muted-foreground">Or upload a scanned copy</p>
              </>
            )}
            {(info.extra || needsAadhaar) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {info.extra && (
                  <Field label={info.extra.label} htmlFor={`${type}-extra`} hint={info.extra.hint} error={extraError}>
                    <Input
                      id={`${type}-extra`}
                      value={extraValue}
                      invalid={!!extraError}
                      {...(isAmount ? { inputMode: 'numeric' as const, prefix: '₹', autoComplete: 'off' } : {})}
                      onChange={(e) => {
                        setExtraValue(isAmount ? e.target.value.replace(/\D/g, '') : e.target.value);
                        setExtraError(undefined);
                      }}
                    />
                  </Field>
                )}
                {needsAadhaar && (
                  <Field
                    label="Aadhaar number"
                    htmlFor={`${type}-aadhaar`}
                    error={aadhaarErr}
                    hint="Used only to find your certificate on AP Seva. Stored encrypted; reviewers see it only while verifying."
                  >
                    <Input
                      id={`${type}-aadhaar`}
                      value={aadhaar}
                      invalid={!!aadhaarErr}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                      placeholder="0000 0000 0000"
                      onChange={(e) => {
                        setAadhaar(e.target.value.replace(/[^\d ]/g, ''));
                        setAadhaarErr(undefined);
                      }}
                    />
                  </Field>
                )}
              </div>
            )}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center rounded-lg border border-dashed px-6 py-7 text-center transition-colors',
                dragOver ? 'border-primary bg-primary-soft/50' : 'border-border-strong bg-sunken/50',
              )}
            >
              {progress !== null ? (
                <div className="w-full max-w-xs">
                  <p className="text-sm text-muted-foreground">Uploading… {progress}%</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="size-5 text-subtle" />
                  <p className="mt-2 text-sm">
                    Drag a file here, or{' '}
                    <button type="button" onClick={() => inputRef.current?.click()} className="cursor-pointer font-medium text-primary-ink underline underline-offset-4">
                      choose a file
                    </button>
                  </p>
                  <p className="mt-1 text-[13px] text-subtle">PDF, JPG or PNG, up to 5 MB</p>
                  {replacing && (
                    <button type="button" onClick={() => setReplacing(false)} className="mt-3 cursor-pointer text-[13px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  )}
                </>
              )}
              <input
                ref={inputRef}
                id={`${type}-file`}
                aria-label={`Upload ${DOCUMENT_TYPE_LABELS[type].toLowerCase()}`}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Reset so choosing the same file again (e.g. after fixing an error) still triggers a change.
                  e.target.value = '';
                  void handleFile(file);
                }}
              />
            </div>
          </>
        )}

        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </div>
  );
}
