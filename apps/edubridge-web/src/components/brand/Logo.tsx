import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? 'var(--background)' : 'var(--primary)';
  const fg = inverted ? 'var(--primary)' : 'var(--background)';
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill={bg} />
      <path d="M6 22c2.8-6.2 6-9.3 10-9.3s7.2 3.1 10 9.3" fill="none" stroke={fg} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 22h20" stroke={fg} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11.5 22v-4.6M16 22v-6.6M20.5 22v-4.6" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, to = '/', inverted }: { className?: string; to?: string; inverted?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5', className)} aria-label="EduBridge home">
      <LogoMark inverted={inverted} />
      <span className={cn('font-display text-[21px] font-semibold', inverted ? 'text-[#f7f6f2]' : 'text-foreground')}>EduBridge</span>
    </Link>
  );
}
