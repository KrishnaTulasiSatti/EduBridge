import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { INSTITUTION_STATUSES } from '@eduvault/shared';

const signingKeySchema = new Schema(
  {
    keyId: { type: String, required: true },
    algorithm: { type: String, enum: ['Ed25519'], default: 'Ed25519' },
    publicKeyPem: { type: String, required: true },
    /** AES-256-GCM encrypted PKCS#8 private key. Never leaves the server. */
    encryptedPrivateKey: { type: String, required: true, select: false },
    fingerprint: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    retiredAt: { type: Date },
  },
  { _id: false },
);

const institutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    university: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    website: { type: String, trim: true },
    status: { type: String, enum: INSTITUTION_STATUSES, default: 'PENDING', index: true },
    contact: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    signingKeys: { type: [signingKeySchema], default: [] },
  },
  { timestamps: true },
);

export type InstitutionDoc = HydratedDocument<InferSchemaType<typeof institutionSchema>>;
export const Institution = model('Institution', institutionSchema);

export function activeKey(inst: InstitutionDoc) {
  return inst.signingKeys.find((k) => !k.retiredAt);
}
