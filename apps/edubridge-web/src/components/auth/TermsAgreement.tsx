import { useState } from 'react';
import { TermsContent } from '@/components/legal/TermsContent';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * The terms checkbox stays locked until the terms have been opened and read to the end.
 * "I agree" in the pop-up ticks it; the box can then be unticked and ticked again freely.
 */
export function TermsAgreement({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [hasRead, setHasRead] = useState(false);

  const agree = () => {
    setHasRead(true);
    onChange(true);
    setOpen(false);
  };

  return (
    <div>
      <label className={cn('flex items-start gap-3', hasRead ? 'cursor-pointer' : 'cursor-not-allowed')}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!hasRead}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-describedby="terms-help"
        />
        <span className="text-sm leading-snug">
          I have read and agree to the{' '}
          <button type="button" onClick={() => setOpen(true)} className="cursor-pointer font-medium text-primary-ink underline underline-offset-4">
            Terms and Privacy Policy
          </button>
          .
        </span>
      </label>
      {error ? (
        <p id="terms-help" className="mt-1.5 pl-7 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : (
        !hasRead && (
          <p id="terms-help" className="mt-1 pl-7 text-[13px] text-subtle">
            Open and read the terms to continue.
          </p>
        )
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Terms and Privacy Policy"
        className="max-w-2xl"
        onBodyScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
        }}
        footer={
          <>
            {!readToEnd && <p className="mr-auto text-[13px] text-subtle">Scroll to the end to continue.</p>}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={agree} disabled={!readToEnd}>
              I agree
            </Button>
          </>
        }
      >
        <TermsContent />
      </Dialog>
    </div>
  );
}
