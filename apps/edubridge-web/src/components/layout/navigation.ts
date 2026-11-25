import {
  BarChart3,
  ClipboardList,
  FileText,
  Gavel,
  HandCoins,
  HeartHandshake,
  Home,
  ListChecks,
  Sigma,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@edubridge/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Delivery phase for pages that are not built yet. */
  phase?: number;
  description?: string;
}

export const NAVIGATION: Record<Role, NavItem[]> = {
  STUDENT: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/application', label: 'Application', icon: FileText },
    { to: '/dashboard/profile', label: 'Profile', icon: UserRound },
    { to: '/dashboard/sponsorships', label: 'Sponsorship', icon: HeartHandshake },
  ],
  VOLUNTEER: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/queue', label: 'Verification queue', icon: ListChecks },
    { to: '/dashboard/reviewed', label: 'Reviewed', icon: ClipboardList },
  ],
  ADMIN: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/applications', label: 'Applications', icon: FileText },
    { to: '/dashboard/users', label: 'Users', icon: Users },
    { to: '/dashboard/verification', label: 'Verification', icon: ShieldCheck },
    { to: '/dashboard/review', label: 'Decisions', icon: Gavel },
    { to: '/dashboard/model', label: 'Need model', icon: Sigma },
    { to: '/dashboard/sponsorships', label: 'Sponsorships', icon: HandCoins },
    { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/dashboard/audit', label: 'Audit log', icon: ScrollText },
  ],
  SPONSOR: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/discover', label: 'Find students', icon: Search },
    { to: '/dashboard/sponsorships', label: 'My sponsorships', icon: HeartHandshake },
    { to: '/dashboard/preferences', label: 'Preferences', icon: Settings2 },
  ],
};
