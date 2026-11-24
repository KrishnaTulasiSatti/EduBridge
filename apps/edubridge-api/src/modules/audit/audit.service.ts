import type { Request } from 'express';
import { AuditLog } from './audit.model';

export const AUDIT_ACTIONS = {
  USER_REGISTERED: 'USER_REGISTERED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  REFRESH_TOKEN_REUSE: 'REFRESH_TOKEN_REUSE',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  APPLICATION_CREATED: 'APPLICATION_CREATED',
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',
  EDUVAULT_REQUESTED: 'EDUVAULT_REQUESTED',
  EDUVAULT_IMPORTED: 'EDUVAULT_IMPORTED',
  EDUVAULT_DECLINED: 'EDUVAULT_DECLINED',
  VERIFICATION_CLAIMED: 'VERIFICATION_CLAIMED',
  VERIFICATION_RELEASED: 'VERIFICATION_RELEASED',
  DOCUMENT_REVIEWED: 'DOCUMENT_REVIEWED',
  AADHAAR_VIEWED: 'AADHAAR_VIEWED',
  ENROLMENT_CHECKED: 'ENROLMENT_CHECKED',
  ASSESSMENT_RUN: 'ASSESSMENT_RUN',
  APPLICATION_DECIDED: 'APPLICATION_DECIDED',
  MODEL_TRAINED: 'MODEL_TRAINED',
  VOLUNTEER_REVIEW_SUBMITTED: 'VOLUNTEER_REVIEW_SUBMITTED',
  SPONSOR_PREFERENCES_UPDATED: 'SPONSOR_PREFERENCES_UPDATED',
  SPONSOR_VISIBILITY_CHANGED: 'SPONSOR_VISIBILITY_CHANGED',
  SPONSORSHIP_PLEDGED: 'SPONSORSHIP_PLEDGED',
  BANK_DETAILS_SAVED: 'BANK_DETAILS_SAVED',
  BANK_DETAILS_VIEWED: 'BANK_DETAILS_VIEWED',
  SPONSORSHIP_SENT: 'SPONSORSHIP_SENT',
  SPONSORSHIP_NOT_RECEIVED: 'SPONSORSHIP_NOT_RECEIVED',
  SPONSORSHIP_CONFIRMED: 'SPONSORSHIP_CONFIRMED',
  SPONSORSHIP_CANCELLED: 'SPONSORSHIP_CANCELLED',
  SPONSORSHIP_EXPIRED: 'SPONSORSHIP_EXPIRED',
  CERTIFICATE_ISSUED: 'CERTIFICATE_ISSUED',
  CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
  AUDIT_EXPORTED: 'AUDIT_EXPORTED',
  DOCUMENTS_PURGED: 'DOCUMENTS_PURGED',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

// Defence in depth: secrets must never reach the audit log, even if a caller passes them by mistake.
const SECRET_KEY = /password|passcode|token|secret|privatekey|aadhaar(?!last4)|accountnumber(?!last4)|^otp$|^code$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]),
  );
}

/** Records an audit entry. Never throws — auditing must not break the main request. */
export async function audit(entry: AuditEntry) {
  try {
    await AuditLog.create({
      actor: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: redact(entry.metadata ?? {}),
      ip: entry.req?.ip,
      userAgent: entry.req?.get('user-agent'),
    });
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
