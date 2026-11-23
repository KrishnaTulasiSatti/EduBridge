import { z } from 'zod';
import { EXPENSE_KEYS, type FamilyDetails, type SpecialCircumstance, type SupportRequest } from './application';
import type { PersonRef } from './verification';

/* --------------------------------------------------------------- Levels */

export const NEED_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type NeedLevel = (typeof NEED_LEVELS)[number];
export const NEED_LEVEL_LABELS: Record<NeedLevel, string> = {
  HIGH: 'High need',
  MEDIUM: 'Medium need',
  LOW: 'Low need',
};

/** Score thresholds for the rule-based level. */
export const NEED_THRESHOLDS = { HIGH: 65, MEDIUM: 40 } as const;
export const levelForScore = (score: number): NeedLevel =>
  score >= NEED_THRESHOLDS.HIGH ? 'HIGH' : score >= NEED_THRESHOLDS.MEDIUM ? 'MEDIUM' : 'LOW';

/* ------------------------------------------------------------- Inputs */

export interface AssessmentInput {
  family: Partial<FamilyDetails>;
  support: Omit<Partial<SupportRequest>, 'expenses'> & { expenses?: Partial<SupportRequest['expenses']> };
  /** Annual income confirmed on the official portal during verification, if recorded. */
  verifiedAnnualIncome?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/* ---------------------------------------------------------- ML features */

/**
 * Numeric features shared by the rule-based score and the ML model. Only financial and family
 * circumstances are used. Gender, location, caste or religion are never model inputs.
 */
export const NEED_FEATURES = [
  'annual_family_income',
  'income_per_member',
  'family_members',
  'earning_members',
  'dependents_studying',
  'total_expenses',
  'existing_aid',
  'requested_amount',
  'uncovered_cost_ratio',
  'circumstance_count',
  'orphan',
  'single_parent',
  'first_generation',
  'disability_in_family',
  'major_medical_expenses',
  'loss_of_income',
] as const;
export type NeedFeature = (typeof NEED_FEATURES)[number];
export type NeedFeatures = Record<NeedFeature, number>;

export const NEED_FEATURE_LABELS: Record<NeedFeature, string> = {
  annual_family_income: 'Annual family income',
  income_per_member: 'Income per family member',
  family_members: 'Family members',
  earning_members: 'Earning members',
  dependents_studying: 'Dependents studying',
  total_expenses: 'Annual education costs',
  existing_aid: 'Existing aid',
  requested_amount: 'Amount requested',
  uncovered_cost_ratio: 'Uncovered cost ÷ income',
  circumstance_count: 'Special circumstances',
  orphan: 'Lost a parent',
  single_parent: 'Single-parent family',
  first_generation: 'First-generation learner',
  disability_in_family: 'Disability in family',
  major_medical_expenses: 'Major medical expenses',
  loss_of_income: 'Recent loss of income',
};

const FLAG: Record<SpecialCircumstance, NeedFeature> = {
  ORPHAN: 'orphan',
  SINGLE_PARENT: 'single_parent',
  FIRST_GENERATION_LEARNER: 'first_generation',
  DISABILITY_IN_FAMILY: 'disability_in_family',
  MAJOR_MEDICAL_EXPENSES: 'major_medical_expenses',
  LOSS_OF_INCOME: 'loss_of_income',
};

export function annualIncomeUsed(input: AssessmentInput) {
  return input.verifiedAnnualIncome !== undefined
    ? { amount: input.verifiedAnnualIncome, source: 'VERIFIED' as const }
    : { amount: num(input.family.annualFamilyIncome), source: 'DECLARED' as const };
}

export function needFeatures(input: AssessmentInput): NeedFeatures {
  const { family, support } = input;
  const income = annualIncomeUsed(input).amount;
  const members = Math.max(1, num(family.familyMembers));
  const expenses = EXPENSE_KEYS.reduce((s, k) => s + num(support.expenses?.[k]), 0);
  const aid = num(support.existingAid);
  const circumstances = family.circumstances ?? [];
  const f = Object.fromEntries(NEED_FEATURES.map((k) => [k, 0])) as NeedFeatures;
  f.annual_family_income = income;
  f.income_per_member = Math.round(income / members);
  f.family_members = members;
  f.earning_members = num(family.earningMembers);
  f.dependents_studying = num(family.dependentsStudying);
  f.total_expenses = expenses;
  f.existing_aid = aid;
  f.requested_amount = num(support.requestedAmount);
  f.uncovered_cost_ratio = Math.round((Math.max(0, expenses - aid) / Math.max(income, 1)) * 100) / 100;
  f.circumstance_count = circumstances.length;
  for (const c of circumstances) f[FLAG[c]] = 1;
  return f;
}

/* ------------------------------------------------------ Rule-based score */

export const RULES_VERSION = 'rules/v1';

export interface ScoreFactor {
  key: 'income' | 'cost_burden' | 'dependency' | 'circumstances' | 'existing_support';
  label: string;
  points: number;
  max: number;
  detail: string;
}

const CIRCUMSTANCE_POINTS: Record<SpecialCircumstance, number> = {
  ORPHAN: 6,
  SINGLE_PARENT: 4,
  DISABILITY_IN_FAMILY: 4,
  MAJOR_MEDICAL_EXPENSES: 4,
  LOSS_OF_INCOME: 4,
  FIRST_GENERATION_LEARNER: 3,
};

/** Income per family member at or below this earns full income points; at or above the upper bound, none. */
export const INCOME_PER_MEMBER_BOUNDS = { full: 25_000, none: 1_50_000 } as const;

/**
 * Transparent, explainable need score from 0 to 100. Every point can be traced to one factor.
 * This is the primary assessment; the ML model is only a second opinion.
 */
export function ruleBasedScore(input: AssessmentInput) {
  const f = needFeatures(input);
  const income = annualIncomeUsed(input);
  const factors: ScoreFactor[] = [];

  // 1. Income per family member (35)
  const { full, none } = INCOME_PER_MEMBER_BOUNDS;
  const incomeShare = 1 - clamp((f.income_per_member - full) / (none - full));
  factors.push({
    key: 'income',
    label: 'Income per family member',
    points: round1(35 * incomeShare),
    max: 35,
    detail: `${inr(f.income_per_member)} a year per person (${inr(income.amount)} ÷ ${f.family_members}). Full points at ${inr(full)} or less, none at ${inr(none)} or more.`,
  });

  // 2. Cost burden: uncovered education cost compared with income (25)
  const uncovered = Math.max(0, f.total_expenses - f.existing_aid);
  const burden = uncovered / Math.max(income.amount, 1);
  factors.push({
    key: 'cost_burden',
    label: 'Education cost burden',
    points: round1(25 * clamp(burden)),
    max: 25,
    detail: `Uncovered cost ${inr(uncovered)} is ${Math.round(burden * 100)}% of annual income. Full points at 100% or more.`,
  });

  // 3. Dependency (15): share of non-earning members, plus siblings also studying
  const dependencyRatio = f.family_members > 0 ? clamp((f.family_members - f.earning_members) / f.family_members) : 0;
  const siblingsStudying = Math.min(Math.max(f.dependents_studying - 1, 0), 2);
  factors.push({
    key: 'dependency',
    label: 'Dependents',
    points: round1(10 * dependencyRatio + 2.5 * siblingsStudying),
    max: 15,
    detail: `${f.earning_members} of ${f.family_members} members earn; ${f.dependents_studying} studying including the student.`,
  });

  // 4. Special circumstances (15, capped)
  const circumstances = input.family.circumstances ?? [];
  const circumstancePoints = Math.min(15, circumstances.reduce((s, c) => s + CIRCUMSTANCE_POINTS[c], 0));
  factors.push({
    key: 'circumstances',
    label: 'Special circumstances',
    points: circumstancePoints,
    max: 15,
    detail: circumstances.length ? `${circumstances.length} declared. Capped at 15 points.` : 'None declared.',
  });

  // 5. Existing support (10): how much of the cost is not already covered by other aid
  const covered = f.total_expenses > 0 ? clamp(f.existing_aid / f.total_expenses) : 1;
  factors.push({
    key: 'existing_support',
    label: 'Not covered by other aid',
    points: round1(10 * (1 - covered)),
    max: 10,
    detail: f.existing_aid > 0 ? `${inr(f.existing_aid)} of ${inr(f.total_expenses)} is already covered by other aid.` : 'No other aid received.',
  });

  const score = Math.round(factors.reduce((s, x) => s + x.points, 0));
  return { score, level: levelForScore(score), factors, incomeUsed: income, version: RULES_VERSION };
}

/* --------------------------------------------------------------- DTOs */

export interface MlModelInfo {
  modelId: string;
  algorithm: string;
  trainedAt: string;
  /** REVIEWED_DECISIONS: trained on admins' decisions. SYNTHETIC_DEMO: demonstration only. */
  source: 'REVIEWED_DECISIONS' | 'SYNTHETIC_DEMO';
  samples: number;
  macroF1: number;
}

export interface MlOpinionDTO {
  status: 'OK' | 'NO_MODEL' | 'UNAVAILABLE';
  prediction?: NeedLevel;
  probabilities?: Partial<Record<NeedLevel, number>>;
  model?: MlModelInfo;
  agreesWithRules?: boolean;
  message?: string;
}

export interface AssessmentDTO {
  ruleBased: ReturnType<typeof ruleBasedScore>;
  ml: MlOpinionDTO;
  features: NeedFeatures;
  assessedAt: string;
}

export const DECISIONS = ['APPROVED', 'ON_HOLD', 'REJECTED'] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABELS: Record<Decision, { label: string; help: string }> = {
  APPROVED: { label: 'Approve', help: 'Eligible for sponsorship. The student becomes visible to sponsors.' },
  ON_HOLD: { label: 'Put on hold', help: 'More information or a further check is needed before deciding.' },
  REJECTED: { label: 'Not approve', help: 'Not eligible for sponsorship in this cycle.' },
};

export const decisionSchema = z
  .object({
    decision: z.enum(DECISIONS, { error: 'Choose a decision' }),
    needLevel: z.enum(NEED_LEVELS, { error: 'Confirm the need level' }),
    approvedAmount: z.number().int().min(0).max(1_00_00_000).optional(),
    reason: z.string().trim().min(1, 'Record the reason for this decision').max(2000),
    messageToStudent: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'APPROVED' && !v.approvedAmount) {
      ctx.addIssue({ code: 'custom', path: ['approvedAmount'], message: 'Enter the amount approved for sponsorship' });
    }
  });
