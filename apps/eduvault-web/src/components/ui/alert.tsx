import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  info: { cls: 'border-info/25 bg-info-soft text-info', icon: Info },
  success: { cls: 'border-success/25 bg-success-soft text-success', icon: CheckCircle2 },
  warning: { cls: 'border-warning/25 bg-warning-soft text-warning', icon: TriangleAlert },
  danger: { cls: 'border-danger/25 bg-danger-soft text-danger', icon: AlertCircle },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-4 py-3', t.cls, className)}>
      <t.icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-sm">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn('text-foreground/80', title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}
