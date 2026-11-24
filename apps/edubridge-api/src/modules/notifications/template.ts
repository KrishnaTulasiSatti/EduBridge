import { appUrl } from '../../config/env';
import type { Mail } from './mailer';

export interface EmailContent {
  to: string;
  subject: string;
  /** "Hello Ravi," */
  name?: string;
  paragraphs: string[];
  /** Label / value rows, e.g. the application number. */
  details?: [string, string | undefined][];
  /** A quoted message written by a person (admin or sponsor). */
  quote?: { from: string; text: string };
  button?: { label: string; path: string };
  /** Small print under the button. */
  footnote?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Builds a plain, readable email in both text and HTML. Everything from users is escaped. */
export function buildEmail(c: EmailContent): Mail {
  const url = c.button ? `${appUrl}${c.button.path}` : undefined;
  const details = (c.details ?? []).filter((d): d is [string, string] => !!d[1]);
  const first = c.name ? `Hello ${c.name.split(' ')[0]},` : 'Hello,';

  const text = [
    first,
    '',
    ...c.paragraphs.flatMap((p) => [p, '']),
    ...(details.length ? [...details.map(([k, v]) => `${k}: ${v}`), ''] : []),
    ...(c.quote ? [`Message from ${c.quote.from}:`, c.quote.text, ''] : []),
    ...(url ? [`${c.button!.label}: ${url}`, ''] : []),
    ...(c.footnote ? [c.footnote, ''] : []),
    '— EduBridge',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2933;font-size:15px;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e6ea;border-radius:10px;padding:28px">
<p style="margin:0 0 20px;font-weight:600;font-size:16px;color:#2f5d50">EduBridge</p>
<p style="margin:0 0 14px">${esc(first)}</p>
${c.paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join('\n')}
${
  details.length
    ? `<table style="border-collapse:collapse;margin:4px 0 16px;font-size:14px">${details
        .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#66717d">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`)
        .join('')}</table>`
    : ''
}
${
  c.quote
    ? `<p style="margin:0 0 4px;font-size:13px;color:#66717d">Message from ${esc(c.quote.from)}</p><p style="margin:0 0 16px;padding-left:12px;border-left:3px solid #e3e6ea;white-space:pre-line">${esc(c.quote.text)}</p>`
    : ''
}
${url ? `<p style="margin:20px 0"><a href="${esc(url)}" style="display:inline-block;background:#2f5d50;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500">${esc(c.button!.label)}</a></p>` : ''}
${c.footnote ? `<p style="margin:0;font-size:13px;color:#66717d">${esc(c.footnote)}</p>` : ''}
</div>
<p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#8a949e;text-align:center">You received this email because you have an account on EduBridge.</p>
</body></html>`;

  return { to: c.to, subject: c.subject, text, html };
}
