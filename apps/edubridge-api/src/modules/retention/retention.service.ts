import { env } from '../../config/env';
import { Application, StudentDocument } from '../applications/models';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { storage } from '../storage/storage';

const DAY = 24 * 3600 * 1000;

/**
 * Document retention policy.
 *
 * When an application is not approved, EduBridge no longer needs the student's uploaded files.
 * DOCUMENT_RETENTION_DAYS after that decision (default 180, which leaves time for questions or an
 * appeal) the files are deleted from storage. The document record stays: type, file name, size,
 * SHA-256 fingerprint and every verification result, so the decision can still be explained.
 *
 * (Aadhaar numbers are already deleted when any final decision is made, see the review service.)
 */
export async function purgeExpiredDocuments(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.DOCUMENT_RETENTION_DAYS * DAY);
  const apps = await Application.find({ status: 'REJECTED', 'decision.at': { $lte: cutoff } })
    .select('_id applicationNumber')
    .lean();
  if (!apps.length) return { applications: 0, files: 0 };

  let files = 0;
  let applications = 0;
  for (const app of apps) {
    const docs = await StudentDocument.find({ application: app._id, purgedAt: null }).select('+storageKey');
    if (!docs.length) continue;
    for (const doc of docs) {
      await storage.remove(doc.storageKey).catch(() => undefined);
      doc.purgedAt = now;
      await doc.save();
      files++;
    }
    applications++;
    await audit({
      action: AUDIT_ACTIONS.DOCUMENTS_PURGED,
      actorRole: 'SYSTEM',
      resourceType: 'Application',
      resourceId: String(app._id),
      metadata: { applicationNumber: app.applicationNumber, files: docs.length, retentionDays: env.DOCUMENT_RETENTION_DAYS, types: docs.map((d) => d.type) },
    });
  }
  return { applications, files };
}

/** Runs the retention job shortly after start-up and then once a day. */
export function scheduleRetention() {
  const run = () =>
    purgeExpiredDocuments()
      .then((r) => r.files && console.log(`🗑️  Retention: deleted ${r.files} file(s) from ${r.applications} not-approved application(s)`))
      .catch((err) => console.error('Retention job failed', err));
  const first = setTimeout(run, 30_000);
  const daily = setInterval(run, DAY);
  first.unref();
  daily.unref();
}
