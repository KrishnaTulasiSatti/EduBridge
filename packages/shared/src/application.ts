import { z } from 'zod';
import type { Decision } from './assessment';
import type { DocumentReviewDTO, EnrolmentCheckDTO } from './verification';

/* ------------------------------------------------------------------ Enums */

export const GENDERS = ['FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

export const EDUCATION_LEVELS = ['DIPLOMA', 'UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORAL'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  DIPLOMA: 'Diploma',
  UNDERGRADUATE: 'Undergraduate',
  POSTGRADUATE: 'Postgraduate',
  DOCTORAL: 'Doctoral',
};

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

export const SPECIAL_CIRCUMSTANCES = [
  'SINGLE_PARENT',
  'ORPHAN',
  'FIRST_GENERATION_LEARNER',
  'DISABILITY_IN_FAMILY',
  'MAJOR_MEDICAL_EXPENSES',
  'LOSS_OF_INCOME',
] as const;
export type SpecialCircumstance = (typeof SPECIAL_CIRCUMSTANCES)[number];
export const SPECIAL_CIRCUMSTANCE_LABELS: Record<SpecialCircumstance, string> = {
  SINGLE_PARENT: 'Single-parent family',
  ORPHAN: 'Lost one or both parents',
  FIRST_GENERATION_LEARNER: 'First in family to attend college',
  DISABILITY_IN_FAMILY: 'Disability in the family',
  MAJOR_MEDICAL_EXPENSES: 'Major ongoing medical expenses',
  LOSS_OF_INCOME: 'Recent loss of family income',
};

export const EXPENSE_KEYS = ['tuition', 'hostel', 'books', 'exam', 'transport', 'other'] as const;
export type ExpenseKey = (typeof EXPENSE_KEYS)[number];
export const EXPENSE_LABELS: Record<ExpenseKey, string> = {
  tuition: 'Tuition fee',
  hostel: 'Hostel & accommodation',
  books: 'Books & materials',
  exam: 'Examination fee',
  transport: 'Transport',
  other: 'Other education costs',
};

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'VOLUNTEER_REVIEWED',
  'ASSESSED',
  'APPROVED',
  'ON_HOLD',
  'REJECTED',
  'PARTIALLY_FUNDED',
  'FULLY_FUNDED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_VERIFICATION: 'Under verification',
  VOLUNTEER_REVIEWED: 'Volunteer reviewed',
  ASSESSED: 'Assessed',
  APPROVED: 'Approved',
  ON_HOLD: 'On hold',
  REJECTED: 'Not approved',
  PARTIALLY_FUNDED: 'Partly supported',
  FULLY_FUNDED: 'Fully supported',
};

export const DOCUMENT_TYPES = ['MARKSHEET', 'INCOME_CERTIFICATE', 'COLLEGE_ID'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  MARKSHEET: 'Latest academic marksheet',
  INCOME_CERTIFICATE: 'Income certificate',
  COLLEGE_ID: 'College ID card',
};

export const DOCUMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'VERIFIED',
  'REVIEW_REQUIRED',
  'REJECTED',
  'SERVICE_UNAVAILABLE',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING: 'Awaiting verification',
  PROCESSING: 'Verification in progress',
  VERIFIED: 'Verified',
  REVIEW_REQUIRED: 'Needs review',
  REJECTED: 'Rejected',
  SERVICE_UNAVAILABLE: 'Service unavailable',
};

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/* ---------------------------------------------------------------- Helpers */

const MAX_AMOUNT = 1_00_00_000; // ₹1 crore — sanity bound
const money = (label: string) =>
  z
    .number({ error: `Enter the ${label}` })
    .int('Use whole rupees')
    .min(0, 'Cannot be negative')
    .max(MAX_AMOUNT, 'This amount looks too large');

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `At most ${max} characters`);

