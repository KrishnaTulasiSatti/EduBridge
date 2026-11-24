/** PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCPK1234L). */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** The 4th character of a PAN says what kind of holder it belongs to. */
export const HOLDER_TYPES: Record<string, string> = {
  P: 'Individual',
  C: 'Company',
  H: 'Hindu Undivided Family',
  F: 'Firm',
  A: 'Association of Persons',
  T: 'Trust',
  B: 'Body of Individuals',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
};

export const normalizePan = (pan: string) => pan.replace(/\s+/g, '').toUpperCase();

export const isValidPan = (pan: string) => PAN_PATTERN.test(pan) && pan[3] in HOLDER_TYPES;

export const holderType = (pan: string) => HOLDER_TYPES[pan[3]] ?? 'Unknown';

/** Names are compared ignoring case, dots and extra spaces ("K. Ravi  Kumar" = "K RAVI KUMAR"). */
export const normalizeName = (name: string) =>
  name
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Shows only the first letter of the mailbox and the domain, e.g. k*******@gmail.com. */
export function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user[0]}${'*'.repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

export const maskPan = (pan: string) => `${'X'.repeat(6)}${pan.slice(6)}`;
