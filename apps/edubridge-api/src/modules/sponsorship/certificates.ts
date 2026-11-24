import crypto from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { canonicalJson } from '@eduvault/shared';
import type { CertificateDTO, EducationLevel } from '@edubridge/shared';
import { env } from '../../config/env';
import { nextSequence } from '../applications/models';
import { Certificate, type CertificateDoc } from './models';

/**
 * Sponsorship certificates are signed with EduBridge's own Ed25519 key, so anyone holding one can check
 * on the verification page that it was issued by EduBridge and has not been altered.
 * Outside production a missing key falls back to one derived from the JWT secret so development works.
 */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

let cached: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject; keyId: string; publicKeyPem: string } | null = null;

function signingKey() {
  if (cached) return cached;
  const seed = env.CERTIFICATE_SIGNING_KEY
    ? Buffer.from(env.CERTIFICATE_SIGNING_KEY, 'hex')
    : crypto.createHash('sha256').update(`edubridge-dev-certificate-key:${env.JWT_ACCESS_SECRET}`).digest();
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey(privateKey);
  const raw = publicKey.export({ type: 'spki', format: 'der' });
  const keyId = `ebk-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
  cached = { privateKey, publicKey, keyId, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  return cached;
}

export function publicKeyInfo() {
  const k = signingKey();
  return { algorithm: 'Ed25519' as const, keyId: k.keyId, publicKeyPem: k.publicKeyPem };
}

export interface CertificatePayload {
  schema: 'edubridge.sponsorship-certificate/v1';
  number: string;
  kind: CertificateDTO['kind'];
  sponsorshipReference: string;
  sponsorName: string;
  /** Only on the student's award certificate. */
  studentName?: string;
  studentAlias: string;
  course?: string;
  level?: EducationLevel;
  academicYear: string;
  amount: number;
  issuedAt: string;
}

const hashOf = (payload: CertificatePayload) => crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');

/** 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L). */
function verificationCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function issueCertificate(
  input: Omit<CertificatePayload, 'schema' | 'number' | 'issuedAt'> & { holder: unknown; sponsorship: unknown },
  session: ClientSession,
) {
  const { holder, sponsorship, ...rest } = input;
  const number = await nextSequence('EBC', 'certificate');
  const payload: CertificatePayload = { schema: 'edubridge.sponsorship-certificate/v1', number, issuedAt: new Date().toISOString(), ...rest };
  const hash = hashOf(payload);
  const k = signingKey();
  const signature = crypto.sign(null, Buffer.from(hash, 'hex'), k.privateKey).toString('base64');
  const [doc] = await Certificate.create(
    [{ number, code: verificationCode(), kind: payload.kind, sponsorship, holder, payload, hash, signature, keyId: k.keyId, issuedAt: new Date(payload.issuedAt) }],
    { session },
  );
  return doc;
}

/** Recomputes the hash from the stored contents and checks the signature. */
export function checkCertificate(c: CertificateDoc) {
  const payload = c.payload as CertificatePayload;
  const hash = hashOf(payload);
  const k = signingKey();
  let valid = false;
  try {
    valid = hash === c.hash && c.keyId === k.keyId && crypto.verify(null, Buffer.from(hash, 'hex'), k.publicKey, Buffer.from(c.signature, 'base64'));
  } catch {
    valid = false;
  }
  return { valid, hash };
}

export function toCertificateDTO(c: CertificateDoc): CertificateDTO {
  const p = c.payload as CertificatePayload;
  const { valid, hash } = checkCertificate(c);
  return {
    number: c.number,
    kind: p.kind,
    status: c.revokedAt ? 'REVOKED' : 'VALID',
    revokedAt: c.revokedAt?.toISOString(),
    issuedAt: p.issuedAt,
    sponsorName: p.sponsorName,
    studentName: p.studentName,
    studentAlias: p.studentAlias,
    course: p.course,
    level: p.level,
    academicYear: p.academicYear,
    amount: p.amount,
    sponsorshipReference: p.sponsorshipReference,
    signature: { algorithm: 'Ed25519', keyId: c.keyId, valid, hash },
  };
}
