import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { useActivityWhileMounted, useBusy } from '@/lib/activity';
import { cn } from '@/lib/utils';

/** Small inline spinner. */
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-label={label} role="status" />;
}

/** A thin indeterminate bar, for work with no known progress. */
export function ProgressLine({ className }: { className?: string }) {
  return (
    <div className={cn('relative h-0.5 overflow-hidden rounded-full bg-border', className)} role="progressbar" aria-label="Loading">
      <div className="absolute inset-0 origin-left rounded-full bg-primary [animation:progress-indeterminate_1.4s_var(--ease-in-out)_infinite]" />
    </div>
  );
}

/**
 * The slim bar along the top of the window. It shows whenever a server request or a page
 * is loading: it creeps forward while waiting, then finishes and fades out.
 */
export function ActivityBar() {
  const busy = useBusy();
  const [progress, setProgress] = useState<number | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (busy) {
      setFading(false);
      setProgress((p) => (p === null || p >= 1 ? 0.08 : p));
      // Move quickly at first, then slow down as it nears the end, like a real download.
      const id = window.setInterval(() => setProgress((p) => (p === null ? 0.08 : p + (0.92 - p) * 0.12)), 180);
      return () => window.clearInterval(id);
    }
    if (progress === null) return;
    setProgress(1);
    const fade = window.setTimeout(() => setFading(true), 220);
    const hide = window.setTimeout(() => {
      setProgress(null);
      setFading(false);
    }, 520);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(hide);
    };
    // Runs only when busy changes; `progress` is read for its value at that moment.
  }, [busy]);

  if (progress === null) return null;
  return (
    <div
      className={cn('pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px] transition-opacity duration-300', fading && 'opacity-0')}
      role="progressbar"
      aria-label="Loading"
      aria-busy={busy}
    >
      <div
        className="h-full origin-left bg-primary transition-transform duration-200 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

/** Keeps the top bar running while this is on screen (e.g. while a page's code loads). */
export function TopProgress() {
  useActivityWhileMounted();
  return null;
}

/** First load of the app: the logo with a quiet progress line under it. */
export function FullPageLoader() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 150);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="grid min-h-dvh place-items-center bg-background" aria-busy="true">
      {show && (
        <div className="flex w-40 flex-col items-center animate-fade">
          <LogoMark className="size-10" />
          <ProgressLine className="mt-5 w-full" />
          <span className="sr-only">Loading EduVault</span>
        </div>
      )}
    </div>
  );
}

/** Placeholder for a dashboard page while its code loads. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <TopProgress />
      <div className="skeleton h-4 w-28 rounded-md" />
      <div className="skeleton mt-3 h-9 w-72 max-w-full rounded-lg" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full rounded-md" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton mt-6 h-64 rounded-xl" />
    </div>
  );
}
