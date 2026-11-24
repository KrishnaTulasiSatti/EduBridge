import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACCOUNT_STATUSES, ROLES, type PublicUser } from '@edubridge/shared';

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'ACTIVE', index: true },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    consentAcceptedAt: { type: Date, required: true },
    /** Sponsors: PAN checked against the PAN registry with an OTP before the account was created. */
    panVerification: {
      type: new Schema(
        {
          /** AES-256-GCM encrypted PAN. */
          panEncrypted: { type: String, required: true, select: false },
          /** HMAC of the PAN: one sponsor account per PAN. */
          panHash: { type: String, required: true, select: false },
          maskedPan: { type: String, required: true },
          holderType: { type: String },
          registryReference: { type: String, required: true },
          verifiedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { timestamps: true },
);

userSchema.index({ 'panVerification.panHash': 1 }, { unique: true, partialFilterExpression: { 'panVerification.panHash': { $exists: true } } });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone ?? undefined,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString(),
    panVerification: u.panVerification
      ? { maskedPan: u.panVerification.maskedPan, verifiedAt: u.panVerification.verifiedAt.toISOString() }
      : undefined,
  };
}

export const User = model('User', userSchema);
