import crypto from 'node:crypto';

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison via hashes (also hides length differences). */
export function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
}

/** A 6-digit one-time password. */
export const generateOtp = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export const randomReference = () => `PRV-${crypto.randomBytes(12).toString('base64url')}`;
