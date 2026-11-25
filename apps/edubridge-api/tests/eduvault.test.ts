import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, type IssuerRegistryEntry, type MarksheetPayload, type RedeemResponse } from '@eduvault/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { AppError } from '../src/utils/AppError';
import { VaultError, vaultClient } from '../src/modules/eduvault/vaultClient';
import { assessMarksheet, institutionsMatch, namesMatch } from '../src/modules/eduvault/verify';

/**
 * EduVault is replaced by a fake that signs with a real Ed25519 key,
 * so these tests exercise EduBridge's actual signature verification.
 */
const app = createApp();
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const otherKey = crypto.generateKeyPairSync('ed25519').privateKey;
const INSTITUTION_ID = '665f1c2b9d3e4a0012345678';
const MARKSHEET_PDF = Buffer.from('%PDF-1.4\n% Semester 5 marksheet (test)\n%%EOF');
const pdfHash = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const registry: IssuerRegistryEntry = {
  institutionId: INSTITUTION_ID,
  name: 'Krishna Valley College of Engineering (Test)',
  university: 'Coastal Technological University (Test)',
  code: 'KVCE-TEST',
  status: 'ACTIVE',
  keys: [{ keyId: 'KVCE-TEST-1', algorithm: 'Ed25519', publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), fingerprint: 'AAAA BBBB', createdAt: new Date().toISOString() }],
};

function payload(overrides: Partial<MarksheetPayload> = {}): MarksheetPayload {
  return {
    schema: 'eduvault.marksheet/v2',
    documentId: 'EVM-2026-000001',
    issuer: { institutionId: INSTITUTION_ID, name: registry.name, university: registry.university, code: 'KVCE-TEST' },
    student: { name: 'Rahul Kumar', rollNumber: '21KV1A0542' },
    programme: 'B.Tech Computer Science and Engineering',
    semester: 5,
    academicYear: '2025-26',
    examSession: 'November 2025',
    result: 'PASS',
    percentage: 78,
    file: { sha256: pdfHash(MARKSHEET_PDF), size: MARKSHEET_PDF.length, mimeType: 'application/pdf' },
    issuedAt: new Date().toISOString(),
    testData: true,
    ...overrides,
  };
}

function signed(p: MarksheetPayload, key = privateKey, pdf = MARKSHEET_PDF): RedeemResponse {
  const documentHash = crypto.createHash('sha256').update(canonicalJson(p)).digest('hex');
  return {
    consentReference: 'CNS-2026-TESTTEST',
    sharedAt: new Date().toISOString(),
    document: {
      type: 'MARKSHEET',
      status: 'ISSUED',
      payload: p,
      signature: { algorithm: 'Ed25519', hashAlgorithm: 'SHA-256', documentHash, signature: crypto.sign(null, Buffer.from(documentHash, 'hex'), key).toString('base64'), keyId: 'KVCE-TEST-1', keyFingerprint: 'AAAA BBBB' },
      fileBase64: pdf.toString('base64'),
    },
  };
}

let token = '';
let lastState = '';

async function startImport() {
  const res = await request(app).post('/api/eduvault/requests').set('Authorization', token);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return lastState;
}
const complete = (body: Record<string, unknown>) => request(app).post('/api/eduvault/complete').set('Authorization', token).send(body);

