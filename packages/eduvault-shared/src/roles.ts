export const VAULT_ROLES = ['STUDENT', 'ISSUER', 'ADMIN'] as const;
export type VaultRole = (typeof VAULT_ROLES)[number];

export const VAULT_ROLE_LABELS: Record<VaultRole, string> = {
  STUDENT: 'Student',
  ISSUER: 'Institution',
  ADMIN: 'EduVault administrator',
};

export const VAULT_ACCOUNT_STATUSES = ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'] as const;
export type VaultAccountStatus = (typeof VAULT_ACCOUNT_STATUSES)[number];

export const INSTITUTION_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];

export const INSTITUTION_STATUS_LABELS: Record<InstitutionStatus, string> = {
  PENDING: 'Awaiting approval',
  ACTIVE: 'Trusted issuer',
  SUSPENDED: 'Suspended',
  REJECTED: 'Not approved',
};
