import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const VERIFICATION_STATUSES = ['OTP_SENT', 'VERIFIED', 'FAILED', 'EXPIRED'] as const;

/** One verification attempt: the details matched and an OTP was sent to the holder's registered email. */
const verificationSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    partner: { type: String, required: true },
    record: { type: Schema.Types.ObjectId, ref: 'PanRecord', required: true },
    pan: { type: String, required: true, index: true },
    /** Only a SHA-256 hash of the OTP is stored. */
    otpHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    status: { type: String, enum: VERIFICATION_STATUSES, default: 'OTP_SENT' },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date },
  },
  { timestamps: true },
);

// Attempts are removed from the database a day after they were created.
verificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export type VerificationDoc = HydratedDocument<InferSchemaType<typeof verificationSchema>>;
export const Verification = model('Verification', verificationSchema);
