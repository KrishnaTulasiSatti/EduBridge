import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Skeleton } from '@/components/dashboard/widgets';
import { MarksheetDocument } from '@/components/records/MarksheetDocument';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { useLoad, vaultApi } from '@/lib/vault';

export default function IssuerMarksheetPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = user?.institution?.status === 'ACTIVE';
  const { data: m, setData, error } = useLoad(() => vaultApi.marksheet(id), [id]);
  const [dialog, setDialog] = useState<'issue' | 'revoke' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const close = () => {
    setDialog(null);
    setActionError(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      setDialog(null);
    } catch (e) {
      setActionError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/dashboard/marksheets" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft /> Marksheets
        </Link>
        {m && (
          <div className="flex flex-wrap gap-2">
            {m.status === 'DRAFT' && canWrite && (
              <>
                <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDialog('delete')}>
                  Delete draft
                </Button>
                <Link to={`/dashboard/marksheets/${m.id}/edit`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  Edit
                </Link>
                <Button size="sm" onClick={() => setDialog('issue')}>
                  Issue and sign
                </Button>
              </>
            )}
            {m.status === 'ISSUED' && (
              <>
                {canWrite && (
                  <Button variant="danger" size="sm" onClick={() => setDialog('revoke')}>
                    Revoke
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {!m && !error && <Skeleton className="h-[520px] rounded-xl" />}
      {m && <MarksheetDocument m={m} as="issuer" />}

      <Dialog
        open={dialog === 'issue'}
        onClose={close}
        title="Issue this marksheet?"
        description="EduVault will sign it with your institution’s private key. After that it cannot be edited — only revoked — and the student will be able to see and share it."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                run(async () => {
                  setData(await vaultApi.issue(id));
                  toast.success('Marksheet issued and signed');
                })
              }
            >
              Issue and sign
            </Button>
          </>
        }
      >
        {actionError && <Alert tone="danger">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={dialog === 'revoke'}
        onClose={close}
        title="Revoke this marksheet?"
        description="Services that check it later will see that it was revoked, and the student can no longer share it. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 5}
              onClick={() =>
                run(async () => {
                  setData(await vaultApi.revoke(id, reason.trim()));
                  toast.success('Marksheet revoked');
                })
              }
            >
              Revoke
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="reason" hint="Recorded with the marksheet, e.g. “Marks entered incorrectly”">
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" maxLength={300} />
        </Field>
        {actionError && <Alert tone="danger" className="mt-3">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onClose={close}
        title="Delete this draft?"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                run(async () => {
                  await vaultApi.deleteMarksheet(id);
                  toast.success('Draft deleted');
                  navigate('/dashboard/marksheets', { replace: true });
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        {actionError && <Alert tone="danger">{actionError}</Alert>}
      </Dialog>
    </>
  );
}
