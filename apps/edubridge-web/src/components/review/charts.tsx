import { useState, type ReactNode } from 'react';
import { NEED_LEVEL_LABELS, type NeedLevel } from '@edubridge/shared';
import { cn } from '@/lib/utils';

/*
 * Small, single-hue charts. One data colour (--chart) on a lighter track of the same hue,
 * text always in ink tokens, a hover/focus tooltip on every mark, and the numbers also printed.
 */

function Tip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn('relative', className)}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-72 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] leading-snug text-foreground shadow-pop"
        >
          {content}
        </div>
      )}
    </div>
  );
}

/** One horizontal bar on a track: label and value as text, the bar shows the share of the maximum. */
export function MeterRow({ label, value, max, valueText, tip }: { label: ReactNode; value: number; max: number; valueText: ReactNode; tip?: ReactNode }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <Tip content={tip ?? <>{label}: {valueText}</>} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{valueText}</span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-chart-track">
        <div className="h-2 rounded-r-[4px] bg-chart" style={{ width: `${share * 100}%`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }} />
      </div>
    </Tip>
  );
}

export function ProbabilityBars({ probabilities }: { probabilities: Partial<Record<NeedLevel, number>> }) {
  const levels: NeedLevel[] = ['HIGH', 'MEDIUM', 'LOW'];
  return (
    <div className="space-y-3">
      {levels.map((l) => {
        const p = probabilities[l] ?? 0;
        return <MeterRow key={l} label={NEED_LEVEL_LABELS[l]} value={p} max={1} valueText={`${Math.round(p * 100)}%`} tip={`Model probability of ${NEED_LEVEL_LABELS[l].toLowerCase()}: ${(p * 100).toFixed(1)}%`} />;
      })}
    </div>
  );
}

/** Rows = what admins decided, columns = what the model predicted. Darker = more applications. */
export function ConfusionMatrix({ labels, matrix }: { labels: NeedLevel[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  const short: Record<NeedLevel, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
  return (
    <div className="overflow-x-auto">
      <table className="text-sm" aria-label="Confusion matrix">
        <thead>
          <tr>
            <th className="p-1" />
            <th colSpan={labels.length} className="p-1 text-center text-[12px] font-medium text-muted-foreground">
              Predicted
            </th>
          </tr>
          <tr>
            <th className="p-1 text-left text-[12px] font-medium text-muted-foreground">Actual</th>
            {labels.map((l) => (
              <th key={l} className="w-20 p-1 text-center text-[12px] font-medium text-muted-foreground">
                {short[l]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const rowTotal = row.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={labels[i]}>
                <th className="p-1 pr-3 text-left text-[12px] font-medium text-muted-foreground">{short[labels[i]]}</th>
                {row.map((v, j) => {
                  const strength = v === 0 ? 0 : 10 + 80 * (v / max);
                  return (
                    <td key={j} className="p-[1px]">
                      <Tip
                        content={`Decided ${short[labels[i]].toLowerCase()}, predicted ${short[labels[j]].toLowerCase()}: ${v} (${Math.round((v / rowTotal) * 100)}% of ${short[labels[i]].toLowerCase()})`}
                        className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div
                          className={cn('grid h-12 w-20 place-items-center rounded-[4px] tabular-nums', i === j && 'font-semibold')}
                          style={{
                            background: v === 0 ? 'var(--surface-sunken)' : `color-mix(in srgb, var(--chart) ${strength}%, var(--surface))`,
                            color: strength > 55 ? 'var(--chart-on)' : 'var(--foreground)',
                          }}
                        >
                          {v}
                        </div>
                      </Tip>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
