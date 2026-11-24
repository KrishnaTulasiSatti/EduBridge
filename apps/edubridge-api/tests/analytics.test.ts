import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Application, StudentDocument } from '../src/modules/applications/models';
import { AuditLog } from '../src/modules/audit/audit.model';
import { redact } from '../src/modules/audit/audit.service';
import { User } from '../src/modules/auth/user.model';
import { mlClient } from '../src/modules/assessment/mlClient';
import { vaultClient } from '../src/modules/eduvault/vaultClient';
import { purgeExpiredDocuments } from '../src/modules/retention/retention.service';
import { DEMO_PASSWORD, seedDemoUsers } from './fixtures';

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  return `Bearer ${res.body.accessToken}`;
}

const TIT = { institutionId: 'x', name: 'Test Institute of Technology', university: 'Test University', code: 'TIT', status: 'ACTIVE' as const };
vi.spyOn(vaultClient, 'listIssuers').mockResolvedValue({ items: [{ ...TIT, keys: [] }] });
vi.spyOn(vaultClient, 'checkEnrolment').mockResolvedValue({
  institution: TIT,
  enrolled: true,
  student: { fullName: 'Rahul Kumar', rollNumber: '21TEST0042', programme: 'B.Tech CSE', admissionYear: 2023 },
  checkedAt: new Date().toISOString(),
});
vi.spyOn(mlClient, 'predict').mockRejectedValue(new Error('ML service down'));

let student: string;
let volunteer: string;
let admin: string;
let sponsor: string;
let appId = '';
let appNumber = '';
let docIds: Record<string, string> = {};

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
  [student, volunteer, admin, sponsor] = await Promise.all(
    ['student', 'volunteer', 'admin', 'sponsor'].map((r) => login(`${r}@edubridge.test`)),
  );

  await request(app).post('/api/applications/current').set('Authorization', student);
  await request(app).patch('/api/profile/me').set('Authorization', student).send({
    personal: { dateOfBirth: '2004-03-15', gender: 'MALE', addressLine: '12-4-56, Gandhi Nagar', city: 'Guntur', district: 'Guntur', state: 'Andhra Pradesh', pincode: '522002' },
    education: { institutionName: 'Test Institute of Technology', university: 'Test University', level: 'UNDERGRADUATE', course: 'B.Tech', currentYear: 3, durationYears: 4, rollNumber: '21TEST0042', lastExamPercentage: 81.5 },
  });
  await request(app).patch('/api/applications/current').set('Authorization', student).send({
    family: { familyMembers: 5, earningMembers: 1, dependentsStudying: 2, annualFamilyIncome: 140000, primaryEarnerOccupation: 'Farmer', circumstances: [] },
    support: { expenses: { tuition: 65000, hostel: 30000, books: 5000, exam: 3000, transport: 2000, other: 0 }, existingAid: 25000, existingAidSource: 'State scholarship', requestedAmount: 80000, statement: 'Need help with fees.' },
  });
  for (const [type, extra] of [
    ['MARKSHEET', {}],
    ['INCOME_CERTIFICATE', { certificateNumber: 'IC2026-0012345', aadhaarNumber: '234567890124' }],
    ['COLLEGE_ID', { rollNumber: '21TEST0042' }],
  ] as const) {
    const r = request(app).post('/api/applications/current/documents').set('Authorization', student).field('type', type);
    for (const [k, v] of Object.entries(extra)) r.field(k, v);
    await r.attach('file', PDF, `${type}.pdf`);
  }
  const submitted = await request(app).post('/api/applications/current/submit').set('Authorization', student).send({ declaration: true, consentToVerify: true });
  appId = submitted.body.application.id;
  appNumber = submitted.body.application.applicationNumber;
  docIds = Object.fromEntries(submitted.body.application.documents.map((d: { type: string; id: string }) => [d.type, d.id]));
});
afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectDB();
});

