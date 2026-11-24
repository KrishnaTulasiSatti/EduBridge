import { z } from 'zod';
import type { InstitutionStatus } from './roles';

/* ------------------------------------------------------- Student records */

export const studentRecordSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the student’s full name').max(80),
  rollNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9/-]{3,30}$/, 'Use 3–30 letters, numbers, / or -'),
  programme: z.string().trim().min(2, 'Enter the programme, e.g. B.Tech Computer Science').max(120),
  admissionYear: z.number({ error: 'Enter the year of admission' }).int().min(2000).max(2100),
  /** The activation code is emailed here. */
  email: z.string().trim().toLowerCase().email('Enter the student’s email address').max(120),
});
export type StudentRecordInput = z.infer<typeof studentRecordSchema>;

/** A new code for an unlinked record. The email may be added or corrected at the same time. */
export const activationCodeRequestSchema = z.object({ email: studentRecordSchema.shape.email });
export type ActivationCodeRequest = z.infer<typeof activationCodeRequestSchema>;

/** Returned whenever a code is created. The code is shown once, in case the email does not arrive. */
export interface ActivationCodeResult {
  activationCode: string;
  email: string;
  emailed: boolean;
}

export interface StudentRecordDTO extends Omit<StudentRecordInput, 'email'> {
  /** Missing on records enrolled before emails were added. */
  email?: string;
  id: string;
  linked: boolean;
  linkedAt?: string;
  marksheets: number;
  createdAt: string;
}

/* ------------------------------------------------------------ Marksheets */

export const MARKSHEET_RESULTS = ['PASS', 'FAIL'] as const;
export type MarksheetResult = (typeof MARKSHEET_RESULTS)[number];
export const MARKSHEET_RESULT_LABELS: Record<MarksheetResult, string> = { PASS: 'Pass', FAIL: 'Fail' };

export const MARKSHEET_STATUSES = ['DRAFT', 'ISSUED', 'REVOKED'] as const;
export type MarksheetStatus = (typeof MARKSHEET_STATUSES)[number];
export const MARKSHEET_STATUS_LABELS: Record<MarksheetStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  REVOKED: 'Revoked',
};

export const academicYearRegex = /^\d{4}-\d{2}$/;

/** The marksheet itself is a PDF uploaded by the institution. */
export const MARKSHEET_FILE_TYPES = ['application/pdf'] as const;
export const MAX_MARKSHEET_BYTES = 5 * 1024 * 1024;

/** Optional number from a form field: '' or missing becomes undefined. */
const optionalPercentage = z.preprocess(
  (v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? undefined : Number(v)),
  z.number({ error: 'Enter a number' }).min(0, 'Cannot be negative').max(100, 'Must be 100 or less').optional(),
);

/**
 * Details entered alongside the uploaded PDF. Sent as multipart form fields, so numbers arrive as strings.
 * Subject-wise marks are not entered — they are in the PDF itself.
 */
export const marksheetSchema = z.object({
  studentRecordId: z.string().min(1, 'Select a student'),
  semester: z.coerce.number({ error: 'Select the semester' }).int().min(1, 'Select the semester').max(12),
  academicYear: z.string().trim().regex(academicYearRegex, 'Use the format 2025-26'),
  examSession: z.string().trim().min(3, 'Enter the exam session, e.g. November 2025').max(40),
  result: z.enum(MARKSHEET_RESULTS, { error: 'Select the result' }),
  percentage: optionalPercentage,
});
export type MarksheetInput = z.input<typeof marksheetSchema>;
export type MarksheetFields = z.output<typeof marksheetSchema>;

export interface MarksheetFileDTO {
  name: string;
  size: number;
  sha256: string;
  mimeType: 'application/pdf';
}

/**
 * The exact content that is hashed and signed when a marksheet is issued.
 * Anyone holding the issuer's public key can check that none of these fields changed.
 */
export interface MarksheetPayload {
  schema: 'eduvault.marksheet/v2';
  documentId: string;
  issuer: { institutionId: string; name: string; university: string; code: string };
  student: { name: string; rollNumber: string };
  programme: string;
  semester: number;
  academicYear: string;
  examSession: string;
  result: MarksheetResult;
  /** Overall percentage as stated on the marksheet, if the institution entered it. */
  percentage?: number;
  /** The signed PDF: its SHA-256 is part of the signed content, so the file cannot be swapped or edited. */
  file: { sha256: string; size: number; mimeType: 'application/pdf' };
  issuedAt: string;
  /** All EduVault records are fictional test data. */
  testData: true;
}

