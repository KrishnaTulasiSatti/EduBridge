import { HeartHandshake } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/dashboard/widgets';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { greeting } from '@/lib/utils';

const factors = [
  ['Level of study matches your preference', '30%'],
  ['Type of support matches your preference', '30%'],
  ['Amount fits within your budget', '25%'],
  ['Other preferences you set', '15%'],
];

export default function SponsorHome() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user!.fullName.split(' ')[0]}`}
        description="Thank you for choosing to support a student’s education."
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Your sponsorships" />
          <EmptyState
            icon={HeartHandshake}
            title="No sponsorships yet"
            text="When students are approved, you will be able to find those that match your preferences and support them from here."
          />
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
