import type { ApplicationStatus } from './application';
import type { NeedLevel } from './assessment';

/* ----------------------------------------------------------- Analytics */

export interface AnalyticsDTO {
  generatedAt: string;
  users: { students: number; volunteers: number; sponsors: number; admins: number; newStudentsLast30Days: number };
  applications: {
    byStatus: Record<ApplicationStatus, number>;
    drafts: number;
    /** Every application that has left draft. */
    submitted: number;
    awaitingVerification: number;
    underVerification: number;
    awaitingDecision: number;
    /** Approved, including those already partly or fully funded. */
    approved: number;
    rejected: number;
    onHold: number;
  };
  documents: { awaitingReview: number; byStatus: Record<string, number> };
  approvedByNeedLevel: Record<NeedLevel, number>;
  sponsorship: {
    /** Approved and not yet fully funded. */
    eligibleStudents: number;
    visibleToSponsors: number;
    fullyFunded: number;
    approvedAmount: number;
    pledgedAmount: number;
    confirmedAmount: number;
    /** Approved amount not yet covered by a pledge or a confirmed sponsorship. */
    remainingAmount: number;
    sponsors: number;
    sponsorBudget: number;
    sponsorCommitted: number;
    pledges: { count: number; amount: number };
    confirmed: { count: number; amount: number };
    cancelled: { count: number; amount: number };
  };
  /** Last 12 calendar months (UTC), oldest first. */
  trend: { month: string; submitted: number; decided: number; confirmedAmount: number }[];
  /** Last 30 days. */
  volunteerActivity: {
    id: string;
    name: string;
    role: 'VOLUNTEER' | 'ADMIN';
    claimed: number;
    checks: number;
    reviews: number;
    lastActiveAt: string | null;
  }[];
  securityLast30Days: Record<string, number>;
  recentAdminActivity: {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
}

/* ----------------------------------------------------------- Audit log */

export interface AuditEntryDTO {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actor: { id: string; name: string; email: string } | null;
  actorRole: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const AUDIT_CATEGORIES = ['ACCOUNTS', 'SECURITY', 'APPLICATIONS', 'VERIFICATION', 'DECISIONS', 'SPONSORSHIP', 'PLATFORM'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  ACCOUNTS: 'Accounts',
  SECURITY: 'Security',
  APPLICATIONS: 'Applications',
  VERIFICATION: 'Verification',
  DECISIONS: 'Decisions',
  SPONSORSHIP: 'Sponsorship',
  PLATFORM: 'Platform',
};

/** Every audited action: a short title, the phrase used in activity sentences, and its category. */
export const AUDIT_ACTION_INFO: Record<string, { title: string; phrase: string; category: AuditCategory }> = {
  USER_REGISTERED: { title: 'Account created', phrase: 'created an account', category: 'ACCOUNTS' },
  LOGIN_SUCCESS: { title: 'Signed in', phrase: 'signed in', category: 'ACCOUNTS' },
  LOGOUT: { title: 'Signed out', phrase: 'signed out', category: 'ACCOUNTS' },
  USER_STATUS_CHANGED: { title: 'Account status changed', phrase: 'changed an account status', category: 'ACCOUNTS' },
  PROFILE_UPDATED: { title: 'Profile updated', phrase: 'updated a profile', category: 'ACCOUNTS' },
  SPONSOR_PAN_OTP_SENT: { title: 'Sponsor PAN code sent', phrase: 'requested a PAN verification code', category: 'ACCOUNTS' },
  SPONSOR_PAN_VERIFIED: { title: 'Sponsor PAN verified', phrase: 'verified a PAN', category: 'ACCOUNTS' },
  SPONSOR_PAN_CHECK_FAILED: { title: 'Sponsor PAN check failed', phrase: 'failed a PAN check', category: 'SECURITY' },
  LOGIN_FAILED: { title: 'Failed sign-in', phrase: 'had a failed sign-in attempt', category: 'SECURITY' },
  ACCOUNT_LOCKED: { title: 'Account locked', phrase: 'was locked after repeated failed sign-ins', category: 'SECURITY' },
  REFRESH_TOKEN_REUSE: { title: 'Session token reused', phrase: 'triggered a session security alert', category: 'SECURITY' },
  AADHAAR_VIEWED: { title: 'Aadhaar number shown', phrase: 'viewed a student’s Aadhaar number', category: 'SECURITY' },
  DOCUMENT_VIEWED: { title: 'Student document opened', phrase: 'viewed a student document', category: 'SECURITY' },
  APPLICATION_CREATED: { title: 'Application started', phrase: 'started an application', category: 'APPLICATIONS' },
  APPLICATION_SUBMITTED: { title: 'Application submitted', phrase: 'submitted an application', category: 'APPLICATIONS' },
  DOCUMENT_UPLOADED: { title: 'Document uploaded', phrase: 'uploaded a document', category: 'APPLICATIONS' },
  DOCUMENT_DELETED: { title: 'Document removed', phrase: 'removed a document', category: 'APPLICATIONS' },
  EDUVAULT_REQUESTED: { title: 'EduVault consent requested', phrase: 'asked EduVault for a marksheet', category: 'APPLICATIONS' },
  EDUVAULT_IMPORTED: { title: 'Marksheet imported from EduVault', phrase: 'imported a marksheet from EduVault', category: 'APPLICATIONS' },
  EDUVAULT_DECLINED: { title: 'EduVault consent declined', phrase: 'declined EduVault sharing', category: 'APPLICATIONS' },
  VERIFICATION_CLAIMED: { title: 'Verification started', phrase: 'started verifying an application', category: 'VERIFICATION' },
  VERIFICATION_RELEASED: { title: 'Returned to queue', phrase: 'returned an application to the queue', category: 'VERIFICATION' },
  DOCUMENT_REVIEWED: { title: 'Document checked', phrase: 'recorded a document check', category: 'VERIFICATION' },
  ENROLMENT_CHECKED: { title: 'Enrolment checked on EduVault', phrase: 'checked a college enrolment on EduVault', category: 'VERIFICATION' },
  VOLUNTEER_REVIEW_SUBMITTED: { title: 'Volunteer review submitted', phrase: 'submitted a volunteer review', category: 'VERIFICATION' },
  ASSESSMENT_RUN: { title: 'Need assessment run', phrase: 'ran a need assessment', category: 'DECISIONS' },
  APPLICATION_DECIDED: { title: 'Eligibility decision', phrase: 'recorded an eligibility decision', category: 'DECISIONS' },
  MODEL_TRAINED: { title: 'Need model trained', phrase: 'trained the need model', category: 'DECISIONS' },
  SPONSOR_PREFERENCES_UPDATED: { title: 'Sponsor preferences saved', phrase: 'updated sponsor preferences', category: 'SPONSORSHIP' },
  SPONSOR_VISIBILITY_CHANGED: { title: 'Sponsor visibility changed', phrase: 'changed whether sponsors can see their profile', category: 'SPONSORSHIP' },
  SPONSORSHIP_PLEDGED: { title: 'Pledge made', phrase: 'pledged a sponsorship', category: 'SPONSORSHIP' },
  BANK_DETAILS_SAVED: { title: 'Bank details saved', phrase: 'saved bank details for sponsorship payments', category: 'SPONSORSHIP' },
  BANK_DETAILS_VIEWED: { title: 'Bank details shown to sponsor', phrase: 'viewed a student’s bank details to send money', category: 'SECURITY' },
  SPONSORSHIP_SENT: { title: 'Money sent by sponsor', phrase: 'marked sponsorship money as sent', category: 'SPONSORSHIP' },
  SPONSORSHIP_NOT_RECEIVED: { title: 'Money reported not received', phrase: 'reported sponsorship money as not received', category: 'SPONSORSHIP' },
  SPONSORSHIP_CONFIRMED: { title: 'Sponsorship confirmed', phrase: 'confirmed a sponsorship', category: 'SPONSORSHIP' },
  SPONSORSHIP_CANCELLED: { title: 'Sponsorship cancelled', phrase: 'cancelled a sponsorship', category: 'SPONSORSHIP' },
  SPONSORSHIP_EXPIRED: { title: 'Pledge expired', phrase: 'pledge expired', category: 'SPONSORSHIP' },
  CERTIFICATE_ISSUED: { title: 'Certificate issued', phrase: 'issued a certificate', category: 'SPONSORSHIP' },
  CERTIFICATE_REVOKED: { title: 'Certificate revoked', phrase: 'revoked a certificate', category: 'SPONSORSHIP' },
  AUDIT_EXPORTED: { title: 'Audit log exported', phrase: 'exported the audit log', category: 'PLATFORM' },
  DOCUMENTS_PURGED: { title: 'Documents deleted (retention)', phrase: 'deleted documents under the retention policy', category: 'PLATFORM' },
};

export const auditActionsIn = (category: AuditCategory) =>
  Object.entries(AUDIT_ACTION_INFO)
    .filter(([, v]) => v.category === category)
    .map(([k]) => k);

export const auditTitle = (action: string) => AUDIT_ACTION_INFO[action]?.title ?? action.toLowerCase().replaceAll('_', ' ');
export const auditPhrase = (action: string) => AUDIT_ACTION_INFO[action]?.phrase ?? action.toLowerCase().replaceAll('_', ' ');
