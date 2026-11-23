import { Hourglass } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/dashboard/widgets';
import { NAVIGATION } from '@/components/layout/navigation';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';

export default function ComingSoon() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const item = NAVIGATION[user!.role].find((n) => n.to === pathname);
  return (
    <>
      <PageHeader title={item?.label ?? 'Coming soon'} />
      <Card>
        <EmptyState
          icon={item?.icon ?? Hourglass}
          title="Not available yet"
          text={item?.description ?? 'This page will be available in a later release.'}
          className="py-20"
        />
      </Card>
    </>
  );
}
