import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson, type IssuerRegistryEntry, type RedeemResponse } from '@eduvault/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { env } from '../src/config/env';
import { AuditLog } from '../src/modules/audit/audit.model';
import { DEMO_PASSWORD, seedDemoData } from './fixtures';

const app = createApp();
const REDIRECT = 'http://localhost:5173/dashboard/eduvault/callback';
const partnerAuth = `Basic ${Buffer.from(`${env.EDUBRIDGE_CLIENT_ID}:${env.EDUBRIDGE_CLIENT_SECRET}`).toString('base64')}`;

async function login(email: string, password = DEMO_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return `Bearer ${res.body.accessToken}`;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n% Semester 5 marksheet (test)\ntrailer<<>>\n%%EOF');
const PDF_V2 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n% corrected copy\ntrailer<<>>\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const marksheetFields = (studentRecordId: string, semester = 5): Record<string, string> => ({
  studentRecordId,
  semester: String(semester),
  academicYear: '2025-26',
  examSession: 'November 2025',
  result: 'PASS',
  percentage: '81.5',
});

/** Sends marksheet details as multipart form fields, with an optional file. */
function sendMarksheet(method: 'post' | 'put', path: string, token: string, fields: Record<string, string>, file?: { buf: Buffer; name: string; type: string }) {
  let r = request(app)[method](path).set('Authorization', token);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  if (file) r = r.attach('file', file.buf, { filename: file.name, contentType: file.type });
  return r;
}
const pdf = (buf = PDF) => ({ buf, name: 'semester-5.pdf', type: 'application/pdf' });

let admin: string;
let issuer: string;
let student: string;
let seededRecordId: string;

beforeAll(async () => {
  await connectDB('');
  await seedDemoData();
  [admin, issuer, student] = await Promise.all([login('admin@eduvault.test'), login('registrar@kvce.test'), login('student@edubridge.test')]);
  const list = await request(app).get('/api/issuer/students').set('Authorization', issuer);
  seededRecordId = list.body.items.find((r: { rollNumber: string }) => r.rollNumber === '21KV1A0542').id;
});
afterAll(async () => {
  await disconnectDB();
});

describe('institution onboarding', () => {
  it('registers an institution as pending and blocks sign-in until approved', async () => {
    const reg = await request(app)
      .post('/api/auth/register/institution')
      .send({
        fullName: 'Lakshmi Rao',
        designation: 'Registrar',
        email: 'registrar@hill.test',
        password: 'Strong@123',
        institution: { name: 'Hillside College (Test)', university: 'Test University', code: 'hill-test', city: 'Guntur', state: 'Andhra Pradesh' },
        acceptTerms: true,
      });
    expect(reg.status).toBe(201);
    expect(reg.body.pendingApproval).toBe(true);
    expect(reg.body.accessToken).toBeNull();

    const blocked = await request(app).post('/api/auth/login').send({ email: 'registrar@hill.test', password: 'Strong@123' });
    expect(blocked.status).toBe(403);

    const list = await request(app).get('/api/admin/institutions?status=PENDING').set('Authorization', admin);
    const hill = list.body.items.find((i: { code: string }) => i.code === 'HILL-TEST');
    expect(hill.signingKey).toBeUndefined();

    const approved = await request(app).patch(`/api/admin/institutions/${hill.id}/status`).set('Authorization', admin).send({ status: 'ACTIVE' });
    expect(approved.status).toBe(200);
    expect(approved.body.institution.signingKey.fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){7}$/);

    await login('registrar@hill.test', 'Strong@123');
  });

  it('only admins can approve institutions', async () => {
    const res = await request(app).get('/api/admin/institutions').set('Authorization', issuer);
    expect(res.status).toBe(403);
  });
});

