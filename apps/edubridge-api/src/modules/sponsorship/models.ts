import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CANCEL_REASONS, EDUCATION_LEVELS, EXPENSE_KEYS, INDIAN_STATES, SPECIAL_CIRCUMSTANCES, SPONSORSHIP_STATUSES } from '@edubridge/shared';

/* ----------------------------------------------------- Sponsor profile */

const sponsorProfileSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true },
    showNameToStudents: { type: Boolean, default: true },
    budget: { type: Number, required: true, min: 0 },
    levels: { type: [{ type: String, enum: EDUCATION_LEVELS }], default: [] },
    categories: { type: [{ type: String, enum: EXPENSE_KEYS }], default: [] },
    states: { type: [{ type: String, enum: INDIAN_STATES }], default: [] },
    circumstances: { type: [{ type: String, enum: SPECIAL_CIRCUMSTANCES }], default: [] },
    /** Pledged + confirmed. Never more than the budget (checked atomically when pledging). */
    committed: { type: Number, default: 0, min: 0 },
    confirmed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
export const SponsorProfile = model('SponsorProfile', sponsorProfileSchema);
export type SponsorProfileDoc = HydratedDocument<InferSchemaType<typeof sponsorProfileSchema>>;

/* --------------------------------------------------------- Sponsorship */

const sponsorshipSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    sponsor: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: SPONSORSHIP_STATUSES, default: 'PLEDGED', index: true },
    /** Set while PLEDGED or CONFIRMED. A partial unique index on it stops duplicate active sponsorships. */
    active: { type: Boolean },
    /** Name and visibility as they were when pledging, so certificates stay consistent. */
    sponsorName: { type: String, required: true },
    showNameToStudent: { type: Boolean, required: true },
    messageToStudent: String,
    expiresAt: Date,
    confirmation: {
      type: new Schema(
        { receivedOn: String, reference: String, note: String, by: { type: Types.ObjectId, ref: 'User' }, at: Date },
        { _id: false },
      ),
      default: undefined,
    },
    cancellation: {
      type: new Schema(
        { reason: { type: String, enum: CANCEL_REASONS }, note: String, by: { type: Types.ObjectId, ref: 'User' }, at: Date, wasConfirmed: Boolean },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);
sponsorshipSchema.index({ sponsor: 1, application: 1 }, { unique: true, partialFilterExpression: { active: { $eq: true } } });
sponsorshipSchema.index({ status: 1, expiresAt: 1 });

export const Sponsorship = model('Sponsorship', sponsorshipSchema);
export type SponsorshipDoc = HydratedDocument<InferSchemaType<typeof sponsorshipSchema>>;

/* --------------------------------------------------------- Certificate */

const certificateSchema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    /** Random code printed on the certificate; required to open its verification page. */
    code: { type: String, required: true },
    kind: { type: String, enum: ['SPONSOR_ACKNOWLEDGEMENT', 'STUDENT_AWARD'], required: true },
    sponsorship: { type: Types.ObjectId, ref: 'Sponsorship', required: true, index: true },
    holder: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    /** The signed contents (canonical JSON of this object is what is hashed and signed). */
    payload: { type: Schema.Types.Mixed, required: true },
    hash: { type: String, required: true },
    signature: { type: String, required: true },
    keyId: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);
certificateSchema.index({ sponsorship: 1, kind: 1 }, { unique: true });

export const Certificate = model('Certificate', certificateSchema);
export type CertificateDoc = HydratedDocument<InferSchemaType<typeof certificateSchema>>;