export interface SignatureDTO {
  algorithm: 'Ed25519';
  hashAlgorithm: 'SHA-256';
  documentHash: string;
  signature: string;
  keyId: string;
  keyFingerprint: string;
}

export interface MarksheetDTO {
  id: string;
  documentId?: string;
  status: MarksheetStatus;
  studentRecordId: string;
  studentName: string;
  rollNumber: string;
  programme: string;
  semester: number;
  academicYear: string;
  examSession: string;
  percentage?: number;
  file?: MarksheetFileDTO;
  result: MarksheetResult;
  institution: { id: string; name: string; university: string; code: string };
  signature?: SignatureDTO;
  issuedAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
}

/* ----------------------------------------------------------- Institutions */

export interface InstitutionDTO {
  id: string;
  name: string;
  university: string;
  code: string;
  city: string;
  state: string;
  website?: string;
  status: InstitutionStatus;
  contact?: { name: string; designation?: string; email: string };
  signingKey?: { keyId: string; fingerprint: string; createdAt: string };
  approvedAt?: string;
  createdAt: string;
  counts?: { students: number; issued: number };
}

/* -------------------------------------------------------------- Consents */

export const CONSENT_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'REDEEMED', 'EXPIRED'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  PENDING: 'Awaiting your decision',
  APPROVED: 'Approved, not yet collected',
  DENIED: 'Declined',
  REDEEMED: 'Shared',
  EXPIRED: 'Expired',
};

/** Fields of a marksheet that a partner receives when a student shares it. */
export const SHARED_MARKSHEET_FIELDS = [
  'Your name and roll number',
  'Institution and university',
  'Programme, semester and academic year',
  'Result and overall percentage',
  'The marksheet PDF uploaded by your institution',
  'The institution’s digital signature',
] as const;

export interface ConsentRequestDTO {
  id: string;
  status: ConsentStatus;
  partner: { id: string; name: string; description: string };
  documentType: 'MARKSHEET';
  purpose: string;
  reference?: string;
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
  redeemedAt?: string;
  consentReference?: string;
  /** Marksheet the student chose to share, once decided. */
  marksheet?: { id: string; documentId?: string; semester: number; academicYear: string; institutionName: string };
}

/* ------------------------------------------------- Partner (server-to-server) */

export const accessRequestSchema = z.object({
  documentType: z.literal('MARKSHEET'),
  purpose: z.string().trim().min(10).max(300),
  reference: z.string().trim().max(60).optional(),
  redirectUri: z.string().url(),
  state: z.string().min(16).max(200),
});
export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

export interface AccessRequestResponse {
  requestId: string;
  consentUrl: string;
  expiresAt: string;
}

export const redeemSchema = z.object({ code: z.string().min(20).max(200) });

export interface RedeemResponse {
  consentReference: string;
  sharedAt: string;
  document: {
    type: 'MARKSHEET';
    status: MarksheetStatus;
    payload: MarksheetPayload;
    signature: SignatureDTO;
    /** The signed PDF, base64-encoded. Its SHA-256 must equal payload.file.sha256. */
    fileBase64: string;
  };
}

/** Partner asks: "is a student with this roll number enrolled at this institution?" Exact roll number only, no searching. */
export const enrolmentCheckSchema = z.object({
  institutionId: z.string().trim().min(1).max(64),
  rollNumber: z.string().trim().min(1).max(30),
});
export type EnrolmentCheckInput = z.infer<typeof enrolmentCheckSchema>;

export interface EnrolmentCheckResponse {
  institution: { institutionId: string; name: string; university: string; code: string; status: InstitutionStatus };
  enrolled: boolean;
  /** Present only when enrolled: the institution's own record for that roll number. */
  student?: { fullName: string; rollNumber: string; programme: string; admissionYear: number };
  checkedAt: string;
}

export interface IssuerRegistryEntry {
  institutionId: string;
  name: string;
  university: string;
  code: string;
  status: InstitutionStatus;
  keys: { keyId: string; algorithm: 'Ed25519'; publicKeyPem: string; fingerprint: string; createdAt: string }[];
}

/* -------------------------------------------------------------- Helpers */

/**
 * Deterministic JSON: object keys sorted at every level, `undefined` dropped.
 * The signer and the verifier must produce byte-identical output for the same content.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Academic year runs June → May, e.g. "2026-27". */
export function currentAcademicYear(d = new Date()) {
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