function ageOn(dob: Date, on = new Date()) {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

/* -------------------------------------------------------- Profile sections */

export const personalBase = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
  gender: z.enum(GENDERS, { error: 'Select an option' }),
  addressLine: text(5, 200, 'Enter your address'),
  city: text(2, 80, 'Enter your city or town'),
  district: text(2, 80, 'Enter your district'),
  state: z.enum(INDIAN_STATES, { error: 'Select your state' }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
});
export const personalSchema = personalBase.superRefine((v, ctx) => {
  const dob = new Date(v.dateOfBirth);
  const age = Number.isNaN(dob.getTime()) ? -1 : ageOn(dob);
  if (age < 14 || age > 45) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Age must be between 14 and 45' });
});
export type PersonalDetails = z.infer<typeof personalBase>;

export const educationBase = z.object({
  institutionName: text(3, 150, 'Enter your college or institution'),
  university: text(3, 150, 'Enter your university or board'),
  level: z.enum(EDUCATION_LEVELS, { error: 'Select your level of study' }),
  course: text(2, 80, 'Enter your course, e.g. B.Tech'),
  specialization: z.string().trim().max(80).optional().or(z.literal('')),
  currentYear: z.number({ error: 'Select your current year' }).int().min(1).max(6),
  durationYears: z.number({ error: 'Select course duration' }).int().min(1).max(6),
  rollNumber: text(3, 30, 'Enter your roll or registration number'),
  lastExamPercentage: z.number({ error: 'Enter your last exam percentage' }).min(0).max(100, 'Must be 100 or less'),
});
export const educationSchema = educationBase.superRefine((v, ctx) => {
  if (v.currentYear > v.durationYears)
    ctx.addIssue({ code: 'custom', path: ['currentYear'], message: 'Current year cannot exceed course duration' });
});
export type EducationDetails = z.infer<typeof educationBase>;

/* ---------------------------------------------------- Application sections */

export const familyBase = z.object({
  familyMembers: z.number({ error: 'Enter the number of family members' }).int().min(1, 'At least 1').max(20),
  earningMembers: z.number({ error: 'Enter the number of earning members' }).int().min(0).max(20),
  dependentsStudying: z.number({ error: 'Enter how many are studying' }).int().min(1, 'Include yourself').max(20),
  annualFamilyIncome: money('annual family income'),
  primaryEarnerOccupation: text(2, 80, 'Enter the occupation'),
  circumstances: z.array(z.enum(SPECIAL_CIRCUMSTANCES)).max(SPECIAL_CIRCUMSTANCES.length),
  circumstancesNote: z.string().trim().max(1000, 'At most 1000 characters').optional().or(z.literal('')),
});
export const familySchema = familyBase.superRefine((v, ctx) => {
  if (v.earningMembers > v.familyMembers)
    ctx.addIssue({ code: 'custom', path: ['earningMembers'], message: 'Cannot exceed family members' });
  if (v.dependentsStudying > v.familyMembers)
    ctx.addIssue({ code: 'custom', path: ['dependentsStudying'], message: 'Cannot exceed family members' });
});
export type FamilyDetails = z.infer<typeof familyBase>;

export const supportBase = z.object({
  expenses: z.object({
    tuition: money('tuition fee'),
    hostel: money('hostel cost'),
    books: money('books cost'),
    exam: money('exam fee'),
    transport: money('transport cost'),
    other: money('other costs'),
  }),
  existingAid: money('existing aid amount'),
  existingAidSource: z.string().trim().max(150).optional().or(z.literal('')),
  requestedAmount: money('amount requested').min(1000, 'Request at least ₹1,000'),
  statement: text(1, 2000, 'Tell us why you need this support'),
});
export const totalExpenses = (e: Partial<Record<ExpenseKey, number>> | undefined) =>
  EXPENSE_KEYS.reduce((sum, k) => sum + (Number.isFinite(e?.[k]) ? (e![k] as number) : 0), 0);

