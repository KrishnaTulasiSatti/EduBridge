import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? 'var(--background)' : 'var(--primary)';
  const fg = inverted ? 'var(--primary)' : 'var(--background)';
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill={bg} />
      <rect x="8" y="9" width="16" height="15" rx="2.5" fill="none" stroke={fg} strokeWidth="2" />
      <circle cx="16" cy="16.5" r="3.2" fill="none" stroke={fg} strokeWidth="1.8" />
      <path d="M16 13.3v-1.6M16 21.3v-1.6M12.8 16.5h-1.6M20.8 16.5h-1.6" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, to = '/', inverted }: { className?: string; to?: string; inverted?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5', className)} aria-label="EduVault home">
      <LogoMark inverted={inverted} />
      <span className={cn('font-display text-[21px] font-semibold', inverted ? 'text-[#f6f6f3]' : 'text-foreground')}>EduVault</span>
    </Link>
  );
}

/** Shown on every page: EduVault is a simulation built for the EduBridge project. */
export function SimulationNotice({ className }: { className?: string }) {
  return (
    <p className={cn('text-[13px] leading-relaxed text-subtle', className)}>
      EduVault is a simulated academic document locker built for the EduBridge project. It is not DigiLocker or any
      government service, and every record in it is test data.
    </p>
  );
}
