import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { MARKSHEET_RESULTS, MARKSHEET_STATUSES } from '@eduvault/shared';

/* ------------------------------------------------------ Student record */

/** A student enrolled at an institution, created by the institution. */
const studentRecordSchema = new Schema(
  {
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    rollNumber: { type: String, required: true, uppercase: true, trim: true },
    programme: { type: String, required: true, trim: true },
    admissionYear: { type: Number, required: true },
    /** Where the activation code is emailed. Older records may not have one. */
    email: { type: String, lowercase: true, trim: true },
    /** The EduVault student account this record is linked to, once activated. */
    account: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    linkedAt: Date,
    /** SHA-256 of the one-time activation code handed to the student. Cleared once used. */
    activationCodeHash: { type: String, select: false, index: true, sparse: true },
    activationCodeIssuedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
studentRecordSchema.index({ institution: 1, rollNumber: 1 }, { unique: true });

export const StudentRecord = model('StudentRecord', studentRecordSchema);
export type StudentRecordDoc = HydratedDocument<InferSchemaType<typeof studentRecordSchema>>;

/* ----------------------------------------------------------- Marksheet */

/** The uploaded marksheet PDF, kept in private storage under a random key. */
const fileSchema = new Schema(
  {
    storageKey: { type: String, required: true, select: false },
    originalName: { type: String, required: true },
    mimeType: { type: String, enum: ['application/pdf'], required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
  },
  { _id: false },
);

const marksheetSchema = new Schema(
  {
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentRecord: { type: Schema.Types.ObjectId, ref: 'StudentRecord', required: true, index: true },
    status: { type: String, enum: MARKSHEET_STATUSES, default: 'DRAFT', index: true },
    semester: { type: Number, required: true },
    academicYear: { type: String, required: true },
    examSession: { type: String, required: true },
    percentage: Number,
    file: { type: fileSchema, required: true },
    result: { type: String, enum: MARKSHEET_RESULTS, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Set when issued. After issuing, the signed payload is the source of truth and nothing above may change.
    documentId: { type: String, unique: true, sparse: true },
    payload: { type: Schema.Types.Mixed },
    documentHash: String,
    signature: String,
    keyId: String,
    keyFingerprint: String,
    issuedAt: Date,
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    revokedAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revocationReason: String,
  },
  { timestamps: true },
);
// One marksheet per student, semester and session.
marksheetSchema.index({ studentRecord: 1, semester: 1, examSession: 1 }, { unique: true });

export const Marksheet = model('Marksheet', marksheetSchema);
export type MarksheetDoc = HydratedDocument<InferSchemaType<typeof marksheetSchema>>;

/* ------------------------------------------------------------- Counter */

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = model('Counter', counterSchema);

export async function nextDocumentId(year = new Date().getFullYear()) {
  const c = await Counter.findOneAndUpdate({ _id: `marksheet-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `EVM-${year}-${String(c.seq).padStart(6, '0')}`;
}