export type DecisionInput = z.infer<typeof decisionSchema>;

export interface DecisionDTO extends DecisionInput {
  by: PersonRef;
  at: string;
}

export interface ReviewQueueItemDTO {
  id: string;
  applicationNumber: string;
  studentName: string;
  institutionName?: string;
  course?: string;
  status: string;
  requestedAmount?: number;
  score?: number;
  level?: NeedLevel;
  mlPrediction?: NeedLevel;
  mlSource?: MlModelInfo['source'];
  recommendation?: string;
  documentsVerified: number;
  documentsTotal: number;
  inconsistencies: number;
  decision?: Decision;
  decidedAt?: string;
  assessedAt?: string;
}

/* ------------------------------------------------------- Model training */

export const ML_MIN_SAMPLES = 30;
export const ML_MIN_PER_CLASS = 5;

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface CandidateResult {
  algorithm: string;
  accuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  perClass: Partial<Record<NeedLevel, ClassMetrics>>;
  confusionMatrix: number[][];
}

export interface FairnessGroup {
  group: string;
  count: number;
  predictedHighRate: number;
  actualHighRate: number;
  recallHigh: number | null;
  accuracy: number;
}

export interface ModelReportDTO {
  model: MlModelInfo;
  labels: NeedLevel[];
  evaluation: 'STRATIFIED_5_FOLD_CV';
  candidates: CandidateResult[];
  chosen: string;
  featureImportance: { feature: NeedFeature; importance: number }[];
  fairness: { attribute: string; groups: FairnessGroup[]; note: string };
  classCounts: Partial<Record<NeedLevel, number>>;
}

export interface ModelStatusDTO {
  service: 'UP' | 'DOWN';
  report?: ModelReportDTO;
  reviewedDecisions: { total: number; byLevel: Partial<Record<NeedLevel, number>> };
  canTrainOnDecisions: boolean;
}