beforeAll(async () => {
  await connectDB('');
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Rahul Kumar', email: 'rahul.vault@student.test', password: 'Strong@123', role: 'STUDENT', acceptTerms: true, phone: '9876543210' });
  token = `Bearer ${reg.body.accessToken}`;
  await request(app).post('/api/applications/current').set('Authorization', token);
});
afterAll(async () => {
  await disconnectDB();
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(vaultClient, 'createAccessRequest').mockImplementation(async (input) => {
    lastState = input.state;
    expect(input.redirectUri).toMatch(/\/dashboard\/eduvault\/callback$/);
    return { requestId: 'req-1', consentUrl: 'http://localhost:5174/consent/req-1', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  });
  vi.spyOn(vaultClient, 'getIssuer').mockResolvedValue(registry);
});

describe('matching rules', () => {
  it('compares names and institutions sensibly', () => {
    expect(namesMatch('Rahul Kumar', 'KUMAR RAHUL')).toBe(true);
    expect(namesMatch('Rahul Kumar', 'Rahul Kumar S')).toBe(true);
    expect(namesMatch('Rahul', 'Rahul Kumar')).toBe(false);
    expect(namesMatch('Rahul Kumar', 'Ravi Kumar')).toBe(false);
    expect(institutionsMatch('Krishna Valley College of Engineering', 'Krishna Valley College of Engineering (Test)')).toBe(true);
    expect(institutionsMatch('College of Engineering', 'Krishna Valley College of Engineering (Test)')).toBe(false);
  });

  it('rejects a document signed with a different key', () => {
    const r = assessMarksheet(signed(payload(), otherKey), registry, { fullName: 'Rahul Kumar' });
    expect(r.status).toBe('REJECTED');
    expect(r.verification.signatureValid).toBe(false);
  });
});

describe('Verify using EduVault', () => {
  it('requires education details before starting', async () => {
    const res = await request(app).post('/api/eduvault/requests').set('Authorization', token);
    expect(res.status).toBe(400);
    await request(app)
      .patch('/api/profile/me')
      .set('Authorization', token)
      .send({ education: { institutionName: 'Krishna Valley College of Engineering', university: 'Coastal Technological University', rollNumber: '21kv1a0542' } });
  });

  it('imports a validly signed, matching marksheet as verified', async () => {
    const state = await startImport();
    vi.spyOn(vaultClient, 'redeem').mockResolvedValue(signed(payload()));
    const res = await complete({ state, code: 'x'.repeat(43) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.outcome).toBe('VERIFIED');
    const doc = res.body.application.documents.find((d: { type: string }) => d.type === 'MARKSHEET');
    expect(doc.source).toBe('EDUVAULT');
    expect(doc.status).toBe('VERIFIED');
    expect(doc.verification.signatureValid).toBe(true);
    expect(doc.verification.consentReference).toBe('CNS-2026-TESTTEST');
    expect(doc.verification.checks.every((c: { match: boolean }) => c.match)).toBe(true);
    expect(doc.verification.fileHashMatches).toBe(true);
    expect(doc.mimeType).toBe('application/pdf');

    // The stored file is the signed PDF itself.
    const file = await request(app).get(`/api/documents/${doc.id}/file`).set('Authorization', token).buffer(true);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(file.body).equals(MARKSHEET_PDF)).toBe(true);

    // The same callback cannot be replayed.
    const replay = await complete({ state, code: 'x'.repeat(43) });
    expect(replay.status).toBe(400);
  });

  it('rejects a tampered marksheet', async () => {
    const state = await startImport();
    const pkg = signed(payload());
    pkg.document.payload = { ...pkg.document.payload, percentage: 95 };
    vi.spyOn(vaultClient, 'redeem').mockResolvedValue(pkg);
    const res = await complete({ state, code: 'y'.repeat(43) });
    expect(res.body.outcome).toBe('REJECTED');
  });

  it('rejects a validly signed marksheet whose PDF was swapped', async () => {
    const state = await startImport();
    vi.spyOn(vaultClient, 'redeem').mockResolvedValue(signed(payload(), privateKey, Buffer.from('%PDF-1.4\n% a different file\n%%EOF')));
    const res = await complete({ state, code: 'w'.repeat(43) });
    expect(res.body.outcome).toBe('REJECTED');
    const doc = res.body.application.documents.find((d: { type: string }) => d.type === 'MARKSHEET');
    expect(doc.verification.signatureValid).toBe(true);
    expect(doc.verification.fileHashMatches).toBe(false);
  });

  it('flags a marksheet belonging to someone else for review', async () => {
    const state = await startImport();
    vi.spyOn(vaultClient, 'redeem').mockResolvedValue(signed(payload({ student: { name: 'Divya Sri', rollNumber: '21KV1A0577' } })));
    const res = await complete({ state, code: 'z'.repeat(43) });
    expect(res.body.outcome).toBe('REVIEW_REQUIRED');
    const doc = res.body.application.documents.find((d: { type: string }) => d.type === 'MARKSHEET');
    expect(doc.verification.checks.filter((c: { match: boolean }) => !c.match).map((c: { field: string }) => c.field)).toEqual(['Student name', 'Roll number']);
  });

  it('needs review when the issuer is no longer trusted', async () => {
    const state = await startImport();
    vi.spyOn(vaultClient, 'getIssuer').mockResolvedValue({ ...registry, status: 'SUSPENDED' });
    vi.spyOn(vaultClient, 'redeem').mockResolvedValue(signed(payload()));
    const res = await complete({ state, code: 'a'.repeat(43) });
    expect(res.body.outcome).toBe('REVIEW_REQUIRED');
  });

  it('records service unavailable when the registry cannot be reached', async () => {
    const state = await startImport();
    vi.spyOn(vaultClient, 'getIssuer').mockRejectedValue(new AppError(503, 'EDUVAULT_UNAVAILABLE', 'down'));
    vi.spyOn(vaultClient, 'redeem').mockResolvedValue(signed(payload()));
    const res = await complete({ state, code: 'b'.repeat(43) });
    expect(res.body.outcome).toBe('SERVICE_UNAVAILABLE');
  });

  it('passes on EduVault errors such as an expired reference', async () => {
    const state = await startImport();
    vi.spyOn(vaultClient, 'redeem').mockRejectedValue(new VaultError(400, 'INVALID_GRANT', 'The sharing reference is invalid, has expired or has already been used'));
    const res = await complete({ state, code: 'c'.repeat(43) });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/expired/);
  });

  it('handles a declined request', async () => {
    const state = await startImport();
    const res = await complete({ state, error: 'access_denied' });
    expect(res.body.outcome).toBe('DECLINED');
  });

  it('rejects an unknown state value', async () => {
    const res = await complete({ state: 'not-a-real-state-value', code: 'd'.repeat(43) });
    expect(res.status).toBe(400);
  });

  it('a new upload replaces the EduVault marksheet and clears its verification', async () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const res = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', token)
      .field('type', 'MARKSHEET')
      .attach('file', PDF, { filename: 'marksheet.pdf', contentType: 'application/pdf' });
    const doc = res.body.application.documents.find((d: { type: string }) => d.type === 'MARKSHEET');
    expect(doc.source).toBe('UPLOAD');
    expect(doc.status).toBe('PENDING');
    expect(doc.verification).toBeUndefined();
  });
});
