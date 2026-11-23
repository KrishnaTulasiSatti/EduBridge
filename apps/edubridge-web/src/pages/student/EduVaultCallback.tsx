import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DocumentDTO, DocumentStatus } from '@edubridge/shared';
import { VaultStatusIcon, VaultVerificationDetails, marksheetLine } from '@/components/application/VaultVerification';
import { PageHeader } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { getErrorMessage } from '@/lib/api';
import { studentApi, vaultReturn } from '@/lib/student';

type Result = { outcome: DocumentStatus | 'DECLINED'; doc?: DocumentDTO };

const titles: Partial<Record<Result['outcome'], string>> = {
  VERIFIED: 'Marksheet verified',
  REVIEW_REQUIRED: 'Marksheet added — needs a review',
  REJECTED: 'Marksheet could not be verified',
  SERVICE_UNAVAILABLE: 'Marksheet added — signature not yet checked',
  DECLINED: 'Nothing was shared',
};

/** EduVault sends the student back here with a one-time code (or an error) after the consent screen. */
export default function EduVaultCallback() {
  const [params] = useSearchParams();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnTo] = useState(() => vaultReturn.take());
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const state = params.get('state');
    if (!state) {
      setError('This page was opened without a response from EduVault.');
      return;
    }
    // Remove the one-time code from the address bar and history.
    window.history.replaceState(null, '', window.location.pathname);
    studentApi
      .completeVaultImport({ state, code: params.get('code') ?? undefined, error: params.get('error') ?? undefined })
      .then(({ outcome, application }) => setResult({ outcome, doc: application.documents.find((d) => d.type === 'MARKSHEET') }))
      .catch((e) => setError(getErrorMessage(e)));
  }, [params]);

  const back = (
    <Link to={returnTo} className={buttonVariants({ variant: 'primary' })}>
      Back to your application
    </Link>
  );

  return (
    <>
      <PageHeader title="EduVault" description="Importing your marksheet from EduVault." />

      {!result && !error && (
        <Card>
          <CardBody className="flex items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Receiving your marksheet and checking its signature…
          </CardBody>
        </Card>
      )}

      {error && (
        <div className="space-y-6">
          <Alert tone="danger" title="The marksheet could not be imported">
            {error}
          </Alert>
          {back}
        </div>
      )}

      {result && (
        <Card>
          <CardBody className="space-y-6 sm:px-8 sm:py-7">
            <div className="flex gap-3">
              {result.outcome !== 'DECLINED' && <VaultStatusIcon status={result.outcome} className="mt-1 size-6" />}
              <div>
                <h2 className="font-display text-[24px] font-medium leading-tight">{titles[result.outcome]}</h2>
                {result.outcome === 'DECLINED' ? (
                  <p className="mt-2 text-muted-foreground">
                    You chose not to share a marksheet from EduVault. You can try again at any time, or upload a scanned copy instead.
                  </p>
                ) : (
                  result.doc?.verification && (
                    <>
                      <p className="mt-1 text-sm text-muted-foreground">{marksheetLine(result.doc.verification)}</p>
                      <p className="mt-3 leading-relaxed">{result.doc.verification.summary}</p>
                    </>
                  )
                )}
              </div>
            </div>
            {result.doc?.verification && result.outcome !== 'DECLINED' && (
              <div className="border-t border-border pt-6">
                <VaultVerificationDetails verification={result.doc.verification} documentId={result.doc.id} />
              </div>
            )}
            <div className="border-t border-border pt-6">{back}</div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
