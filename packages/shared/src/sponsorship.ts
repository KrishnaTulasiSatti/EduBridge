import { z } from 'zod';
import {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABELS,
  EXPENSE_KEYS,
  EXPENSE_LABELS,
  INDIAN_STATES,
  SPECIAL_CIRCUMSTANCES,
  SPECIAL_CIRCUMSTANCE_LABELS,
  type EducationLevel,
  type ExpenseKey,
  type SpecialCircumstance,
} from './application';
import type { NeedLevel } from './assessment';

/* ------------------------------------------------------------- Rules */

/** Smallest pledge a sponsor can make. */
export const MIN_PLEDGE = 500;
/** A pledge reserves part of the student's requirement until an administrator confirms the funds were received. */
export const PLEDGE_HOLD_DAYS = 14;

export const SPONSORSHIP_STATUSES = ['PLEDGED', 'CONFIRMED', 'CANCELLED'] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];
export const SPONSORSHIP_STATUS_LABELS: Record<SponsorshipStatus, string> = {
  PLEDGED: 'Pledged',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
};

export const CANCEL_REASONS = ['BY_SPONSOR', 'BY_ADMIN', 'EXPIRED'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  BY_SPONSOR: 'Withdrawn by the sponsor',
  BY_ADMIN: 'Cancelled by an administrator',
  EXPIRED: `Not confirmed within ${PLEDGE_HOLD_DAYS} days`,
};

/* ------------------------------------------------------- Preferences */

const money = z.number({ error: 'Enter an amount' }).int('Use whole rupees').min(0, 'Cannot be negative').max(1_00_00_000, 'This amount looks too large');

export const sponsorPreferencesSchema = z.object({
  /** Name shown to students the sponsor supports (if allowed) and printed on certificates. */
  displayName: z.string().trim().min(1, 'Enter the name to show on certificates').max(80, 'At most 80 characters'),
  showNameToStudents: z.boolean(),
  budget: money.min(MIN_PLEDGE, `At least ₹${MIN_PLEDGE.toLocaleString('en-IN')}`),
  levels: z.array(z.enum(EDUCATION_LEVELS)).max(EDUCATION_LEVELS.length),
  categories: z.array(z.enum(EXPENSE_KEYS)).max(EXPENSE_KEYS.length),
  states: z.array(z.enum(INDIAN_STATES)).max(INDIAN_STATES.length),
  circumstances: z.array(z.enum(SPECIAL_CIRCUMSTANCES)).max(SPECIAL_CIRCUMSTANCES.length),
});
export type SponsorPreferences = z.infer<typeof sponsorPreferencesSchema>;

export interface SponsorProfileDTO extends SponsorPreferences {
  /** Sum of pledged and confirmed sponsorships. */
  committed: number;
  confirmed: number;
  available: number;
  updatedAt: string;
}

/* ----------------------------------------------------- Student consent */

export const sponsorVisibilitySchema = z.object({
  visible: z.boolean(),
  noteToSponsors: z.string().trim().max(600, 'At most 600 characters').optional().or(z.literal('')),
});
export type SponsorVisibilityInput = z.infer<typeof sponsorVisibilitySchema>;

/* ------------------------------------------------------------ Pledge */

export const pledgeSchema = z.object({
  amount: z
    .number({ error: 'Enter an amount' })
    .int('Use whole rupees')
    .min(MIN_PLEDGE, `The smallest pledge is ₹${MIN_PLEDGE.toLocaleString('en-IN')}`)
    .max(1_00_00_000, 'This amount looks too large'),
  messageToStudent: z.string().trim().max(500, 'At most 500 characters').optional().or(z.literal('')),
});
export type PledgeInput = z.infer<typeof pledgeSchema>;

