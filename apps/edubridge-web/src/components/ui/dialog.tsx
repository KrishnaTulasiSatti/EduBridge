import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode, type UIEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A centred pop-up with a dimmed backdrop. Escape and the backdrop close it.
 * Long content scrolls inside the body; `onBodyScroll` lets a caller know how far it has been read.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  onBodyScroll,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  onBodyScroll?: (e: UIEvent<HTMLDivElement>) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const watchesScroll = !!onBodyScroll;

  // Content that fits without scrolling counts as read to the end.
  useEffect(() => {
    if (!open || !watchesScroll) return;
    const id = requestAnimationFrame(() => body.current?.dispatchEvent(new Event('scroll')));
    return () => cancelAnimationFrame(id);
  }, [open, watchesScroll]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 animate-fade" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-pop outline-none animate-scale-in',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 pb-4 pt-5">
          <div>
            <h2 className="text-[17px] font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-sunken hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children && (
          <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-soft" onScroll={onBodyScroll}>
            {children}
          </div>
        )}
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
