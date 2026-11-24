import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * Field-level encryption for sensitive values (Aadhaar numbers) using AES-256-GCM.
 * Stored format: v1.<iv>.<auth tag>.<ciphertext>, all base64url.
 * Outside production a missing key falls back to one derived from the JWT secret so development works.
 */
function key() {
  if (env.DATA_ENCRYPTION_KEY) return Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');
  return crypto.createHash('sha256').update(`edubridge-dev-data-key:${env.JWT_ACCESS_SECRET}`).digest();
}

export function encryptField(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/**
 * Keyed hash (HMAC-SHA256) of a value, so the database can enforce "one account per PAN"
 * without storing the PAN in a searchable form.
 */
export function blindIndex(value: string) {
  return crypto.createHmac('sha256', key()).update(`blind-index:${value}`).digest('hex');
}

export function decryptField(stored: string) {
  const [version, iv, tag, data] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
