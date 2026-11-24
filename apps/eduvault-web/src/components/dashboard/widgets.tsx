import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {meta && <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
        <h1 className="font-display text-[26px] font-medium leading-tight text-balance sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface px-5 py-4 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-border-strong', className)}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <p className="mt-0.5 text-[13px] text-subtle">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center animate-fade-up', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-sunken text-subtle ring-1 ring-border">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

/** Label / value pairs used for read-only summaries. */
export function DefinitionList({ items, className }: { items: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-4 sm:grid-cols-2', className)}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-[15px]">{v ?? <span className="text-subtle">Not provided</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
