import { z } from 'zod';
import type {
  ApplicationDTO,
  ApplicationStatus,
  ApplicationSummaryDTO,
  DocumentStatus,
  DocumentType,
  VerificationCheck,
} from './application';

/* ------------------------------------------------------------- Aadhaar */

// Verhoeff checksum tables. UIDAI uses this algorithm for the last digit of every Aadhaar number.
const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string) {
  if (!/^\d+$/.test(num)) return false;
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = VD[c][VP[i % 8][digits[i]]];
  return c === 0;
}

export const normalizeAadhaar = (v: string) => v.replace(/[\s-]/g, '');

/** Returns an error message, or null if the Aadhaar number is well formed. */
export function aadhaarError(raw: string | undefined): string | null {
  const v = normalizeAadhaar(raw ?? '');
  if (!v) return 'Enter your 12-digit Aadhaar number';
  if (!/^[2-9]\d{11}$/.test(v)) return 'An Aadhaar number has 12 digits and does not start with 0 or 1';
  if (!verhoeffValid(v)) return 'This is not a valid Aadhaar number. Please check the digits.';
  return null;
}

export const maskAadhaar = (last4: string) => `XXXX XXXX ${last4}`;
export const formatAadhaar = (v: string) => normalizeAadhaar(v).replace(/(\d{4})(?=\d)/g, '$1 ');

/* ----------------------------------------------------- Manual checks */

/**
 * AP Seva portal. Searching a citizen's Aadhaar number lists their certificates (income, integrated, EWS)
 * with application numbers and status. Replaces the retired onlineap.meeseva.gov.in address.
 */
export const AP_SEVA_PORTAL_URL = 'https://apseva.ap.gov.in/';

/** An income certificate is valid for 4 years from its date of issue. */
export const INCOME_CERTIFICATE_VALIDITY_YEARS = 4;

export function incomeCertificateExpiry(issueDate: string | Date) {
  const d = new Date(issueDate);
  d.setFullYear(d.getFullYear() + INCOME_CERTIFICATE_VALIDITY_YEARS);
  return d;
}

/** Valid if issued on or before `on` and not yet past its 4-year validity. */
export function incomeCertificateValid(issueDate: string | Date, on = new Date()) {
  const issued = new Date(issueDate);
  if (Number.isNaN(issued.getTime()) || issued > on) return false;
  return incomeCertificateExpiry(issued) >= on;
}

/** Outcomes a reviewer can record. PENDING / PROCESSING are set by the system. */
export const REVIEW_OUTCOMES = ['VERIFIED', 'REVIEW_REQUIRED', 'REJECTED', 'SERVICE_UNAVAILABLE'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];
export const REVIEW_OUTCOME_LABELS: Record<ReviewOutcome, { label: string; help: string }> = {
  VERIFIED: { label: 'Verified', help: 'The details were confirmed with the official source and match the application.' },
  REVIEW_REQUIRED: { label: 'Needs admin review', help: 'Something does not match or is unclear. An administrator should look at it.' },
  REJECTED: { label: 'Rejected', help: 'The document is confirmed invalid, or it does not belong to this student.' },
  SERVICE_UNAVAILABLE: { label: 'Source unavailable', help: 'The portal or the institution could not be reached. Try again later.' },
};
/** Statuses that count as a completed check when the volunteer submits the review. */
export const FINAL_DOCUMENT_STATUSES: DocumentStatus[] = ['VERIFIED', 'REVIEW_REQUIRED', 'REJECTED'];

export const CONTACT_METHODS = ['PHONE', 'EMAIL', 'IN_PERSON', 'OFFICIAL_PORTAL'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  PHONE: 'Phone call',
  EMAIL: 'Email',
  IN_PERSON: 'In person',
  OFFICIAL_PORTAL: 'Institution’s verification portal',
};

const note = z.string().trim().min(1, 'Add a note explaining what you checked').max(1000);
const outcome = z.enum(REVIEW_OUTCOMES, { error: 'Choose a result' });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date');

export const incomeReviewSchema = z.object({
  type: z.literal('INCOME_CERTIFICATE'),
  outcome,
  note,
  portalCertificateNumber: z.string().trim().max(40).optional().or(z.literal('')),
  holderName: z.string().trim().max(120).optional().or(z.literal('')),
  annualIncome: z.number().int().min(0).max(1_00_00_000).optional(),
  issueDate: isoDate.optional().or(z.literal('')),
});

export const collegeIdReviewSchema = z.object({
  type: z.literal('COLLEGE_ID'),
  outcome,
  note,
  contactMethod: z.enum(CONTACT_METHODS).optional(),
  contactedAt: isoDate.optional().or(z.literal('')),
  confirmedBy: z.string().trim().max(120).optional().or(z.literal('')),
  enrolmentConfirmed: z.boolean().optional(),
  nameOnCard: z.string().trim().max(120).optional().or(z.literal('')),
});

export const marksheetReviewSchema = z.object({
  type: z.literal('MARKSHEET'),
  outcome,
  note,
  nameOnDocument: z.string().trim().max(120).optional().or(z.literal('')),
  percentage: z.number().min(0).max(100).optional(),
});

export const feeReceiptReviewSchema = z.object({
  type: z.literal('FEE_RECEIPT'),
  outcome,
  note,
  nameOnReceipt: z.string().trim().max(120).optional().or(z.literal('')),
  amountOnReceipt: z.number().int().min(0).max(1_00_00_000).optional(),
  institutionOnReceipt: z.string().trim().max(150).optional().or(z.literal('')),
});

