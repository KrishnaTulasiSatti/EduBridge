import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CONSENT_STATUSES } from '@eduvault/shared';

/**
 * A partner's request to read one of a student's documents.
 * Lifecycle: PENDING → (student decides) APPROVED | DENIED → (partner collects) REDEEMED.
 * Anything not completed in time becomes EXPIRED.
 */
const accessRequestSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    documentType: { type: String, enum: ['MARKSHEET'], required: true },
    purpose: { type: String, required: true },
    reference: String,
    redirectUri: { type: String, required: true },
    state: { type: String, required: true },
    status: { type: String, enum: CONSENT_STATUSES, default: 'PENDING', index: true },
    /** Request link validity (student must decide before this). */
    expiresAt: { type: Date, required: true },

    student: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    marksheet: { type: Schema.Types.ObjectId, ref: 'Marksheet' },
    decidedAt: Date,
    consentReference: { type: String, unique: true, sparse: true },

    /** One-time sharing reference: only its hash is stored, valid for a few minutes, usable once. */
    shareCodeHash: { type: String, select: false, index: true, sparse: true },
    shareCodeExpiresAt: Date,
    redeemedAt: Date,
    redeemAttempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const AccessRequest = model('AccessRequest', accessRequestSchema);
export type AccessRequestDoc = HydratedDocument<InferSchemaType<typeof accessRequestSchema>>;
