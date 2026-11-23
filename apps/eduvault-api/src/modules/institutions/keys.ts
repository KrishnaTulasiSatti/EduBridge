import crypto from 'node:crypto';
import { env } from '../../config/env';

/**
 * Institution signing keys.
 * Each trusted institution gets an Ed25519 key pair. The public key is published in the issuer
 * registry; the private key is encrypted with KEY_ENCRYPTION_KEY and only used to sign marksheets.
 */

const kek = () => Buffer.from(env.KEY_ENCRYPTION_KEY, 'hex');

function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

function decrypt(blob: string) {
  const [version, iv, tag, data] = blob.split('.');
  if (version !== 'v1') throw new Error('Unknown key encryption format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** SHA-256 of the DER public key, shown as 8 groups of 4 hex characters. */
export function fingerprintOf(publicKeyPem: string) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const hex = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32).toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
}

export function generateSigningKey(institutionCode: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    keyId: `${institutionCode}-${stamp}-${crypto.randomBytes(3).toString('hex')}`,
    algorithm: 'Ed25519' as const,
    publicKeyPem,
    encryptedPrivateKey: encrypt(privatePem),
    fingerprint: fingerprintOf(publicKeyPem),
    createdAt: new Date(),
  };
}

export const sha256Hex = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

/** Signs the SHA-256 digest of the canonical document with the institution's private key. */
export function signDigest(documentHashHex: string, encryptedPrivateKey: string) {
  const key = crypto.createPrivateKey(decrypt(encryptedPrivateKey));
  return crypto.sign(null, Buffer.from(documentHashHex, 'hex'), key).toString('base64');
}
