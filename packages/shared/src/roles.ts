export const ROLES = ['STUDENT', 'VOLUNTEER', 'ADMIN', 'SPONSOR'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a person may choose when self-registering. Volunteers apply and are activated by an admin; admins are seeded. */
export const SELF_REGISTER_ROLES = ['STUDENT', 'SPONSOR', 'VOLUNTEER'] as const;
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  VOLUNTEER: 'Volunteer',
  ADMIN: 'Administrator',
  SPONSOR: 'Sponsor',
};
