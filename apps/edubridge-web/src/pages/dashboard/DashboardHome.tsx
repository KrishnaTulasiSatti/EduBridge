import { useAuth } from '@/context/AuthContext';
import StudentHome from '@/pages/student/StudentHome';
import AdminHome from './AdminHome';
import SponsorHome from './SponsorHome';
import VolunteerHome from './VolunteerHome';

export default function DashboardHome() {
  const { user } = useAuth();
  switch (user!.role) {
    case 'ADMIN':
      return <AdminHome />;
    case 'SPONSOR':
      return <SponsorHome />;
    case 'VOLUNTEER':
      return <VolunteerHome />;
    default:
      return <StudentHome />;
  }
}
