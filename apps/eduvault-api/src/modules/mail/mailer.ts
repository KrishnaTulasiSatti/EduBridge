import nodemailer from 'nodemailer';
import { env, webOrigin } from '../../config/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Messages "sent" while running tests, so tests can read them. */
export const testOutbox: Mail[] = [];

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/**
 * Sends an email and says whether it went out. Without SMTP settings (development) the message
 * is printed in the console instead and counts as not sent.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (env.NODE_ENV === 'test') {
    testOutbox.push(mail);
    return true;
  }
  if (!transport) {
    console.log(`\n📧 [EduVault · email not configured] To: ${mail.to}\n   ${mail.subject}\n${mail.text.replace(/^/gm, '   ')}\n`);
    return false;
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...mail });
    return true;
  } catch (e) {
    console.error(`Email to ${mail.to} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function activationCodeMail(p: { to: string; studentName: string; institutionName: string; rollNumber: string; code: string }): Mail {
  const first = p.studentName.split(' ')[0];
  const registerUrl = `${webOrigin}/register`;
  const loginUrl = `${webOrigin}/login`;
  const intro = `${p.institutionName} has added you to EduVault, where your marksheets are issued and kept.`;
  const howTo = 'Use this code once to create your EduVault account. If you already have an EduVault account, sign in and add the code on your home page instead.';
  const safety = 'Do not share this code. If you did not expect this email, contact your institution.';

  const text = [
    `Hello ${first},`,
    '',
    intro,
    '',
    `Your activation code: ${p.code}`,
    `Roll number: ${p.rollNumber}`,
    '',
    howTo,
    '',
    `Create your account: ${registerUrl}`,
    `Sign in: ${loginUrl}`,
    '',
    safety,
    '',
    '— EduVault',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2733;font-size:15px;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e5ea;border-radius:10px;padding:28px">
<p style="margin:0 0 20px;font-weight:600;font-size:16px;color:#2c4a6e">EduVault</p>
<p style="margin:0 0 14px">Hello ${esc(first)},</p>
<p style="margin:0 0 14px">${esc(intro)}</p>
<p style="margin:0 0 6px;font-size:13px;color:#66717d">Your activation code</p>
<p style="margin:0 0 6px;padding:12px 0;background:#f5f6f8;border:1px solid #e2e5ea;border-radius:8px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:22px;font-weight:600;letter-spacing:3px">${esc(p.code)}</p>
<p style="margin:0 0 16px;font-size:13px;color:#66717d">Roll number ${esc(p.rollNumber)}</p>
<p style="margin:0 0 14px">${esc(howTo)}</p>
<p style="margin:20px 0"><a href="${esc(registerUrl)}" style="display:inline-block;background:#2c4a6e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500">Create your account</a>
<a href="${esc(loginUrl)}" style="margin-left:12px;color:#2c4a6e">Sign in</a></p>
<p style="margin:0;font-size:13px;color:#66717d">${esc(safety)}</p>
</div>
</body></html>`;

  return { to: p.to, subject: `Your EduVault activation code from ${p.institutionName}`, text, html };
}