describe('enrolment and activation codes', () => {
  let code = '';

  it('enrols a student and returns a one-time activation code', async () => {
    const res = await request(app)
      .post('/api/issuer/students')
      .set('Authorization', issuer)
      .send({ fullName: 'Divya Sri', rollNumber: '21kv1a0577', programme: 'B.Tech ECE', admissionYear: 2023 });
    expect(res.status).toBe(201);
    expect(res.body.student.rollNumber).toBe('21KV1A0577');
    expect(res.body.activationCode).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    code = res.body.activationCode;
  });

  it('rejects a duplicate roll number', async () => {
    const res = await request(app)
      .post('/api/issuer/students')
      .set('Authorization', issuer)
      .send({ fullName: 'Someone Else', rollNumber: '21KV1A0577', programme: 'B.Tech ECE', admissionYear: 2023 });
    expect(res.status).toBe(400);
  });

  it('lets the student register once with the code (case and dash insensitive)', async () => {
    const body = { fullName: 'Divya Sri', email: 'divya@student.test', password: 'Strong@123', activationCode: code.toLowerCase().replace('-', ''), acceptTerms: true };
    const res = await request(app).post('/api/auth/register/student').send(body);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();

    const again = await request(app).post('/api/auth/register/student').send({ ...body, email: 'other@student.test' });
    expect(again.status).toBe(400);
  });

  it('rejects an unknown code', async () => {
    const res = await request(app)
      .post('/api/auth/register/student')
      .send({ fullName: 'Nobody', email: 'nobody@student.test', password: 'Strong@123', activationCode: 'ABCDE-FGHJK', acceptTerms: true });
    expect(res.status).toBe(400);
  });
});