/** Reviewers must back a "Verified" result with the details they confirmed. */
export const documentReviewSchema = z
  .discriminatedUnion('type', [incomeReviewSchema, collegeIdReviewSchema, marksheetReviewSchema, feeReceiptReviewSchema])
  .superRefine((v, ctx) => {
    if (v.outcome !== 'VERIFIED') return;
    const need = (key: string, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [key], message });
    };
    if (v.type === 'INCOME_CERTIFICATE') {
      need('portalCertificateNumber', !!v.portalCertificateNumber, 'Enter the certificate number shown on the portal');
      need('holderName', !!v.holderName, 'Enter the name shown on the portal');
      need('annualIncome', v.annualIncome !== undefined, 'Enter the annual income shown on the portal');
      need('issueDate', !!v.issueDate, 'Enter the issue date');
    }
    if (v.type === 'COLLEGE_ID') {
      need('contactMethod', !!v.contactMethod, 'Choose how the institution was contacted');
      need('confirmedBy', !!v.confirmedBy, 'Enter who confirmed the enrolment');
      need('enrolmentConfirmed', v.enrolmentConfirmed === true, 'A college ID can only be verified once enrolment is confirmed');
    }
    if (v.type === 'MARKSHEET') need('nameOnDocument', !!v.nameOnDocument, 'Enter the name printed on the marksheet');
    if (v.type === 'FEE_RECEIPT') {
      need('nameOnReceipt', !!v.nameOnReceipt, 'Enter the student name printed on the receipt');
      need('amountOnReceipt', v.amountOnReceipt !== undefined, 'Enter the amount printed on the receipt');
    }
  });
export type DocumentReviewInput = z.input<typeof documentReviewSchema>;

export const RECOMMENDATIONS = ['RECOMMEND', 'NEEDS_ADMIN_ATTENTION', 'NOT_RECOMMENDED'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, { label: string; help: string }> = {
  RECOMMEND: { label: 'Recommend for assessment', help: 'Documents are genuine and consistent with the application.' },
  NEEDS_ADMIN_ATTENTION: { label: 'Needs admin attention', help: 'Some details could not be confirmed or do not match.' },
  NOT_RECOMMENDED: { label: 'Not recommended', help: 'Documents are invalid or the application appears inaccurate.' },
};

export const volunteerReviewSchema = z.object({
  recommendation: z.enum(RECOMMENDATIONS, { error: 'Choose a recommendation' }),
  summary: z.string().trim().min(1, 'Write a summary for the administrator').max(2000),
});
export type VolunteerReviewInput = z.infer<typeof volunteerReviewSchema>;

/* ---------------------------------------------------------------- DTOs */

export interface PersonRef {
  id: string;
  name: string;
  role?: string;
}

/** A manual check recorded by a volunteer or administrator. */
export interface DocumentReviewDTO {
  outcome: ReviewOutcome;
  method: 'AP_SEVA_PORTAL' | 'INSTITUTION_CONFIRMATION' | 'DOCUMENT_INSPECTION';
  note: string;
  recorded: Record<string, string | number | boolean>;
  checks: VerificationCheck[];
  by: PersonRef;
  at: string;
}

export interface InstitutionCheckDTO {
  /** REGISTERED: found in the EduVault issuer registry. NOT_FOUND: not registered. UNAVAILABLE: registry not reachable. */
  result: 'REGISTERED' | 'NOT_FOUND' | 'UNAVAILABLE';
  entered: { institutionName?: string; university?: string };
  match?: { institutionId: string; name: string; university: string; code: string; status: string };
}

/** Automatic college ID check: is this roll number enrolled at the college, per the college's own EduVault records? */
export interface EnrolmentCheckDTO {
  result: 'ENROLLED' | 'NOT_ENROLLED' | 'INSTITUTION_NOT_REGISTERED' | 'UNAVAILABLE';
  checkedAt: string;
  rollNumber?: string;
  institution?: { name: string; code: string };
  record?: { fullName: string; programme: string; admissionYear: number };
  checks: VerificationCheck[];
  summary: string;
}

export interface Inconsistency {
  document?: DocumentType;
  field: string;
  application?: string;
  found: string;
  severity: 'warning' | 'info';
}

export interface VolunteerReviewDTO extends VolunteerReviewInput {
  by: PersonRef;
  at: string;
}

export interface VerificationDetailDTO {
  application: ApplicationDTO;
  student: { id: string; name: string; email: string; phone?: string };
  assignee?: PersonRef & { claimedAt: string };
  canEdit: boolean;
  institutionCheck: InstitutionCheckDTO;
  inconsistencies: Inconsistency[];
  volunteerReview?: VolunteerReviewDTO;
  /** Document ID → latest manual check. */
  reviews: Record<string, DocumentReviewDTO>;
}

export interface QueueItemDTO extends ApplicationSummaryDTO {
  assignee?: PersonRef;
  claimedAt?: string;
  documents: { type: DocumentType; status: DocumentStatus }[];
  recommendation?: Recommendation;
  reviewedAt?: string;
}

export type QueueScope = 'available' | 'mine' | 'reviewed' | 'all';

export interface VerificationStatsDTO {
  available: number;
  mine: number;
  reviewedByMe: number;
  underVerification: number;
}

export const VERIFICATION_STAGE: ApplicationStatus[] = ['SUBMITTED', 'UNDER_VERIFICATION'];