describe('analytics dashboard', () => {
  it('is for admins only', async () => {
    for (const t of [student, volunteer, sponsor]) expect((await request(app).get('/api/analytics').set('Authorization', t)).status).toBe(403);
    expect((await request(app).get('/api/analytics')).status).toBe(401);
  });

  it('counts students, applications and documents awaiting review', async () => {
    const res = await request(app).get('/api/analytics').set('Authorization', admin);
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a.users.students).toBeGreaterThanOrEqual(1);
    expect(a.applications).toMatchObject({ submitted: 1, awaitingVerification: 1, approved: 0, rejected: 0 });
    expect(a.documents.awaitingReview).toBe(3);
    expect(a.trend).toHaveLength(12);
    expect(a.trend.at(-1).submitted).toBe(1);
    expect(a.sponsorship).toMatchObject({ eligibleStudents: 0, remainingAmount: 0 });
  });

  it('reports volunteer verification activity from the audit log', async () => {
    await request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', volunteer);
    await request(app).post(`/api/verification/applications/${appId}/documents/${docIds.MARKSHEET}/review`).set('Authorization', volunteer).send({
      type: 'MARKSHEET', outcome: 'VERIFIED', note: 'Looks genuine.', nameOnDocument: 'Rahul Kumar', percentage: 81.5,
    });
    const res = await request(app).get('/api/analytics').set('Authorization', admin);
    const row = res.body.volunteerActivity.find((v: { name: string }) => v.name);
    expect(row).toMatchObject({ role: 'VOLUNTEER', claimed: 1, checks: 1, reviews: 0 });
    expect(row.lastActiveAt).toBeTruthy();
    expect(res.body.applications.underVerification).toBe(1);
  });
});

