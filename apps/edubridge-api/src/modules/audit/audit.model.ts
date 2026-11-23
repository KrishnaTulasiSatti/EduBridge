import { Schema, model, Types } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actor: { type: Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

// Audit records are append-only.
const block = function () {
  throw new Error('Audit logs are immutable');
};
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], block);

export const AuditLog = model('AuditLog', auditLogSchema);
