import { Building2, FileCheck2, FileText, History, Home, Share2, Users, type LucideIcon } from 'lucide-react';
import type { VaultRole } from '@eduvault/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAVIGATION: Record<VaultRole, NavItem[]> = {
  STUDENT: [
    { to: '/dashboard', label: 'My documents', icon: FileText },
    { to: '/dashboard/sharing', label: 'Sharing history', icon: Share2 },
  ],
  ISSUER: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/students', label: 'Students', icon: Users },
    { to: '/dashboard/marksheets', label: 'Marksheets', icon: FileCheck2 },
  ],
  ADMIN: [
    { to: '/dashboard', label: 'Overview', icon: Home },
    { to: '/dashboard/institutions', label: 'Institutions', icon: Building2 },
    { to: '/dashboard/accounts', label: 'Accounts', icon: Users },
    { to: '/dashboard/activity', label: 'Activity', icon: History },
  ],
};
