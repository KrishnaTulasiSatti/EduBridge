/**
 * Sends email through Brevo's web API (https://www.brevo.com) instead of SMTP.
 * Free hosting such as Render's free plan blocks outgoing SMTP ports, but HTTPS works.
 */
export interface BrevoMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Splits "EduBridge <me@gmail.com>" into a name and an address. A bare address is also accepted. */
export function parseSender(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2].trim() } : { email: from.trim() };
}

export async function sendWithBrevo(apiKey: string, from: string, mail: BrevoMail) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: parseSender(from),
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      ...(mail.html ? { htmlContent: mail.html } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Brevo error ${res.status}: ${body?.message ?? res.statusText}`);
  }
}