describe('issuing and signatures', () => {
  let draftId = '';
  let issuedId = '';

  it('creates a draft from an uploaded PDF and lets it be edited or the PDF replaced', async () => {
    const res = await sendMarksheet('post', '/api/issuer/marksheets', issuer, marksheetFields(seededRecordId), pdf());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.marksheet.status).toBe('DRAFT');
    expect(res.body.marksheet.percentage).toBe(81.5);
    expect(res.body.marksheet.file.sha256).toBe(crypto.createHash('sha256').update(PDF).digest('hex'));
    draftId = res.body.marksheet.id;

    const upd = await sendMarksheet('put', `/api/issuer/marksheets/${draftId}`, issuer, { ...marksheetFields(seededRecordId), percentage: '' });
    expect(upd.status, JSON.stringify(upd.body)).toBe(200);
    expect(upd.body.marksheet.percentage).toBeUndefined();
    expect(upd.body.marksheet.file.sha256).toBe(res.body.marksheet.file.sha256);

    const replaced = await sendMarksheet('put', `/api/issuer/marksheets/${draftId}`, issuer, marksheetFields(seededRecordId), pdf(PDF_V2));
    expect(replaced.body.marksheet.file.sha256).toBe(crypto.createHash('sha256').update(PDF_V2).digest('hex'));

    const file = await request(app).get(`/api/issuer/marksheets/${draftId}/file`).set('Authorization', issuer).buffer(true);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(file.body).equals(PDF_V2)).toBe(true);
  });

  it('requires a PDF and rejects other file types', async () => {
    const none = await sendMarksheet('post', '/api/issuer/marksheets', issuer, marksheetFields(seededRecordId, 6));
    expect(none.status).toBe(400);
    const png = await sendMarksheet('post', '/api/issuer/marksheets', issuer, marksheetFields(seededRecordId, 6), { buf: PNG, name: 'fake.pdf', type: 'application/pdf' });
    expect(png.status).toBe(400);
    const badPct = await sendMarksheet('post', '/api/issuer/marksheets', issuer, { ...marksheetFields(seededRecordId, 6), percentage: '120' }, pdf());
    expect(badPct.status).toBe(400);
  });

  it('students cannot see drafts', async () => {
    const res = await request(app).get('/api/me/marksheets').set('Authorization', student);
    expect(res.body.items).toHaveLength(0);
  });

  it('issues the marksheet with a signature that verifies against the registry key', async () => {
    const res = await request(app).post(`/api/issuer/marksheets/${draftId}/issue`).set('Authorization', issuer);
    expect(res.status).toBe(200);
    const m = res.body.marksheet;
    expect(m.status).toBe('ISSUED');
    expect(m.documentId).toMatch(/^EVM-\d{4}-\d{6}$/);
    issuedId = m.id;

    const twice = await request(app).post(`/api/issuer/marksheets/${draftId}/issue`).set('Authorization', issuer);
    expect(twice.status).toBe(409);
    const edit = await sendMarksheet('put', `/api/issuer/marksheets/${draftId}`, issuer, marksheetFields(seededRecordId), pdf());
    expect(edit.status).toBe(409);

    const reg = await request(app).get(`/api/registry/issuers/${m.institution.id}`);
    const entry = reg.body as IssuerRegistryEntry;
    const key = entry.keys.find((k) => k.keyId === m.signature.keyId)!;
    expect(key.fingerprint).toBe(m.signature.keyFingerprint);

    const mine = await request(app).get(`/api/me/marksheets/${issuedId}`).set('Authorization', student);
    expect(mine.status).toBe(200);
    const mineFile = await request(app).get(`/api/me/marksheets/${issuedId}/file`).set('Authorization', student);
    expect(mineFile.status).toBe(200);

    // Another student cannot download it.
    const other = await request(app)
      .post('/api/auth/login')
      .send({ email: 'divya@student.test', password: 'Strong@123' });
    const otherFile = await request(app).get(`/api/me/marksheets/${issuedId}/file`).set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(otherFile.status).toBe(404);
  });

  it('never exposes private keys', async () => {
    const reg = await request(app).get('/api/registry/issuers');
    expect(JSON.stringify(reg.body)).not.toMatch(/PRIVATE|encryptedPrivateKey/);
    const list = await request(app).get('/api/admin/institutions').set('Authorization', admin);
    expect(JSON.stringify(list.body)).not.toMatch(/PRIVATE|encryptedPrivateKey/);
  });

  describe('consent and one-time sharing', () => {
    let requestId = '';

    const createRequest = async () => {
      const res = await request(app)
        .post('/api/partner/access-requests')
        .set('Authorization', partnerAuth)
        .send({ documentType: 'MARKSHEET', purpose: 'Verify the marksheet for application EB-2026-000001', reference: 'EB-2026-000001', redirectUri: REDIRECT, state: 'state-value-1234567890' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body as { requestId: string; consentUrl: string };
    };

    it('rejects partners with a wrong secret or an unregistered redirect', async () => {
      const bad = await request(app)
        .post('/api/partner/access-requests')
        .set('Authorization', `Basic ${Buffer.from('edubridge:wrong-secret').toString('base64')}`)
        .send({ documentType: 'MARKSHEET', purpose: 'Verify the marksheet', redirectUri: REDIRECT, state: 'state-value-1234567890' });
      expect(bad.status).toBe(401);

      const evil = await request(app)
        .post('/api/partner/access-requests')
        .set('Authorization', partnerAuth)
        .send({ documentType: 'MARKSHEET', purpose: 'Verify the marksheet', redirectUri: 'https://evil.example/cb', state: 'state-value-1234567890' });
      expect(evil.status).toBe(400);
    });

    it('shows the consent screen with the student’s issued marksheets', async () => {
      const created = await createRequest();
      requestId = created.requestId;
      expect(created.consentUrl).toContain(`/consent/${requestId}`);

      const res = await request(app).get(`/api/consents/${requestId}`).set('Authorization', student);
      expect(res.status).toBe(200);
      expect(res.body.request.partner.name).toBe('EduBridge');
      expect(res.body.marksheets.map((m: { id: string }) => m.id)).toContain(issuedId);
    });

    it('does not let a student share someone else’s marksheet', async () => {
      const divya = await login('divya@student.test', 'Strong@123');
      const res = await request(app).post(`/api/consents/${requestId}/approve`).set('Authorization', divya).send({ marksheetId: issuedId });
      expect(res.status).toBe(400);
    });

    it('approves, then the partner redeems the reference exactly once and the signature verifies', async () => {
      const res = await request(app).post(`/api/consents/${requestId}/approve`).set('Authorization', student).send({ marksheetId: issuedId });
      expect(res.status).toBe(200);
      const url = new URL(res.body.redirectUrl);
      expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
      expect(url.searchParams.get('state')).toBe('state-value-1234567890');
      const code = url.searchParams.get('code')!;

      const redeemed = await request(app).post('/api/partner/documents/redeem').set('Authorization', partnerAuth).send({ code });
      expect(redeemed.status).toBe(200);
      const body = redeemed.body as RedeemResponse;
      expect(body.consentReference).toMatch(/^CNS-\d{4}-[A-Z0-9]{8}$/);
      expect(body.document.payload.student.rollNumber).toBe('21KV1A0542');
      expect(body.document.payload.testData).toBe(true);

      const reg = await request(app).get(`/api/registry/issuers/${body.document.payload.issuer.institutionId}`);
      const key = (reg.body as IssuerRegistryEntry).keys.find((k) => k.keyId === body.document.signature.keyId)!;
      const hash = crypto.createHash('sha256').update(canonicalJson(body.document.payload)).digest('hex');
      expect(hash).toBe(body.document.signature.documentHash);
      const ok = crypto.verify(null, Buffer.from(hash, 'hex'), crypto.createPublicKey(key.publicKeyPem), Buffer.from(body.document.signature.signature, 'base64'));
      expect(ok).toBe(true);

      // Tampering with any field breaks the signature.
      const tampered = { ...body.document.payload, percentage: 99 };
      const tamperedHash = crypto.createHash('sha256').update(canonicalJson(tampered)).digest('hex');
      expect(tamperedHash).not.toBe(body.document.signature.documentHash);

      // The shared PDF is exactly the signed file.
      const sharedPdf = Buffer.from(body.document.fileBase64, 'base64');
      expect(sharedPdf.equals(PDF_V2)).toBe(true);
      expect(crypto.createHash('sha256').update(sharedPdf).digest('hex')).toBe(body.document.payload.file.sha256);

      const again = await request(app).post('/api/partner/documents/redeem').set('Authorization', partnerAuth).send({ code });
      expect(again.status).toBe(400);

      const history = await request(app).get('/api/me/consents').set('Authorization', student);
      expect(history.body.items[0].status).toBe('REDEEMED');

      const shared = await AuditLog.countDocuments({ action: 'DOCUMENT_SHARED' });
      expect(shared).toBe(1);
    });

    it('cannot answer a request twice', async () => {
      const res = await request(app).post(`/api/consents/${requestId}/deny`).set('Authorization', student);
      expect(res.status).toBe(409);
    });

    it('denying sends the student back with access_denied', async () => {
      const created = await createRequest();
      const res = await request(app).post(`/api/consents/${created.requestId}/deny`).set('Authorization', student);
      expect(new URL(res.body.redirectUrl).searchParams.get('error')).toBe('access_denied');
    });
  });

  it('revoked marksheets can no longer be chosen for sharing', async () => {
    const rev = await request(app).post(`/api/issuer/marksheets/${issuedId}/revoke`).set('Authorization', issuer).send({ reason: 'Marks entered incorrectly' });
    expect(rev.body.marksheet.status).toBe('REVOKED');
    const created = await request(app)
      .post('/api/partner/access-requests')
      .set('Authorization', partnerAuth)
      .send({ documentType: 'MARKSHEET', purpose: 'Verify the marksheet again', redirectUri: REDIRECT, state: 'state-value-abcdefghijk' });
    const screen = await request(app).get(`/api/consents/${created.body.requestId}`).set('Authorization', student);
    expect(screen.body.marksheets).toHaveLength(0);
  });

  it('a suspended institution cannot issue', async () => {
    const list = await request(app).get('/api/admin/institutions?search=KVCE').set('Authorization', admin);
    const kvce = list.body.items[0];
    await request(app).patch(`/api/admin/institutions/${kvce.id}/status`).set('Authorization', admin).send({ status: 'SUSPENDED' });
    const res = await sendMarksheet('post', '/api/issuer/marksheets', issuer, marksheetFields(seededRecordId, 7), pdf());
    expect(res.status).toBe(403);
    await request(app).patch(`/api/admin/institutions/${kvce.id}/status`).set('Authorization', admin).send({ status: 'ACTIVE' });
  });
});

