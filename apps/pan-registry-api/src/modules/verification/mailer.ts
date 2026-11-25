import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { sendWithBrevo } from './brevo';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/** Messages "sent" while running tests, so tests can read the OTP. */
export const testOutbox: OutgoingMail[] = [];

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/**
 * Sends an email. Without SMTP settings (development only) the message is printed in the
 * registry's console instead, so the OTP can still be read while testing locally.
 */
export async function sendMail(mail: OutgoingMail) {
  if (env.NODE_ENV === 'test') {
    testOutbox.push(mail);
    return;
  }
  if (env.BREVO_API_KEY) {
    await sendWithBrevo(env.BREVO_API_KEY, env.MAIL_FROM || env.SMTP_USER, mail);
    return;
  }
  if (!transport) {
    console.log(`\n📧 [PAN Registry · email not configured] To: ${mail.to}\n   ${mail.subject}\n   ${mail.text.split('\n')[0]}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...mail });
}

export function otpMail(to: string, otp: string, maskedPan: string): OutgoingMail {
  return {
    to,
    subject: `${otp} is your PAN verification code`,
    text: [
      `Your one-time password is ${otp}. It is valid for 10 minutes.`,
      '',
      `Someone is verifying the PAN ${maskedPan} with EduBridge. If this was not you, ignore this email.`,
      'Never share this code with anyone.',
      '',
      'PAN Registry (simulation for the EduBridge project, not the Income Tax Department)',
    ].join('\n'),
  };
}
