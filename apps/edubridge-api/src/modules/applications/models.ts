import { Schema, Types, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import {
  APPLICATION_STATUSES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  EDUCATION_LEVELS,
  GENDERS,
  INDIAN_STATES,
  RECOMMENDATIONS,
  DECISIONS,
  NEED_LEVELS,
  SPECIAL_CIRCUMSTANCES,
} from '@edubridge/shared';

/* ------------------------------------------------------------ Profile */

const personalSchema = new Schema(
  {
    dateOfBirth: String,
    gender: { type: String, enum: GENDERS },
    addressLine: String,
    city: String,
    district: String,
    state: { type: String, enum: INDIAN_STATES },
    pincode: String,
  },
  { _id: false },
);

const educationSchema = new Schema(
  {
    institutionName: String,
    university: String,
    level: { type: String, enum: EDUCATION_LEVELS },
    course: String,
    specialization: String,
    currentYear: Number,
    durationYears: Number,
    rollNumber: String,
    lastExamPercentage: Number,
  },
  { _id: false },
);

const studentProfileSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    personal: { type: personalSchema, default: () => ({}) },
    education: { type: educationSchema, default: () => ({}) },
  },
  { timestamps: true },
);
export const StudentProfile = model('StudentProfile', studentProfileSchema);
export type StudentProfileDoc = HydratedDocument<InferSchemaType<typeof studentProfileSchema>>;

/* -------------------------------------------------------- Application */

const familySchema = new Schema(
  {
    familyMembers: Number,
    earningMembers: Number,
    dependentsStudying: Number,
    annualFamilyIncome: Number,
    primaryEarnerOccupation: String,
    circumstances: { type: [{ type: String, enum: SPECIAL_CIRCUMSTANCES }], default: undefined },
    circumstancesNote: String,
  },
  { _id: false },
);

const supportSchema = new Schema(
  {
    expenses: {
      type: new Schema(
        { tuition: Number, hostel: Number, books: Number, exam: Number, transport: Number, other: Number },
        { _id: false },
      ),
      default: undefined,
    },
    existingAid: Number,
    existingAidSource: String,
    requestedAmount: Number,
    statement: String,
  },
  { _id: false },
);

const statusEventSchema = new Schema(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    at: { type: Date, required: true, default: Date.now },
    by: { type: Types.ObjectId, ref: 'User' },
    note: String,
  },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    applicationNumber: { type: String, required: true, unique: true },
    academicYear: { type: String, required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'DRAFT', index: true },
    family: { type: familySchema, default: () => ({}) },
    support: { type: supportSchema, default: () => ({}) },
    /** Immutable copy of the profile at submission, so later profile edits don't alter a submitted application. */
    profileSnapshot: {
      type: new Schema({ personal: personalSchema, education: educationSchema }, { _id: false }),
      default: undefined,
    },
    declarationAcceptedAt: Date,
    submittedAt: Date,
    history: { type: [statusEventSchema], default: [] },
    /** The volunteer (or admin) currently carrying out preliminary verification. */
    assignment: {
      type: new Schema(
        { volunteer: { type: Types.ObjectId, ref: 'User', required: true }, claimedAt: { type: Date, required: true } },
        { _id: false },
      ),
      default: undefined,
    },
    /** Rule-based score and ML second opinion (AssessmentDTO). Re-run on request; the one at decision time is kept with the decision. */
    assessment: { type: Schema.Types.Mixed },
    /** The administrator's final eligibility decision. Its need level is the label the ML model learns from. */
    decision: {
      type: new Schema(
        {
          decision: { type: String, enum: DECISIONS, required: true },
          needLevel: { type: String, enum: NEED_LEVELS, required: true },
          approvedAmount: Number,
          reason: { type: String, required: true },
          messageToStudent: String,
          by: { type: Types.ObjectId, ref: 'User', required: true },
          at: { type: Date, required: true },
          /** Features used for this decision, kept as the ML training example. */
          features: { type: Schema.Types.Mixed },
          ruleScore: Number,
        },
        { _id: false },
      ),
      default: undefined,
    },
    /** Running totals of pledged and confirmed sponsorships (kept in step with Sponsorship records inside transactions). */
    funding: {
      type: new Schema({ pledged: { type: Number, default: 0 }, confirmed: { type: Number, default: 0 } }, { _id: false }),
      default: undefined,
    },
    /** The student's consent to show their anonymised profile to sponsors once approved. */
    sponsorVisibility: {
      type: new Schema({ visible: { type: Boolean, required: true }, at: { type: Date, required: true }, noteToSponsors: String }, { _id: false }),
      default: undefined,
    },
    /** Preliminary recommendation handed to the administrator. */
    volunteerReview: {
      type: new Schema(
        {
          recommendation: { type: String, enum: RECOMMENDATIONS, required: true },
          summary: { type: String, required: true },
          by: { type: Types.ObjectId, ref: 'User', required: true },
          byRole: String,
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);
// One application per student per academic year.
applicationSchema.index({ student: 1, academicYear: 1 }, { unique: true });
applicationSchema.index({ status: 1, submittedAt: -1 });
applicationSchema.index({ 'assignment.volunteer': 1, status: 1 });
applicationSchema.index({ 'volunteerReview.by': 1 });
applicationSchema.index({ status: 1, 'sponsorVisibility.visible': 1 });

export const Application = model('Application', applicationSchema);
export type ApplicationDoc = HydratedDocument<InferSchemaType<typeof applicationSchema>>;

/* ----------------------------------------------------------- Document */

const documentSchema = new Schema(
  {
    application: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    owner: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: DOCUMENT_TYPES, required: true },
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'PENDING' },
    source: { type: String, enum: ['UPLOAD', 'EDUVAULT'], default: 'UPLOAD' },
    storageKey: { type: String, required: true, select: false },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    certificateNumber: String,
    rollNumber: String,
    /** Income certificate: the student's Aadhaar, AES-256-GCM encrypted, for looking it up on AP Seva. Never selected by default. */
    aadhaarEncrypted: { type: String, select: false },
    aadhaarLast4: String,
    /** Latest manual check by a volunteer or admin (DocumentReviewDTO). Earlier checks remain in the audit log. */
    review: { type: Schema.Types.Mixed },
    /** College ID: automatic enrolment check against EduVault (EnrolmentCheckDTO). */
    enrolmentCheck: { type: Schema.Types.Mixed },
    /** Signature check result for documents imported from EduVault (DocumentVerificationDTO). */
    verification: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
documentSchema.index({ application: 1, type: 1 }, { unique: true });

export const StudentDocument = model('StudentDocument', documentSchema);
export type StudentDocumentDoc = HydratedDocument<InferSchemaType<typeof documentSchema>>;

/* ------------------------------------------------------------ Counter */

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = model('Counter', counterSchema);

/** Next number in a named yearly sequence, e.g. nextSequence('EB', 'application') → EB-2026-000001. */
export async function nextSequence(prefix: string, name: string, year = new Date().getFullYear()) {
  const c = await Counter.findOneAndUpdate({ _id: `${name}-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}-${year}-${String(c.seq).padStart(6, '0')}`;
}

export const nextApplicationNumber = (year = new Date().getFullYear()) => nextSequence('EB', 'application', year);
