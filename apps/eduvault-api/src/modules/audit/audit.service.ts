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
  INSTITUTION_REGISTERED: 'INSTITUTION_REGISTERED',
  INSTITUTION_STATUS_CHANGED: 'INSTITUTION_STATUS_CHANGED',
  SIGNING_KEY_CREATED: 'SIGNING_KEY_CREATED',
  STUDENT_ENROLLED: 'STUDENT_ENROLLED',
  ACTIVATION_CODE_ISSUED: 'ACTIVATION_CODE_ISSUED',
  ENROLMENT_LINKED: 'ENROLMENT_LINKED',
  MARKSHEET_CREATED: 'MARKSHEET_CREATED',
  MARKSHEET_ISSUED: 'MARKSHEET_ISSUED',
  MARKSHEET_REVOKED: 'MARKSHEET_REVOKED',
  ACCESS_REQUESTED: 'ACCESS_REQUESTED',
  CONSENT_GRANTED: 'CONSENT_GRANTED',
  CONSENT_DENIED: 'CONSENT_DENIED',
  DOCUMENT_SHARED: 'DOCUMENT_SHARED',
  SHARE_REDEEM_FAILED: 'SHARE_REDEEM_FAILED',
  ENROLMENT_CHECKED: 'ENROLMENT_CHECKED',
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

/** Records an audit entry. Never throws — auditing must not break the main request. */
export async function audit(entry: AuditEntry) {
  try {
    await AuditLog.create({
      actor: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? {},
      ip: entry.req?.ip,
      userAgent: entry.req?.get('user-agent'),
    });
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
