import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/30 animate-fade" onClick={onClose} />
      <div className={cn('relative w-full max-w-md rounded-xl border border-border bg-surface shadow-pop animate-scale-in', className)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-[17px] font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="-mr-2 grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-sunken" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="px-6 pt-4">{children}</div>}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-5">{footer}</div>
      </div>
    </div>
  );
}