export const supportSchema = supportBase.superRefine((v, ctx) => {
  const total = totalExpenses(v.expenses);
  if (total <= 0) ctx.addIssue({ code: 'custom', path: ['expenses', 'tuition'], message: 'Enter at least one expense' });
  if (v.existingAid > 0 && !v.existingAidSource)
    ctx.addIssue({ code: 'custom', path: ['existingAidSource'], message: 'Tell us where this aid comes from' });
  const gap = total - v.existingAid;
  if (v.requestedAmount > gap)
    ctx.addIssue({
      code: 'custom',
      path: ['requestedAmount'],
      message: `Cannot exceed your remaining need of ₹${Math.max(gap, 0).toLocaleString('en-IN')}`,
    });
});
export type SupportRequest = z.infer<typeof supportBase>;

export const documentMetaSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  certificateNumber: z.string().trim().max(40).optional(),
  rollNumber: z.string().trim().max(30).optional(),
  /** Income certificate only: used by reviewers to find the certificate on the AP Seva portal. */
  aadhaarNumber: z.string().trim().max(20).optional(),
});

export const submitSchema = z.object({
  declaration: z.literal(true, { error: 'Please confirm the declaration' }),
  consentToVerify: z.literal(true, { error: 'Verification consent is required' }),
});

/* --------------------------------------------------------------- DTO types */

export interface StudentProfileDTO {
  personal: Partial<PersonalDetails>;
  education: Partial<EducationDetails>;
  updatedAt?: string;
}

export type DocumentSource = 'UPLOAD' | 'EDUVAULT';

/** A comparison between what the student entered and what the verified document says. */
export interface VerificationCheck {
  field: string;
  application?: string;
  document: string;
  match: boolean;
}

/** Result of checking an EduVault marksheet's digital signature and contents. */
export interface DocumentVerificationDTO {
  method: 'EDUVAULT_SIGNATURE';
  verifiedAt: string;
  consentReference: string;
  documentId: string;
  documentStatus: 'ISSUED' | 'REVOKED' | string;
  issuer: { institutionId: string; name: string; university: string; code: string; registryStatus?: string };
  keyId: string;
  keyFingerprint?: string;
  documentHash: string;
  hashMatches: boolean;
  /** The received PDF is byte-for-byte the file that was signed. */
  fileHashMatches: boolean;
  signatureValid: boolean;
  issuerTrusted: boolean;
  checks: VerificationCheck[];
  summary: string;
  marksheet: {
    studentName: string;
    rollNumber: string;
    programme: string;
    semester: number;
    academicYear: string;
    examSession: string;
    result: string;
    percentage?: number;
    fileSha256: string;
    fileSize: number;
    issuedAt: string;
    testData: boolean;
  };
}

export interface DocumentDTO {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  source: DocumentSource;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  certificateNumber?: string;
  rollNumber?: string;
  /** Last 4 digits only. The full number is stored encrypted and shown only to the assigned reviewer. */
  aadhaarLast4?: string;
  uploadedAt: string;
  verification?: DocumentVerificationDTO;
  /** Latest manual check by a volunteer or administrator. */
  review?: DocumentReviewDTO;
  /** College ID: automatic enrolment check against the college's EduVault records. */
  enrolmentCheck?: EnrolmentCheckDTO;
}

export interface StatusEvent {
  status: ApplicationStatus;
  at: string;
  note?: string;
}

export interface ApplicationDTO {
  id: string;
  applicationNumber: string;
  academicYear: string;
  status: ApplicationStatus;
  family: Partial<FamilyDetails>;
  support: Partial<SupportRequest> & { expenses?: Partial<SupportRequest['expenses']> };
  documents: DocumentDTO[];
  history: StatusEvent[];
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** The administrator's decision as the student sees it (no internal reasons or scores). */
  outcome?: { decision: Decision; approvedAmount?: number; message?: string; decidedAt: string };
  /** Profile captured at submission time (present once submitted). */
  profileSnapshot?: StudentProfileDTO;
}

export interface ApplicationSummaryDTO {
  id: string;
  applicationNumber: string;
  academicYear: string;
  status: ApplicationStatus;
  studentName: string;
  institutionName?: string;
  course?: string;
  level?: EducationLevel;
  state?: string;
  requestedAmount?: number;
  documentsUploaded: number;
  submittedAt?: string;
}

/** Academic year runs June → May, e.g. "2026-27". */
export function currentAcademicYear(d = new Date()) {
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
