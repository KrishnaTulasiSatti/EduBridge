import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { VAULT_ACCOUNT_STATUSES, VAULT_ROLES } from '@eduvault/shared';

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: VAULT_ROLES, required: true, index: true },
    status: { type: String, enum: VAULT_ACCOUNT_STATUSES, default: 'ACTIVE', index: true },
    /** Issuer accounts belong to exactly one institution. */
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', index: true },
    designation: { type: String, trim: true },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    termsAcceptedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
