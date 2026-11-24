import { HeartHandshake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader, Skeleton, Stat } from '@/components/dashboard/widgets';
import { SponsorshipStatusBadge, sponsorshipStatusLine } from '@/components/sponsorship/parts';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { sponsorApi, useLoad } from '@/lib/sponsorship';
import { formatINR, greeting } from '@/lib/utils';

const factors = [
  ['Level of study matches your preference', '30%'],
  ['Type of support matches your preference', '30%'],
  ['Amount fits within your budget', '25%'],
  ['Other preferences you set', '15%'],
];

export default function SponsorHome() {
  const { user } = useAuth();
  const prefs = useLoad(() => sponsorApi.preferences());
  const list = useLoad(() => sponsorApi.sponsorships());
  const p = prefs.data;
  const connected = (list.data ?? []).filter((s) => s.status === 'CONNECTED');
  const recent = connected.slice(0, 5);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user!.fullName.split(' ')[0]}`}
        description="Thank you for choosing to support a student’s education."
        actions={
          p ? (
            <Link to="/dashboard/discover" className={buttonVariants()}>
              Find students
            </Link>
          ) : undefined
        }
      />

      {p && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Students connected" value={String(connected.length)} />
          <Stat label="Promised" value={formatINR(p.committed)} />
          <Stat label="Available to give" value={formatINR(p.available)} hint={`of ${formatINR(p.budget)} budget`} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Your sponsorships"
            action={
              recent.length ? (
                <Link to="/dashboard/sponsorships" className="text-sm text-primary-ink hover:underline">
                  View all
                </Link>
              ) : undefined
            }
          />
          {prefs.loading && !p ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : !p ? (
            <EmptyState
              icon={HeartHandshake}
              title="Start by setting your budget"
              text="Tell us how much you would like to give and which students you would most like to support. We will rank approved students for you."
              action={
                <Link to="/dashboard/preferences" className={buttonVariants()}>
                  Set preferences
                </Link>
              }
            />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title="No sponsorships yet"
              text="Browse approved students that match your preferences and connect with them from their profile."
            />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.student.alias}</span>
                      <SponsorshipStatusBadge status={s.status} />
                    </div>
                    <p className="truncate text-[13px] text-subtle">{sponsorshipStatusLine(s)}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatINR(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="How students are matched" description="Each approved student receives a match score." />
          <CardBody className="py-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {factors.map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-3 text-muted-foreground">{k}</td>
                    <td className="py-3 text-right tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
          <p className="border-t border-border px-5 py-4 text-[13px] leading-relaxed text-subtle sm:px-6">
            You will only ever see an anonymised profile. Names, contact details and documents stay private.
          </p>
        </Card>
      </div>
    </>
  );
}
