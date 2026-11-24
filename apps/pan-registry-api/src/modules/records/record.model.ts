import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const RECORD_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/** One PAN holder in the simulated registry. Records are added by the registry administrator. */
const panRecordSchema = new Schema(
  {
    pan: { type: String, required: true, unique: true, uppercase: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    /** YYYY-MM-DD, as printed on the PAN card. */
    dateOfBirth: { type: String, required: true },
    /** Where one-time passwords are sent. The person verifying never chooses this address. */
    email: { type: String, required: true, lowercase: true, trim: true },
    mobile: { type: String, trim: true },
    status: { type: String, enum: RECORD_STATUSES, default: 'ACTIVE', index: true },
    /** Why the record was deactivated, shown to the administrator only. */
    statusNote: { type: String, trim: true },
  },
  { timestamps: true },
);

export type PanRecordDoc = HydratedDocument<InferSchemaType<typeof panRecordSchema>>;
export const PanRecord = model('PanRecord', panRecordSchema);
