import {
  BarChart3,
  ClipboardList,
  FileText,
  FolderOpen,
  HandCoins,
  HeartHandshake,
  Home,
  ListChecks,
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
    { to: '/dashboard/documents', label: 'Documents', icon: FolderOpen },
    { to: '/dashboard/profile', label: 'Profile', icon: UserRound },
    { to: '/dashboard/sponsorships', label: 'Sponsorship', icon: HeartHandshake, phase: 6, description: 'Once you are sponsored, you will see each contribution and how much of your requirement is funded.' },
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
    { to: '/dashboard/sponsorships', label: 'Sponsorships', icon: HandCoins, phase: 6, description: 'Sponsorship commitments and allocations across the platform.' },
    { to: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, phase: 7, description: 'Application, verification and sponsorship trends.' },
    { to: '/dashboard/audit', label: 'Audit log', icon: ScrollText, phase: 7, description: 'A searchable, permanent record of important activity.' },
  ],
  SPONSOR: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/discover', label: 'Find students', icon: Search, phase: 6, description: 'Verified, approved students that match your preferences.' },
    { to: '/dashboard/sponsorships', label: 'My sponsorships', icon: HeartHandshake, phase: 6, description: 'Your contributions, allocations and certificates.' },
    { to: '/dashboard/preferences', label: 'Preferences', icon: Settings2, phase: 6, description: 'Your budget, preferred level of study and type of support.' },
  ],
};
