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

/**
 * Vertical columns for one series over time (e.g. applications per month). Bars grow from a
 * zero baseline with rounded tops; each column has a hover/focus tooltip and an accessible table.
 */
export function ColumnChart({
  data,
  label,
  format = (v) => String(v),
  height = 160,
}: {
  data: { key: string; label: string; fullLabel: string; value: number }[];
  /** What one value means, used in tooltips and the hidden table header. */
  label: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  // A round upper bound so the single gridline reads as a clean number.
  const top = max <= 0 ? 1 : niceCeil(max);
  return (
    <figure>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden />
        <span className="pointer-events-none absolute -top-2.5 right-0 bg-surface pl-1 text-[11px] tabular-nums text-subtle" aria-hidden>
          {format(top)}
        </span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-border-strong" aria-hidden>
          {data.map((d) => (
            <Tip
              key={d.key}
              content={
                <>
                  <span className="text-muted-foreground">{d.fullLabel}</span>
                  <br />
                  <span className="font-medium tabular-nums">{format(d.value)}</span> {label}
                </>
              }
              className="flex h-full flex-1 items-end rounded-t-[4px] outline-none hover:bg-sunken/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className="mx-auto w-full max-w-9 rounded-t-[4px] bg-chart"
                style={{ height: d.value > 0 ? `max(2px, ${(d.value / top) * 100}%)` : 0 }}
              />
            </Tip>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[11px] text-subtle">
            {d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label} by month</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.fullLabel}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/**
 * One horizontal bar split into parts of a whole (e.g. promised / still needed).
 * Single hue in steps of strength, separated by a 2px surface gap, with a legend that also prints the values.
 */
export function SegmentBar({ parts, format }: { parts: { label: string; value: number; strength: number; help?: string }[]; format: (v: number) => string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const fill = (strength: number) => (strength === 0 ? 'var(--chart-track)' : `color-mix(in srgb, var(--chart) ${strength}%, var(--surface))`);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px] bg-chart-track">
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <Tip
                key={p.label}
                content={<>{p.label}: <span className="font-medium tabular-nums">{format(p.value)}</span> ({Math.round((p.value / total) * 100)}%)</>}
                className="h-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="h-full" style={{ width: '100%', background: fill(p.strength) }} />
              </Tip>
            ))
            .map((el, i, arr) => {
              const p = parts.filter((x) => x.value > 0)[i];
              return (
                <div key={p.label} style={{ width: `${(p.value / total) * 100}%` }} className={cn('h-full', arr.length === 1 && 'w-full')}>
                  {el}
                </div>
              );
            })}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-start gap-2 text-sm">
            <span className="mt-1 size-2.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-border" style={{ background: fill(p.strength) }} aria-hidden />
            <span className="min-w-0">
              <span className="block text-muted-foreground">{p.label}</span>
              <span className="block font-medium tabular-nums">{format(p.value)}</span>
              {p.help && <span className="block text-[12px] text-subtle">{p.help}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
