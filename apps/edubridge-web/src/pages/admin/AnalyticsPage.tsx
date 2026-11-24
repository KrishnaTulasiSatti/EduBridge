import { Activity, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NEED_LEVEL_LABELS, auditPhrase, auditTitle, type AnalyticsDTO } from '@edubridge/shared';
import { ColumnChart, MeterRow, SegmentBar } from '@/components/review/charts';
import { DefinitionList, EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { analyticsApi, monthLabel } from '@/lib/analytics';
import { useLoad } from '@/lib/sponsorship';
import { cn, formatINR, timeAgo } from '@/lib/utils';

const TRENDS = [
  { key: 'submitted', title: 'Applications submitted', unit: 'applications submitted', money: false },
  { key: 'decided', title: 'Decisions made', unit: 'eligibility decisions', money: false },
  { key: 'confirmedAmount', title: 'Sponsorship confirmed', unit: 'confirmed', money: true },
] as const;

const SECURITY_ROWS: { action: string; help: string }[] = [
  { action: 'LOGIN_FAILED', help: 'Wrong password or unknown email' },
  { action: 'ACCOUNT_LOCKED', help: 'After 5 failed attempts in a row' },
  { action: 'REFRESH_TOKEN_REUSE', help: 'A used session token was presented again; the session was ended' },
  { action: 'DOCUMENT_VIEWED', help: 'Student documents opened by volunteers or admins' },
  { action: 'AADHAAR_VIEWED', help: 'Aadhaar numbers revealed to the assigned reviewer' },
];

const n = (v: number) => v.toLocaleString('en-IN');

export default function AnalyticsPage() {
  const { data, error, loading, reload } = useLoad(analyticsApi.summary);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Applications, verification, decisions and sponsorship across EduBridge. Every figure is counted live from the records."
        meta={data && <span>Counted {timeAgo(data.generatedAt)}</span>}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void reload()} loading={loading && !!data}>
            {!(loading && data) && <RefreshCw />} Refresh
          </Button>
        }
      />
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      {!data ? (
        !error && <LoadingState />
      ) : (
        <Dashboard data={data} />
      )}
    </>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function Dashboard({ data }: { data: AnalyticsDTO }) {
  const a = data.applications;
  const s = data.sponsorship;
  const decided = a.approved + a.rejected + a.onHold;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Registered students" value={n(data.users.students)} hint={data.users.newStudentsLast30Days ? `${n(data.users.newStudentsLast30Days)} joined in the last 30 days` : 'None joined in the last 30 days'} />
        <Stat label="Applications submitted" value={n(a.submitted)} hint={a.drafts ? `${n(a.drafts)} still in draft` : undefined} />
        <Stat label="Awaiting verification" value={n(a.awaitingVerification)} hint={a.underVerification ? `${n(a.underVerification)} being verified now` : 'None being verified now'} />
        <Stat label="Documents awaiting review" value={n(data.documents.awaitingReview)} hint="On applications not yet fully verified" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Where applications are" description="Each submitted application is in exactly one stage." />
          <CardBody className="space-y-4">
            {a.submitted === 0 ? (
              <EmptyState icon={Activity} title="No submitted applications yet" className="py-6" />
            ) : (
              [
                ['Awaiting verification', a.awaitingVerification],
                ['Being verified', a.underVerification],
                ['Awaiting admin decision', a.awaitingDecision],
                ['On hold', a.onHold],
                ['Approved', a.approved],
                ['Not approved', a.rejected],
              ].map(([label, v]) => (
                <MeterRow key={label} label={label} value={v as number} max={a.submitted} valueText={n(v as number)} tip={`${label}: ${n(v as number)} of ${n(a.submitted)} submitted (${Math.round(((v as number) / a.submitted) * 100)}%)`} />
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Decisions" description="Final eligibility decisions made by administrators." />
          <CardBody>
            {decided === 0 ? (
              <EmptyState icon={Activity} title="No decisions yet" text="Decisions appear here once an administrator reviews an assessed application." className="py-6" />
            ) : (
              <>
                <DefinitionList
                  className="sm:grid-cols-3"
                  items={[
                    ['Approved', <span className="text-xl font-semibold tabular-nums">{n(a.approved)}</span>],
                    ['Not approved', <span className="text-xl font-semibold tabular-nums">{n(a.rejected)}</span>],
                    ['On hold', <span className="text-xl font-semibold tabular-nums">{n(a.onHold)}</span>],
                  ]}
                />
                {a.approved > 0 && (
                  <div className="mt-6 space-y-4 border-t border-border pt-5">
                    <p className="text-[13px] font-medium text-muted-foreground">Approved, by confirmed need level</p>
                    {(['HIGH', 'MEDIUM', 'LOW'] as const).map((l) => (
                      <MeterRow key={l} label={NEED_LEVEL_LABELS[l]} value={data.approvedByNeedLevel[l]} max={a.approved} valueText={n(data.approvedByNeedLevel[l])} />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Sponsorship" description="Approved amounts, and how much of them sponsors have pledged or the platform has confirmed as received." />
        <CardBody className="space-y-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Figure label="Eligible for sponsorship" value={n(s.eligibleStudents)} hint="Approved, not yet fully funded" />
            <Figure label="Shown to sponsors" value={n(s.visibleToSponsors)} hint="Students who gave consent" />
            <Figure label="Fully funded" value={n(s.fullyFunded)} />
            <Figure label="Sponsors" value={n(s.sponsors)} hint={s.sponsors ? `${formatINR(s.sponsorBudget)} total budget` : undefined} />
          </div>
          {s.approvedAmount > 0 ? (
            <div>
              <p className="mb-3 text-sm">
                <span className="text-muted-foreground">Total approved for sponsorship</span>{' '}
                <span className="font-semibold tabular-nums">{formatINR(s.approvedAmount)}</span>
              </p>
              <SegmentBar
                format={formatINR}
                parts={[
                  { label: 'Confirmed', value: s.confirmedAmount, strength: 100, help: `${n(s.confirmed.count)} sponsorship${s.confirmed.count === 1 ? '' : 's'}, funds received` },
                  { label: 'Pledged, awaiting funds', value: s.pledgedAmount, strength: 45, help: `${n(s.pledges.count)} pledge${s.pledges.count === 1 ? '' : 's'}, reserved for 14 days` },
                  { label: 'Still needed', value: s.remainingAmount, strength: 0, help: 'Remaining sponsorship requirement' },
                ]}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No applications have been approved for sponsorship yet.</p>
          )}
          {s.cancelled.count > 0 && (
            <p className="text-[13px] text-subtle">
              {n(s.cancelled.count)} pledge{s.cancelled.count === 1 ? '' : 's'} withdrawn, cancelled or expired ({formatINR(s.cancelled.amount)}); not counted above.
            </p>
          )}
        </CardBody>
      </Card>

      <TrendCard data={data} />

      <VolunteerCard data={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Security, last 30 days"
            description="Sign-in problems and access to sensitive student data."
            action={<Link to="/dashboard/audit?category=SECURITY" className="text-sm text-primary-ink hover:underline">View entries</Link>}
          />
          <CardBody className="py-2">
            <ul className="divide-y divide-border">
              {SECURITY_ROWS.map((r) => (
                <li key={r.action}>
                  <Link to={`/dashboard/audit?action=${r.action}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-primary-ink">
                    <span className="min-w-0">
                      <span className="block">{auditTitle(r.action)}</span>
                      <span className="block text-[13px] text-subtle">{r.help}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{n(data.securityLast30Days[r.action] ?? 0)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Important administrative activity"
            description="Decisions, account changes, confirmations and exports."
            action={<Link to="/dashboard/audit" className="text-sm text-primary-ink hover:underline">Audit log</Link>}
          />
          <CardBody className="py-2">
            {data.recentAdminActivity.length ? (
              <ul className="divide-y divide-border">
                {data.recentAdminActivity.map((e) => (
                  <li key={e.id}>
                    <Link to={`/dashboard/audit?entry=${e.id}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-primary-ink">
                      <span className="min-w-0">
                        <span className="font-medium">{e.actorName ?? 'EduBridge'}</span> <span className="text-muted-foreground">{auditPhrase(e.action)}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-subtle">{timeAgo(e.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ShieldCheck} title="No administrative activity yet" className="py-8" />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

function TrendCard({ data }: { data: AnalyticsDTO }) {
  const [key, setKey] = useState<(typeof TRENDS)[number]['key']>('submitted');
  const t = TRENDS.find((x) => x.key === key)!;
  const points = data.trend.map((m) => ({ key: m.month, label: monthLabel(m.month), fullLabel: monthLabel(m.month, true), value: m[key] }));
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const format = t.money ? formatINR : n;
  return (
    <Card>
      <CardHeader title="Last 12 months" description={`${t.title}: ${format(total)} in total.`} />
      <CardBody>
        <div className="mb-5 flex gap-1 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Measure">
          {TRENDS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={key === x.key}
              onClick={() => setKey(x.key)}
              className={cn(
                'cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                key === x.key ? 'bg-sunken font-medium text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {x.title}
            </button>
          ))}
        </div>
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nothing recorded in the last 12 months.</p>
        ) : (
          <ColumnChart data={points} label={t.unit} format={format} />
        )}
      </CardBody>
    </Card>
  );
}

function VolunteerCard({ data }: { data: AnalyticsDTO }) {
  const rows = data.volunteerActivity;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Volunteer verification activity" description="Last 30 days, from the audit log. Admins appear when they verified applications themselves." />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No active volunteers" text="Approved volunteers appear here." className="py-8" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-medium sm:px-6">Name</th>
                <th className="px-5 py-3 text-right font-medium">Applications started</th>
                <th className="px-5 py-3 text-right font-medium">Document checks</th>
                <th className="px-5 py-3 text-right font-medium">Reviews submitted</th>
                <th className="px-5 py-3 font-medium sm:px-6">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 sm:px-6">
                    <Link to={`/dashboard/audit?actorId=${v.id}&category=VERIFICATION`} className="font-medium hover:text-primary-ink hover:underline">
                      {v.name}
                    </Link>
                    {v.role === 'ADMIN' && <span className="ml-1.5 text-[13px] text-subtle">Admin</span>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{n(v.claimed)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{n(v.checks)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{n(v.reviews)}</td>
                  <td className="px-5 py-3 text-muted-foreground sm:px-6">{v.lastActiveAt ? timeAgo(v.lastActiveAt) : 'No activity'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
