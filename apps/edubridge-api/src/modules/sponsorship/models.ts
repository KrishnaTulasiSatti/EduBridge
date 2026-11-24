import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { END_REASONS, EDUCATION_LEVELS, EXPENSE_KEYS, INDIAN_STATES, SPECIAL_CIRCUMSTANCES, SPONSORSHIP_STATUSES } from '@edubridge/shared';

/* ----------------------------------------------------- Sponsor profile */

const sponsorProfileSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    /** Name shown to the students the sponsor connects with. */
    displayName: { type: String, required: true },
    budget: { type: Number, required: true, min: 0 },
    levels: { type: [{ type: String, enum: EDUCATION_LEVELS }], default: [] },
    categories: { type: [{ type: String, enum: EXPENSE_KEYS }], default: [] },
    states: { type: [{ type: String, enum: INDIAN_STATES }], default: [] },
    circumstances: { type: [{ type: String, enum: SPECIAL_CIRCUMSTANCES }], default: [] },
    /** Amounts promised in active connections. Never more than the budget (checked atomically when connecting). */
    committed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
export const SponsorProfile = model('SponsorProfile', sponsorProfileSchema);
export type SponsorProfileDoc = HydratedDocument<InferSchemaType<typeof sponsorProfileSchema>>;

/* ---------------------------------------------------------- Connection */

/**
 * A sponsor connected with an approved student. The amount is what the sponsor intends to give;
 * no money moves through EduBridge. While connected, both sides see each other's contact details.
 */
const sponsorshipSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    sponsor: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    academicYear: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: SPONSORSHIP_STATUSES, default: 'CONNECTED', index: true },
    /** Set while CONNECTED. A partial unique index on it stops duplicate active connections. */
    active: { type: Boolean },
    /** The sponsor's display name when connecting. */
    sponsorName: { type: String, required: true },
    messageToStudent: String,
    /** Why and when the connection ended. */
    cancellation: {
      type: new Schema(
        { reason: { type: String, enum: END_REASONS }, note: String, by: { type: Types.ObjectId, ref: 'User' }, at: Date },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);
sponsorshipSchema.index({ sponsor: 1, application: 1 }, { unique: true, partialFilterExpression: { active: { $eq: true } } });

export const Sponsorship = model('Sponsorship', sponsorshipSchema);
export type SponsorshipDoc = HydratedDocument<InferSchemaType<typeof sponsorshipSchema>>;
