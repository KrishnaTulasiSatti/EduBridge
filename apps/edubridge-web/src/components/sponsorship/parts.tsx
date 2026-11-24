import {
  CANCEL_REASON_LABELS,
  EXPENSE_KEYS,
  EXPENSE_LABELS,
  SPONSORSHIP_STATUS_LABELS,
  type ExpenseKey,
  type MatchResult,
  type SponsorshipDTO,
  type SponsorshipStatus,
} from '@edubridge/shared';
import { Badge, Dot, type BadgeTone } from '@/components/ui/badge';
import { formatDate } from '@/lib/student';
import { daysLeft } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

const STATUS_TONE: Record<SponsorshipStatus, BadgeTone> = { PLEDGED: 'info', CONFIRMED: 'success', CANCELLED: 'neutral' };

export function SponsorshipStatusBadge({ status }: { status: SponsorshipStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <Dot /> {SPONSORSHIP_STATUS_LABELS[status]}
    </Badge>
  );
}

/** One line explaining where a sponsorship stands. */
export function sponsorshipStatusLine(s: SponsorshipDTO) {
  if (s.status === 'PLEDGED') {
    const d = daysLeft(s.expiresAt);
    return `Pledged ${formatDate(s.createdAt)} · awaiting confirmation of funds (${d} day${d === 1 ? '' : 's'} left)`;
  }
  if (s.status === 'CONFIRMED') return `Funds received ${formatDate(s.confirmation?.receivedOn)}`;
  return `${s.cancelReason ? CANCEL_REASON_LABELS[s.cancelReason] : 'Cancelled'} · ${formatDate(s.cancelledAt)}`;
}

/** Confirmed and pledged amounts against the approved requirement. */
export function FundingBar({
  approved,
  confirmed,
  pledged,
  className,
  compact,
}: {
  approved: number;
  confirmed: number;
  pledged: number;
  className?: string;
  compact?: boolean;
}) {
  const pct = (n: number) => (approved > 0 ? Math.min(100, (n / approved) * 100) : 0);
  const remaining = Math.max(0, approved - confirmed - pledged);
  return (
    <div className={className}>
      <div
        className={cn('flex overflow-hidden rounded-full bg-[var(--chart-track)]', compact ? 'h-1.5' : 'h-2.5')}
        role="img"
        aria-label={`${formatINR(confirmed)} confirmed and ${formatINR(pledged)} pledged of ${formatINR(approved)}`}
      >
        <div className="h-full bg-[var(--chart)]" style={{ width: `${pct(confirmed)}%` }} />
        <div className="h-full bg-[color-mix(in_srgb,var(--chart)_45%,var(--surface))]" style={{ width: `${pct(pledged)}%` }} />
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart)]" /> Confirmed <span className="tabular-nums text-foreground">{formatINR(confirmed)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[color-mix(in_srgb,var(--chart)_45%,var(--surface))]" /> Pledged{' '}
            <span className="tabular-nums text-foreground">{formatINR(pledged)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart-track)] ring-1 ring-border" /> Still needed{' '}
            <span className="tabular-nums text-foreground">{formatINR(remaining)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Score breakdown: each factor's weight and how well it matched. */
export function MatchBreakdown({ match }: { match: MatchResult }) {
  return (
    <ul className="space-y-3.5">
      {match.factors.map((f) => (
        <li key={f.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{f.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {Math.round(f.weight * f.value * 100)} <span className="text-subtle">/ {Math.round(f.weight * 100)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--chart-track)]">
            <div className="h-full rounded-full bg-[var(--chart)]" style={{ width: `${f.value * 100}%` }} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{f.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function MatchScore({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn('text-right', className)}>
      <p className="text-2xl font-semibold leading-none tabular-nums">{score}</p>
      <p className="mt-1 text-[12px] text-subtle">match</p>
    </div>
  );
}

/** The student's annual costs, largest first. */
export function ExpenseTable({ expenses, highlight = [] }: { expenses: Partial<Record<ExpenseKey, number>>; highlight?: ExpenseKey[] }) {
  const rows = EXPENSE_KEYS.map((k) => [k, expenses[k] ?? 0] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  if (!rows.length) return <p className="text-sm text-subtle">No cost breakdown recorded.</p>;
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className="py-2.5 text-muted-foreground">
              {EXPENSE_LABELS[k]}
              {highlight.includes(k) && <span className="ml-2 text-[12px] text-primary-ink">Your preference</span>}
            </td>
            <td className="py-2.5 text-right tabular-nums">{formatINR(v)}</td>
          </tr>
        ))}
        <tr>
          <td className="pt-2.5 font-medium">Total annual cost</td>
          <td className="pt-2.5 text-right font-medium tabular-nums">{formatINR(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