describe('audit log explorer', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/audit').set('Authorization', volunteer)).status).toBe(403);
    expect((await request(app).get('/api/audit/export').set('Authorization', student)).status).toBe(403);
  });

  it('lists entries newest first with actor, filters by category, role and resource', async () => {
    const all = await request(app).get('/api/audit').set('Authorization', admin);
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThan(5);
    const times = all.body.items.map((i: { createdAt: string }) => i.createdAt);
    expect([...times].sort().reverse()).toEqual(times);

    const verification = await request(app).get('/api/audit?category=VERIFICATION').set('Authorization', admin);
    expect(verification.body.items.length).toBeGreaterThanOrEqual(2);
    expect(verification.body.items.every((i: { action: string }) => ['VERIFICATION_CLAIMED', 'DOCUMENT_REVIEWED', 'ENROLMENT_CHECKED'].includes(i.action))).toBe(true);

    const byNumber = await request(app).get(`/api/audit?resource=${appNumber}`).set('Authorization', admin);
    expect(byNumber.body.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['APPLICATION_SUBMITTED', 'VERIFICATION_CLAIMED']));

    const students = await request(app).get('/api/audit?role=STUDENT&actor=rahul').set('Authorization', admin);
    expect(students.body.items.length).toBeGreaterThan(0);
    expect(students.body.items.every((i: { actorRole: string; actor: { name: string } }) => i.actorRole === 'STUDENT')).toBe(true);
  });

  it('finds failed sign-ins for unknown emails by the email used', async () => {
    await request(app).post('/api/auth/login').send({ email: 'nobody.here@example.com', password: 'Wrong@1234' });
    const res = await request(app).get('/api/audit?action=LOGIN_FAILED&actor=nobody.here').set('Authorization', admin);
    expect(res.body.items[0]).toMatchObject({ action: 'LOGIN_FAILED', actor: null, metadata: { email: 'nobody.here@example.com' } });
  });

  it('shows one entry with related activity on the same resource', async () => {
    const list = await request(app).get('/api/audit?action=VERIFICATION_CLAIMED').set('Authorization', admin);
    const res = await request(app).get(`/api/audit/${list.body.items[0].id}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.entry.resourceId).toBe(appId);
    expect(res.body.related.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/audit/not-an-id').set('Authorization', admin)).status).toBe(404);
  });

  it('rejects invalid filters with 400, not a server error', async () => {
    expect((await request(app).get('/api/audit?action=DROP_TABLE').set('Authorization', admin)).status).toBe(400);
    expect((await request(app).get('/api/audit?from=yesterday').set('Authorization', admin)).status).toBe(400);
    expect((await request(app).get('/api/audit?from=2026-05-02&to=2026-05-01').set('Authorization', admin)).status).toBe(400);
  });

  it('exports CSV, neutralises spreadsheet formulas and audits the export', async () => {
    await AuditLog.create({ action: 'LOGIN_FAILED', resourceType: 'User', metadata: { email: '=HYPERLINK("http://x")' } });
    const res = await request(app).get('/api/audit/export?category=SECURITY').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="edubridge-audit-/);
    expect(res.text).toContain('Failed sign-in');
    expect(res.text).not.toMatch(/,"=HYPERLINK/);
    expect(await AuditLog.countDocuments({ action: 'AUDIT_EXPORTED' })).toBe(1);
  });

  it('cannot be edited or deleted', async () => {
    await expect(AuditLog.deleteMany({})).rejects.toThrow('immutable');
    await expect(AuditLog.updateOne({}, { action: 'X' })).rejects.toThrow('immutable');
  });
});

describe('security hardening', () => {
  it('redacts secrets from audit metadata', () => {
    expect(redact({ password: 'x', nested: { refreshToken: 'y', aadhaarNumber: '1', aadhaarLast4: '0124' }, reference: 'SP-1' })).toEqual({
      password: '[redacted]',
      nested: { refreshToken: '[redacted]', aadhaarNumber: '[redacted]', aadhaarLast4: '0124' },
      reference: 'SP-1',
    });
  });

  it('rejects MongoDB operators in request bodies and query strings', async () => {
    const body = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(body.status).toBe(400);
    const query = await request(app).get('/api/users?$where=1').set('Authorization', admin);
    expect(query.status).toBe(400);
  });

  it('sends no-store and strict security headers', async () => {
    const res = await request(app).get('/api/analytics').set('Authorization', admin);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('ends access at once when an account is suspended, not when its token expires', async () => {
    const sponsorUser = await User.findOne({ email: 'sponsor@edubridge.test' });
    expect((await request(app).get('/api/sponsor/preferences').set('Authorization', sponsor)).status).not.toBe(401);
    const res = await request(app).patch(`/api/users/${sponsorUser!.id}/status`).set('Authorization', admin).send({ status: 'SUSPENDED' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/sponsor/preferences').set('Authorization', sponsor)).status).toBe(401);
    await request(app).patch(`/api/users/${sponsorUser!.id}/status`).set('Authorization', admin).send({ status: 'ACTIVE' });
  });

  it('rejects tokens signed with another algorithm or secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: 'x', role: 'ADMIN' }, 'not-the-secret-not-the-secret-123', { issuer: 'edubridge', audience: 'edubridge-web' });
    expect((await request(app).get('/api/analytics').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    const none = jwt.sign({ sub: 'x', role: 'ADMIN' }, '', { algorithm: 'none', issuer: 'edubridge', audience: 'edubridge-web' });
    expect((await request(app).get('/api/analytics').set('Authorization', `Bearer ${none}`)).status).toBe(401);
  });
});

describe('document retention', () => {
  it('deletes the files of a not-approved application after the retention period, keeping the record', async () => {
    // Fast-forward: make the application a not-approved one decided long ago.
    await Application.updateOne(
      { _id: appId },
      { $set: { status: 'REJECTED', decision: { decision: 'REJECTED', needLevel: 'LOW', reason: 'Test', by: (await User.findOne({ role: 'ADMIN' }))!._id, at: new Date('2020-01-01') } } },
    );
    const first = await purgeExpiredDocuments();
    expect(first).toEqual({ applications: 1, files: 3 });
    const docs = await StudentDocument.find({ application: appId });
    expect(docs.every((d) => d.purgedAt && d.sha256)).toBe(true);

    const open = await request(app).get(`/api/documents/${docIds.MARKSHEET}/file`).set('Authorization', student);
    expect(open.status).toBe(410);
    expect(await AuditLog.countDocuments({ action: 'DOCUMENTS_PURGED', resourceId: appId })).toBe(1);

    // Running again does nothing.
    expect(await purgeExpiredDocuments()).toEqual({ applications: 0, files: 0 });
  });

  it('keeps files of approved applications and of recent decisions', async () => {
    await Application.updateOne({ _id: appId }, { $set: { 'decision.at': new Date() } });
    await StudentDocument.updateMany({ application: appId }, { $unset: { purgedAt: 1 } });
    expect(await purgeExpiredDocuments()).toEqual({ applications: 0, files: 0 });
  });
});
