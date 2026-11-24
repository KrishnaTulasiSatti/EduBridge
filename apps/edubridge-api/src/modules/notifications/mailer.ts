import nodemailer from 'nodemailer';
import { env } from '../../config/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Emails "sent" while running tests, so tests can check them. */
export const testOutbox: Mail[] = [];

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

const pending = new Set<Promise<void>>();

async function deliver(mail: Mail) {
  if (env.NODE_ENV === 'test') {
    testOutbox.push(mail);
    return;
  }
  if (!transport) {
    // Development without SMTP settings: show the email in the console instead.
    console.log(`\n📧 [email not configured] To: ${mail.to}\n   Subject: ${mail.subject}\n${mail.text.replace(/^/gm, '   ')}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM || `EduBridge <${env.SMTP_USER}>`, ...mail });
}

/**
 * Sends an email in the background. Notifications never slow down or break the request that
 * triggered them: a failure is logged and the request carries on.
 */
export function sendMail(mail: Mail) {
  track(deliver(mail), `Failed to send email "${mail.subject}" to ${mail.to}:`);
}

/** Runs background email work (including looking up recipients) so flushMail can wait for it. Never throws. */
export function track(work: Promise<void>, errorLabel: string) {
  const p: Promise<void> = work.catch((err) => console.error(errorLabel, (err as Error).message)).finally(() => pending.delete(p));
  pending.add(p);
}

/** Waits for emails still being sent (used by tests and on shutdown). */
export async function flushMail() {
  while (pending.size) await Promise.all([...pending]);
}