describe('partner enrolment check', () => {
  const check = (body: object, auth = partnerAuth) => request(app).post('/api/partner/enrolments/check').set('Authorization', auth).send(body);

  it('confirms an enrolled roll number with the institution’s record', async () => {
    const issuers = await request(app).get('/api/registry/issuers');
    const kvce = issuers.body.items.find((i: { code: string }) => i.code === 'KVCE-TEST');
    const res = await check({ institutionId: kvce.institutionId, rollNumber: '21kv1a0542' });
    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(true);
    expect(res.body.student).toMatchObject({ fullName: 'Rahul Kumar', rollNumber: '21KV1A0542' });
    expect(res.body.institution.code).toBe('KVCE-TEST');

    const missing = await check({ institutionId: kvce.institutionId, rollNumber: '21KV1A9999' });
    expect(missing.body.enrolled).toBe(false);
    expect(missing.body.student).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'ENROLMENT_CHECKED' })).toBe(2);
  });

  it('requires partner credentials and a registered institution', async () => {
    expect((await check({ institutionId: 'x', rollNumber: '1' }, `Basic ${Buffer.from('edubridge:wrong').toString('base64')}`)).status).toBe(401);
    expect((await check({ institutionId: '64b000000000000000000000', rollNumber: '21KV1A0542' })).status).toBe(404);
  });
});
