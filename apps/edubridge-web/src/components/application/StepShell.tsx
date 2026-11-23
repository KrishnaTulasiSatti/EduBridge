import { Check, CloudOff, Loader2 } from 'lucide-react';
import type { FormEventHandler, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { SaveState } from '@/lib/student';

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-subtle" aria-live="polite">
      {state === 'saving' && (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="size-3.5" /> Saved
        </>
      )}
      {state === 'error' && (
        <span className="inline-flex items-center gap-1.5 text-warning">
          <CloudOff className="size-3.5" /> Not saved yet
        </span>
      )}
    </span>
  );
}

/** Frame shared by every application step: heading, autosave state, content and navigation. */
export function StepShell({
  step,
  total,
  title,
  description,
  saveState,
  children,
  onSubmit,
  onBack,
  continueLabel = 'Save and continue',
  busy,
  footer,
}: {
  step: number;
  total: number;
  title: string;
  description: string;
  saveState?: SaveState;
  children: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onBack?: () => void;
  continueLabel?: string;
  busy?: boolean;
  footer?: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-8">
        <div>
          <p className="text-[13px] text-subtle">
            Step {step} of {total}
          </p>
          <h2 className="mt-1 font-display text-[24px] font-medium leading-tight">{title}</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
        </div>
        {saveState && (
          <div className="pt-1">
            <SaveIndicator state={saveState} />
          </div>
        )}
      </div>
      <div className="px-5 py-7 sm:px-8">{children}</div>
      <div className="flex items-center justify-between gap-3 rounded-b-xl border-t border-border bg-sunken/60 px-5 py-4 sm:px-8">
        <div>
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
        </div>
        {footer ?? (
          <Button type="submit" loading={busy}>
            {continueLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="border-t border-border pt-7 first:border-t-0 first:pt-0">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}