export const confirmSponsorshipSchema = z.object({
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date the funds were received'),
  /** Bank transfer reference, receipt number or similar. */
  reference: z.string().trim().min(1, 'Enter the payment reference').max(80, 'At most 80 characters'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});
export type ConfirmSponsorshipInput = z.infer<typeof confirmSponsorshipSchema>;

export const cancelSponsorshipSchema = z.object({
  reason: z.string().trim().max(500, 'At most 500 characters').optional().or(z.literal('')),
});

/* ---------------------------------------------------------- Matching */

/** What the matching score may use. Private details (name, address, documents, income) are not part of it. */
export interface MatchCandidate {
  level?: EducationLevel;
  state?: string;
  expenses?: Partial<Record<ExpenseKey, number>>;
  circumstances?: SpecialCircumstance[];
  /** Amount still to be covered (approved minus pledged and confirmed). */
  remaining: number;
}

export type MatchFactorKey = 'education' | 'category' | 'budget' | 'preference';

export interface MatchFactor {
  key: MatchFactorKey;
  label: string;
  weight: number;
  /** 0–1 */
  value: number;
  detail: string;
}

export interface MatchResult {
  /** 0–100 */
  score: number;
  factors: MatchFactor[];
}

export const MATCH_WEIGHTS: Record<MatchFactorKey, number> = { education: 0.3, category: 0.3, budget: 0.25, preference: 0.15 };

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * Rule-based match score between a sponsor's preferences and an approved student:
 * 0.30 × education + 0.30 × support category + 0.25 × budget + 0.15 × other preferences.
 * A preference the sponsor left empty counts as "any" and matches fully.
 */
export function matchScore(pref: Pick<SponsorPreferences, 'levels' | 'categories' | 'states' | 'circumstances'>, available: number, c: MatchCandidate): MatchResult {
  // Education level
  let education: MatchFactor;
  if (!pref.levels.length) education = { key: 'education', label: 'Level of study', weight: MATCH_WEIGHTS.education, value: 1, detail: 'You accept any level of study' };
  else {
    const ok = !!c.level && pref.levels.includes(c.level);
    education = {
      key: 'education',
      label: 'Level of study',
      weight: MATCH_WEIGHTS.education,
      value: ok ? 1 : 0,
      detail: c.level ? `${EDUCATION_LEVEL_LABELS[c.level]}${ok ? ', one of your preferred levels' : ', not one of your preferred levels'}` : 'Level not recorded',
    };
  }

  // Support category: the share of the student's costs that falls in the sponsor's preferred categories.
  const costs = EXPENSE_KEYS.map((k) => [k, Math.max(0, c.expenses?.[k] ?? 0)] as const).filter(([, v]) => v > 0);
  const total = costs.reduce((s, [, v]) => s + v, 0);
  let category: MatchFactor;
  if (!pref.categories.length) category = { key: 'category', label: 'Type of support', weight: MATCH_WEIGHTS.category, value: 1, detail: 'You support any type of education cost' };
  else if (total <= 0) category = { key: 'category', label: 'Type of support', weight: MATCH_WEIGHTS.category, value: 0, detail: 'No cost breakdown recorded' };
  else {
    const inPref = costs.filter(([k]) => pref.categories.includes(k));
    const share = inPref.reduce((s, [, v]) => s + v, 0) / total;
    category = {
      key: 'category',
      label: 'Type of support',
      weight: MATCH_WEIGHTS.category,
      value: share,
      detail: inPref.length
        ? `${Math.round(share * 100)}% of costs are ${list(inPref.map(([k]) => EXPENSE_LABELS[k].toLowerCase()))}`
        : 'None of the costs are in your preferred categories',
    };
  }

  // Budget: can the sponsor's remaining budget cover what the student still needs?
  const budgetValue = c.remaining <= 0 ? 0 : Math.min(1, Math.max(0, available) / c.remaining);
  const budget: MatchFactor = {
    key: 'budget',
    label: 'Fits your budget',
    weight: MATCH_WEIGHTS.budget,
    value: budgetValue,
    detail:
      budgetValue >= 1
        ? `Your available ${inr(available)} can cover the remaining ${inr(c.remaining)}`
        : available <= 0
          ? 'You have no budget left to allocate'
          : `Your available ${inr(available)} covers ${Math.round(budgetValue * 100)}% of the remaining ${inr(c.remaining)}`,
  };

  // Other preferences: state and circumstances, averaged over those the sponsor set.
  const parts: { ok: number; text: string }[] = [];
  if (pref.states.length) {
    const ok = !!c.state && pref.states.includes(c.state as (typeof INDIAN_STATES)[number]);
    parts.push({ ok: ok ? 1 : 0, text: ok ? `studies in ${c.state}` : 'outside your preferred states' });
  }
  if (pref.circumstances.length) {
    const hits = (c.circumstances ?? []).filter((x) => pref.circumstances.includes(x));
    parts.push({
      ok: hits.length ? 1 : 0,
      text: hits.length ? list(hits.map((h) => SPECIAL_CIRCUMSTANCE_LABELS[h].toLowerCase())) : 'none of the circumstances you prioritise',
    });
  }
  const prefValue = parts.length ? parts.reduce((s, p) => s + p.ok, 0) / parts.length : 1;
  const preference: MatchFactor = {
    key: 'preference',
    label: 'Other preferences',
    weight: MATCH_WEIGHTS.preference,
    value: prefValue,
    detail: parts.length ? parts.map((p) => p.text).join('; ').replace(/^./, (ch) => ch.toUpperCase()) : 'No other preferences set',
  };

  const factors = [education, category, budget, preference];
  const score = Math.round(factors.reduce((s, f) => s + f.weight * f.value, 0) * 100);
  return { score, factors };
}

/* --------------------------------------------------------------- DTOs */

/** The limited, anonymised profile a sponsor may see. No name, contact details, address, documents or income figures. */
export interface SponsorStudentCardDTO {
  id: string;
  /** Stable pseudonym, e.g. "Student 7KQ2MD". */
  alias: string;
  level?: EducationLevel;
  course?: string;
  specialization?: string;
  currentYear?: number;
  durationYears?: number;
  state?: string;
  lastExamPercentage?: number;
  academicYear: string;
  needLevel: NeedLevel;
  circumstances: SpecialCircumstance[];
  /** Annual cost breakdown (amounts only). */
  expenses: Partial<Record<ExpenseKey, number>>;
  approvedAmount: number;
  pledged: number;
  confirmed: number;
  remaining: number;
  noteToSponsors?: string;
  verifiedDocuments: number;
  approvedAt: string;
  match: MatchResult;
  /** The current sponsor's active sponsorship for this student, if any. */
  mySponsorship?: { id: string; status: SponsorshipStatus; amount: number };
}

export interface CertificateRefDTO {
  number: string;
  /** Unguessable code printed on the certificate. Needed to open the verification page. */
  code: string;
  issuedAt: string;
  revoked: boolean;
}

export interface SponsorshipDTO {
  id: string;
  reference: string;
  status: SponsorshipStatus;
  amount: number;
  academicYear: string;
  createdAt: string;
  expiresAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancelReason?: CancelReason;
  cancelNote?: string;
  messageToStudent?: string;
  /** What each side sees about the other. */
  student: { applicationId: string; alias: string; course?: string; level?: EducationLevel; name?: string; applicationNumber?: string };
  sponsor: { name: string; anonymous: boolean; email?: string };
  /** Payment reference and note are shown to administrators and the sponsor only. */
  confirmation?: { receivedOn: string; reference?: string; note?: string };
  certificate?: CertificateRefDTO;
}

export interface StudentFundingDTO {
  eligible: boolean;
  status: string;
  approvedAmount: number;
  pledged: number;
  confirmed: number;
  remaining: number;
  visible: boolean;
  visibleSince?: string;
  noteToSponsors?: string;
  alias?: string;
  sponsorships: SponsorshipDTO[];
}

export interface SponsorshipOverviewDTO {
  totals: { pledged: number; confirmed: number; remaining: number; eligibleStudents: number; visibleStudents: number; fullyFunded: number; sponsors: number };
  counts: Record<SponsorshipStatus, number>;
}

/** Public certificate as shown on the verification page. */
export interface CertificateDTO {
  number: string;
  kind: 'SPONSOR_ACKNOWLEDGEMENT' | 'STUDENT_AWARD';
  status: 'VALID' | 'REVOKED';
  revokedAt?: string;
  issuedAt: string;
  sponsorName: string;
  studentName?: string;
  studentAlias: string;
  course?: string;
  level?: EducationLevel;
  academicYear: string;
  amount: number;
  sponsorshipReference: string;
  signature: { algorithm: 'Ed25519'; keyId: string; valid: boolean; hash: string };
}
