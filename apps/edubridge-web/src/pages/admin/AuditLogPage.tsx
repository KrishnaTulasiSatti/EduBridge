import { ChevronLeft, ChevronRight, Download, ScrollText, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AUDIT_ACTION_INFO,
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  ROLE_LABELS,
  ROLES,
  auditTitle,
  type AuditCategory,
  type AuditEntryDTO,
  type Role,
} from '@edubridge/shared';
import { EmptyState, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { analyticsApi, type AuditFilters } from '@/lib/analytics';
import { getErrorMessage } from '@/lib/api';
import { useLoad } from '@/lib/sponsorship';
import { cn } from '@/lib/utils';

const FILTER_KEYS = ['category', 'action', 'role', 'actor', 'actorId', 'resource', 'from', 'to'] as const;

const roleLabel = (r: string | null) => (r ? (ROLE_LABELS[r as Role] ?? (r === 'SYSTEM' ? 'System' : r)) : null);

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const tone: Partial<Record<AuditCategory, 'neutral' | 'info' | 'warning' | 'primary'>> = {
  SECURITY: 'warning',
  DECISIONS: 'primary',
  SPONSORSHIP: 'info',
};

export default function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f: AuditFilters & { actorId?: string } = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) (f as Record<string, string>)[k] = v;
    }
    f.page = Number(params.get('page')) || 1;
    return f;
  }, [params]);
  const openId = params.get('entry');

  // Free-text fields update the URL after a short pause, not on every key.
  const [actor, setActor] = useState(filters.actor ?? '');
  const [resource, setResource] = useState(filters.resource ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.actor ?? '') !== actor.trim() || (filters.resource ?? '') !== resource.trim()) update({ actor: actor.trim(), resource: resource.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, resource]);

  const key = params.toString();
  const { data, error, loading } = useLoad(() => analyticsApi.auditList(filters), [key.replace(/(^|&)entry=[^&]*/, '')]);
  const [exporting, setExporting] = useState(false);

  function update(changes: Record<string, string | undefined>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  }

  const actionsInCategory = Object.entries(AUDIT_ACTION_INFO).filter(([, v]) => !filters.category || v.category === filters.category);
  const active = FILTER_KEYS.some((k) => params.get(k));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await analyticsApi.exportCsv(filters);
      toast.success('Audit log exported. The export itself was recorded in the log.');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting} disabled={!data?.total}>
            {!exporting && <Download />} Export CSV
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-soft" role="tablist" aria-label="Category">
            {[undefined, ...AUDIT_CATEGORIES].map((c) => (
              <button
                key={c ?? 'ALL'}
                type="button"
                role="tab"
                aria-selected={filters.category === c}
                onClick={() => update({ category: c, action: undefined })}
                className={cn(
                  'cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                  filters.category === c ? 'bg-sunken font-medium text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {c ? AUDIT_CATEGORY_LABELS[c] : 'All'}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1fr_1fr_0.8fr_0.8fr]">
            <Field label="Activity">
              <Select value={filters.action ?? ''} onChange={(e) => update({ action: e.target.value || undefined })} className="h-9 text-sm">
                <option value="">Any activity</option>
                {actionsInCategory.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role">
              <Select value={filters.role ?? ''} onChange={(e) => update({ role: e.target.value || undefined })} className="h-9 text-sm">
                <option value="">Any role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Person">
              <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Name or email" className="h-9 text-sm" />
            </Field>
            <Field label="Record">
              <Input value={resource} onChange={(e) => setResource(e.target.value)} placeholder="Application no., reference or ID" className="h-9 text-sm" />
            </Field>
            <Field label="From">
              <Input type="date" value={filters.from ?? ''} max={filters.to} onChange={(e) => update({ from: e.target.value || undefined })} className="h-9 text-sm" />
            </Field>
            <Field label="To">
              <Input type="date" value={filters.to ?? ''} min={filters.from} onChange={(e) => update({ to: e.target.value || undefined })} className="h-9 text-sm" />
            </Field>
          </div>
          {(active || filters.actorId) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {filters.actorId && (
                <Badge tone="neutral">
                  One person{data?.items[0]?.actor ? `: ${data.items[0].actor.name}` : ''}
                  <button type="button" className="cursor-pointer" aria-label="Remove person filter" onClick={() => update({ actorId: undefined })}>
                    <X />
                  </button>
                </Badge>
              )}
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setActor('');
                  setResource('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Activity</th>
                <th className="px-5 py-3 font-medium">By</th>
                <th className="px-5 py-3 font-medium">Record</th>
              </tr>
            </thead>
            <tbody className={cn('transition-opacity', loading && data && 'opacity-60')}>
              {!data && loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td colSpan={4} className="px-5 py-3">
                        <Skeleton className="h-5" />
                      </td>
                    </tr>
                  ))
                : data?.items.map((e) => (
                    <tr
                      key={e.id}
                      tabIndex={0}
                      onClick={() => update({ entry: e.id }, true)}
                      onKeyDown={(ev) => ev.key === 'Enter' && update({ entry: e.id }, true)}
                      className={cn('cursor-pointer border-b border-border outline-none last:border-0 hover:bg-sunken/50 focus-visible:bg-sunken', openId === e.id && 'bg-sunken')}
                    >
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">{dateTime(e.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{auditTitle(e.action)}</span>
                          {AUDIT_ACTION_INFO[e.action]?.category === 'SECURITY' && <Badge tone="warning">Security</Badge>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <ActorCell entry={e} />
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{recordLabel(e)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <EmptyState icon={ScrollText} title={active ? 'No entries match these filters' : 'No activity recorded yet'} text={active ? 'Try a wider date range or fewer filters.' : undefined} />
          )}
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
            <span>
              {((data.page - 1) * data.limit + 1).toLocaleString('en-IN')}–{Math.min(data.page * data.limit, data.total).toLocaleString('en-IN')} of{' '}
              {data.total.toLocaleString('en-IN')} entries
            </span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) }, true)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="icon" variant="ghost" disabled={data.page >= pages} onClick={() => update({ page: String(data.page + 1) }, true)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {openId && <EntrySheet id={openId} onClose={() => update({ entry: undefined }, true)} onOpen={(id) => update({ entry: id }, true)} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ActorCell({ entry }: { entry: AuditEntryDTO }) {
  if (entry.actor) {
    return (
      <div className="min-w-0">
        <p className="truncate">{entry.actor.name}</p>
        <p className="truncate text-[13px] text-subtle">{roleLabel(entry.actorRole)}</p>
      </div>
    );
  }
  const email = typeof entry.metadata.email === 'string' ? entry.metadata.email : null;
  return (
    <div className="min-w-0">
      <p className="truncate text-muted-foreground">{entry.actorRole === 'SYSTEM' ? 'EduBridge (automatic)' : email ? 'Unknown account' : 'Not signed in'}</p>
      {email && <p className="truncate text-[13px] text-subtle">{email}</p>}
    </div>
  );
}

function recordLabel(e: AuditEntryDTO) {
  const m = e.metadata;
  const ref = [m.applicationNumber, m.reference, m.number].find((v) => typeof v === 'string') as string | undefined;
  const type = e.resourceType.replace(/([a-z])([A-Z])/g, '$1 $2');
  return ref ? `${type} · ${ref}` : type;
}

/* ------------------------------------------------------------ Detail */

function EntrySheet({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, error } = useLoad(() => analyticsApi.auditEntry(id), [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const e = data?.entry;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Audit entry">
      <button type="button" className="absolute inset-0 cursor-default bg-black/20 animate-fade" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-pop animate-slide-in-right">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">{e ? AUDIT_CATEGORY_LABELS[AUDIT_ACTION_INFO[e.action]?.category ?? 'PLATFORM'] : 'Audit entry'}</p>
            <h2 className="font-display text-xl font-medium">{e ? auditTitle(e.action) : ' '}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-soft sm:px-6">
          {error && <Alert tone="danger">{error}</Alert>}
          {!e && !error && <Skeleton className="h-60" />}
          {e && (
            <>
              <dl className="space-y-3 text-sm">
                <Row k="When">{dateTime(e.createdAt)}</Row>
                <Row k="By">
                  {e.actor ? (
                    <>
                      {e.actor.name} <span className="text-subtle">· {roleLabel(e.actorRole)}</span>
                      <span className="block text-[13px] text-subtle">{e.actor.email}</span>
                    </>
                  ) : (
                    <ActorCell entry={e} />
                  )}
                </Row>
                <Row k="Record">
                  {e.resourceType.replace(/([a-z])([A-Z])/g, '$1 $2')}
                  {e.resourceId && <span className="block break-all font-mono text-[12px] text-subtle">{e.resourceId}</span>}
                </Row>
                <Row k="Action code">
                  <span className="font-mono text-[12px]">{e.action}</span>
                </Row>
                {e.ip && (
                  <Row k="IP address">
                    <span className="font-mono text-[12px]">{e.ip}</span>
                  </Row>
                )}
                {e.userAgent && (
                  <Row k="Browser">
                    <span className="break-words text-[13px] text-muted-foreground">{e.userAgent}</span>
                  </Row>
                )}
              </dl>

              <h3 className="mb-2 mt-6 text-[13px] font-medium text-muted-foreground">Details recorded</h3>
              {Object.keys(e.metadata).length ? (
                <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                  {Object.entries(e.metadata).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2">
                      <dt className="break-words text-muted-foreground">{humanKey(k)}</dt>
                      <dd className="break-words">{formatValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-subtle">No extra details for this activity.</p>
              )}

              {data.related.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 text-[13px] font-medium text-muted-foreground">Other activity on this record</h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {data.related.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => onOpen(r.id)} className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sunken">
                          <span className="min-w-0">
                            <span className="block truncate">{auditTitle(r.action)}</span>
                            <span className="block truncate text-[12px] text-subtle">{r.actor?.name ?? (r.actorRole === 'SYSTEM' ? 'EduBridge' : 'Not signed in')}</span>
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-subtle">{dateTime(r.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const humanKey = (k: string) => {
  const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function formatValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-subtle">—</span>;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : <span className="text-subtle">None</span>;
  return <span className="font-mono text-[12px]">{JSON.stringify(v)}</span>;
}
