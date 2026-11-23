import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/dashboard/widgets';
import { MarksheetDocument } from '@/components/records/MarksheetDocument';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { useLoad, vaultApi } from '@/lib/vault';

export default function MarksheetPage() {
  const { id = '' } = useParams();
  const { data, error } = useLoad(() => vaultApi.myMarksheet(id), [id]);

  return (
    <>
      <div className="no-print mb-6 flex items-center justify-between">
        <Link to="/dashboard" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft /> My documents
        </Link>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!data && !error && <Skeleton className="h-[520px] rounded-xl" />}
      {data && (
        <>
          <MarksheetDocument m={data} as="student" />
          <p className="no-print mt-4 text-[13px] leading-relaxed text-subtle">
            To share this marksheet, start from the service that needs it — for example “Verify using EduVault” on EduBridge. You will be
            brought back here to approve.
          </p>
        </>
      )}
    </>
  );
}
