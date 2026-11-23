import crypto from 'node:crypto';
import { canonicalJson, type IssuerRegistryEntry, type RedeemResponse } from '@eduvault/shared';
import type { DocumentStatus, DocumentVerificationDTO, VerificationCheck } from '@edubridge/shared';

/* ------------------------------------------------------------ Matching */

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Names match if they contain the same words in any order; a missing middle name or initial is tolerated. */
export function namesMatch(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(long);
  if (short.length === long.length) return short.every((t) => set.has(t));
  return short.length >= 2 && short.every((t) => set.has(t));
}

/** Institution and university names: ignores case, punctuation, "(Test)" labels and common filler words. */
export function institutionsMatch(a: string, b: string) {
  const filler = new Set(['of', 'the', 'and', 'college', 'university', 'institute', 'institution']);
  const ta = tokens(a).filter((t) => !filler.has(t));
  const tb = tokens(b).filter((t) => !filler.has(t));
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(long);
  // Same words, or a shortened form with at least two distinctive words ("Krishna Valley Engineering").
  return short.every((t) => set.has(t)) && (short.length === long.length || short.length >= 2);
}

export function rollNumbersMatch(a: string, b: string) {
  const n = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return !!n(a) && n(a) === n(b);
}

/* --------------------------------------------------------- Signature */

/** Recomputes the SHA-256 of the canonical document and checks the Ed25519 signature with the issuer's public key. */
export function checkSignature(shared: RedeemResponse['document'], issuer: IssuerRegistryEntry | null) {
  const computedHash = crypto.createHash('sha256').update(canonicalJson(shared.payload)).digest('hex');
  const hashMatches = computedHash === shared.signature.documentHash;
  // The PDF itself is covered by the signature through its SHA-256 in the payload.
  const fileHash = crypto.createHash('sha256').update(Buffer.from(shared.fileBase64 ?? '', 'base64')).digest('hex');
  const fileHashMatches = !!shared.payload.file?.sha256 && fileHash === shared.payload.file.sha256;
  const key = issuer?.keys.find((k) => k.keyId === shared.signature.keyId);
  let signatureValid = false;
  if (key && shared.signature.algorithm === 'Ed25519') {
    try {
      signatureValid = crypto.verify(
        null,
        Buffer.from(computedHash, 'hex'),
        crypto.createPublicKey(key.publicKeyPem),
        Buffer.from(shared.signature.signature, 'base64'),
      );
    } catch {
      signatureValid = false;
    }
  }
  return { computedHash, hashMatches, fileHashMatches, signatureValid, key };
}

/* ------------------------------------------------------------ Result */

export interface ApplicantDetails {
  fullName: string;
  rollNumber?: string;
  institutionName?: string;
  university?: string;
}

export function assessMarksheet(
  shared: RedeemResponse,
  issuer: IssuerRegistryEntry | null,
  applicant: ApplicantDetails,
): { status: DocumentStatus; verification: DocumentVerificationDTO } {
  const doc = shared.document;
  const p = doc.payload;
  const sig = checkSignature(doc, issuer);
  // The issuer must be in the registry under the same ID the document names, and currently trusted.
  const issuerTrusted = !!issuer && issuer.institutionId === p.issuer.institutionId && issuer.status === 'ACTIVE';

  const checks: VerificationCheck[] = [
    { field: 'Student name', application: applicant.fullName, document: p.student.name, match: namesMatch(applicant.fullName, p.student.name) },
    { field: 'Roll number', application: applicant.rollNumber, document: p.student.rollNumber, match: rollNumbersMatch(applicant.rollNumber ?? '', p.student.rollNumber) },
    { field: 'Institution', application: applicant.institutionName, document: p.issuer.name, match: institutionsMatch(applicant.institutionName ?? '', p.issuer.name) },
    { field: 'University', application: applicant.university, document: p.issuer.university, match: institutionsMatch(applicant.university ?? '', p.issuer.university) },
  ];
  const mismatches = checks.filter((c) => !c.match);

  let status: DocumentStatus;
  let summary: string;
  if (!sig.hashMatches || !sig.signatureValid || !sig.fileHashMatches) {
    status = 'REJECTED';
    summary = !issuer
      ? 'The issuing institution could not be found in the EduVault registry, so the signature could not be trusted.'
      : !sig.fileHashMatches && sig.signatureValid && sig.hashMatches
        ? 'The marksheet PDF received is not the file the institution signed. It may have been replaced or altered.'
        : 'The digital signature does not match the document. Its contents may have been altered.';
  } else if (doc.status === 'REVOKED') {
    status = 'REJECTED';
    summary = 'The signature is valid, but the institution has revoked this marksheet.';
  } else if (!issuerTrusted) {
    status = 'REVIEW_REQUIRED';
    summary = 'The signature is valid, but the issuing institution is not currently a trusted issuer. A reviewer will check it.';
  } else if (mismatches.length) {
    status = 'REVIEW_REQUIRED';
    const fields = mismatches.map((m) => m.field.toLowerCase()).join(', ');
    summary = `The signature is valid, but the ${fields} on the marksheet ${mismatches.length > 1 ? 'do' : 'does'} not match your application. A reviewer will check it.`;
  } else {
    status = 'VERIFIED';
    summary = `Signed by ${p.issuer.name} and unchanged since it was issued. The details match your application.`;
  }

  return {
    status,
    verification: {
      method: 'EDUVAULT_SIGNATURE',
      verifiedAt: new Date().toISOString(),
      consentReference: shared.consentReference,
      documentId: p.documentId,
      documentStatus: doc.status,
      issuer: { ...p.issuer, registryStatus: issuer?.status },
      keyId: doc.signature.keyId,
      keyFingerprint: sig.key?.fingerprint,
      documentHash: sig.computedHash,
      hashMatches: sig.hashMatches,
      fileHashMatches: sig.fileHashMatches,
      signatureValid: sig.signatureValid,
      issuerTrusted,
      checks,
      summary,
      marksheet: {
        studentName: p.student.name,
        rollNumber: p.student.rollNumber,
        programme: p.programme,
        semester: p.semester,
        academicYear: p.academicYear,
        examSession: p.examSession,
        result: p.result,
        percentage: p.percentage,
        fileSha256: p.file.sha256,
        fileSize: p.file.size,
        issuedAt: p.issuedAt,
        testData: p.testData === true,
      },
    },
  };
}
