import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { AuditLog } from '../src/modules/audit/audit.model';
import { vaultClient } from '../src/modules/eduvault/vaultClient';
import { clearRegistryCache } from '../src/modules/verification/registry';
import { DEMO_PASSWORD, seedDemoUsers } from '../src/scripts/seedData';
import { StudentDocument } from '../src/modules/applications/models';

// Passes the Aadhaar (Verhoeff) checksum; made up for tests, not anyone's real number.
const TEST_AADHAAR = '234567890124';

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  return `Bearer ${res.body.accessToken}`;
}

let student: string;
let volunteer: string;
let admin: string;
let sponsor: string;
let appId = '';
const docIds: Record<string, string> = {};

async function submitApplication() {
  await request(app).post('/api/applications/current').set('Authorization', student);
  await request(app)
    .patch('/api/profile/me')
    .set('Authorization', student)
    .send({
      personal: { dateOfBirth: '2004-03-15', gender: 'MALE', addressLine: '12-4-56, Gandhi Nagar', city: 'Guntur', district: 'Guntur', state: 'Andhra Pradesh', pincode: '522002' },
      education: { institutionName: 'Test Institute of Technology', university: 'Test University', level: 'UNDERGRADUATE', course: 'B.Tech', currentYear: 3, durationYears: 4, rollNumber: '21TEST0042', lastExamPercentage: 81.5 },
    });
  await request(app)
    .patch('/api/applications/current')
    .set('Authorization', student)
    .send({
      family: { familyMembers: 5, earningMembers: 1, dependentsStudying: 2, annualFamilyIncome: 140000, primaryEarnerOccupation: 'Farmer', circumstances: [] },
      support: {
        expenses: { tuition: 65000, hostel: 30000, books: 5000, exam: 3000, transport: 2000, other: 0 },
        existingAid: 0,
        requestedAmount: 80000,
        statement: 'My father is the only earning member of our family and my sister is in school. I need help with tuition and hostel fees.',
      },
    });
  const uploads: [string, Record<string, string>][] = [
    ['MARKSHEET', {}],
    ['INCOME_CERTIFICATE', { certificateNumber: 'IC2026-0012345', aadhaarNumber: '2345 6789 0124' }],
    // Different from the roll number in the profile: should be flagged.
    ['COLLEGE_ID', { rollNumber: '21TEST0043' }],
  ];
  for (const [type, extra] of uploads) {
    const r = request(app).post('/api/applications/current/documents').set('Authorization', student).field('type', type);
    for (const [k, v] of Object.entries(extra)) r.field(k, v);
    expect((await r.attach('file', PDF, `${type}.pdf`)).status).toBe(201);
  }
}

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
  [student, volunteer, admin, sponsor] = await Promise.all([
    login('student@edubridge.test'),
    login('volunteer@edubridge.test'),
    login('admin@edubridge.test'),
    login('sponsor@edubridge.test'),
  ]);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectDB();
});

// The EduVault issuer registry is mocked so the tests do not depend on EduVault running.
vi.spyOn(vaultClient, 'listIssuers').mockResolvedValue({
  items: [{ institutionId: 'x', name: 'Test Institute of Technology (Test)', university: 'Test University', code: 'TIT', status: 'ACTIVE', keys: [] }],
});
const TIT = { institutionId: 'x', name: 'Test Institute of Technology (Test)', university: 'Test University', code: 'TIT', status: 'ACTIVE' as const };
// First lookup (when verification starts): the roll number on the ID card is not enrolled.
const enrolmentSpy = vi.spyOn(vaultClient, 'checkEnrolment').mockResolvedValue({ institution: TIT, enrolled: false, checkedAt: new Date().toISOString() });

describe('institution registry check', () => {
  it('reports when the registry cannot be reached', async () => {
    const { checkInstitution } = await import('../src/modules/verification/registry');
    vi.mocked(vaultClient.listIssuers).mockRejectedValueOnce(new Error('down'));
    clearRegistryCache();
    expect((await checkInstitution({ institutionName: 'Test Institute of Technology' })).result).toBe('UNAVAILABLE');
    expect((await checkInstitution({ institutionName: 'Unknown College of Arts' })).result).toBe('NOT_FOUND');
  });
});

describe('income certificate validity', () => {
  it('is valid for 4 years from the date of issue', async () => {
    const { incomeCertificateValid } = await import('@edubridge/shared');
    const on = new Date('2026-11-23');
    expect(incomeCertificateValid('2022-11-23', on)).toBe(true); // exactly 4 years
    expect(incomeCertificateValid('2023-06-01', on)).toBe(true);
    expect(incomeCertificateValid('2022-11-22', on)).toBe(false); // one day past 4 years
    expect(incomeCertificateValid('2026-12-01', on)).toBe(false); // dated in the future
  });
});

describe('submission', () => {
  it('requires a valid Aadhaar number with the income certificate', async () => {
    await request(app).post('/api/applications/current').set('Authorization', student);
    const upload = (aadhaar?: string) => {
      const r = request(app).post('/api/applications/current/documents').set('Authorization', student).field('type', 'INCOME_CERTIFICATE').field('certificateNumber', 'IC2026-0012345');
      if (aadhaar) r.field('aadhaarNumber', aadhaar);
      return r.attach('file', PDF, 'income.pdf');
    };
    expect((await upload()).body.error.details.aadhaarNumber).toBeDefined();
    const badChecksum = await upload('2345 6789 0123');
    expect(badChecksum.status).toBe(400);
    expect(badChecksum.body.error.details.aadhaarNumber[0]).toMatch(/not a valid Aadhaar/);

    const ok = await upload('2345 6789 0124');
    expect(ok.status).toBe(201);
    const doc = ok.body.application.documents.find((d: { type: string }) => d.type === 'INCOME_CERTIFICATE');
    expect(doc.aadhaarLast4).toBe('0124');
    expect(JSON.stringify(ok.body)).not.toContain(TEST_AADHAAR);
    // Stored only in encrypted form.
    const stored = await StudentDocument.findById(doc.id).select('+aadhaarEncrypted').lean();
    expect(stored!.aadhaarEncrypted).toMatch(/^v1\./);
    expect(JSON.stringify(stored)).not.toContain(TEST_AADHAAR);
  });

  it('submits an application for verification', async () => {
    await submitApplication();
    const submit = await request(app)
      .post('/api/applications/current/submit')
      .set('Authorization', student)
      .send({ declaration: true, consentToVerify: true });
    expect(submit.status).toBe(200);
    appId = submit.body.application.id;
    for (const d of submit.body.application.documents) docIds[d.type] = d.id;
  });
});

describe('volunteer verification workflow', () => {
  it('is limited to volunteers and admins', async () => {
    expect((await request(app).get('/api/verification/queue').set('Authorization', student)).status).toBe(403);
    expect((await request(app).get('/api/verification/queue').set('Authorization', sponsor)).status).toBe(403);
    expect((await request(app).get('/api/verification/queue?scope=all').set('Authorization', volunteer)).status).toBe(403);
  });

  it('shows submitted applications in the available queue but not their details', async () => {
    const q = await request(app).get('/api/verification/queue?scope=available').set('Authorization', volunteer);
    expect(q.status).toBe(200);
    expect(q.body.items.map((i: { id: string }) => i.id)).toContain(appId);
    expect((await request(app).get(`/api/verification/applications/${appId}`).set('Authorization', volunteer)).status).toBe(403);
    expect((await request(app).get(`/api/documents/${docIds.INCOME_CERTIFICATE}/file`).set('Authorization', volunteer)).status).toBe(403);
  });

  it('lets exactly one person claim an application', async () => {
    const [a, b] = await Promise.all([
      request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', volunteer),
      request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', admin),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    // Make sure the volunteer ends up holding it for the rest of the tests.
    if (a.status !== 200) {
      await request(app).post(`/api/verification/applications/${appId}/release`).set('Authorization', admin);
      expect((await request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', volunteer)).status).toBe(200);
    }
    const detail = await request(app).get(`/api/verification/applications/${appId}`).set('Authorization', volunteer);
    expect(detail.body.canEdit).toBe(true);
    expect(detail.body.application.status).toBe('UNDER_VERIFICATION');
    const statusOf = (t: string) => detail.body.application.documents.find((d: { type: string }) => d.type === t).status;
    expect(statusOf('MARKSHEET')).toBe('PROCESSING');
    expect(statusOf('INCOME_CERTIFICATE')).toBe('PROCESSING');
    // The college ID was checked against EduVault automatically when verification started.
    expect(enrolmentSpy).toHaveBeenCalledWith({ institutionId: 'x', rollNumber: '21TEST0043' });
    expect(statusOf('COLLEGE_ID')).toBe('REVIEW_REQUIRED');
    const collegeId = detail.body.application.documents.find((d: { type: string }) => d.type === 'COLLEGE_ID');
    expect(collegeId.enrolmentCheck.result).toBe('NOT_ENROLLED');
    expect(detail.body.inconsistencies).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Enrolment' })]));
    expect(detail.body.institutionCheck.result).toBe('REGISTERED');
    expect(detail.body.institutionCheck.match.code).toBe('TIT');
    expect(detail.body.inconsistencies).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Roll number', found: '21TEST0043' })]));

    const student = await request(app).get('/api/applications/current').set('Authorization', `${await login('student@edubridge.test')}`);
    expect(student.body.application.status).toBe('UNDER_VERIFICATION');
  });

  it('shows the full Aadhaar only to the assigned reviewer, and audits it', async () => {
    const url = `/api/verification/applications/${appId}/documents/${docIds.INCOME_CERTIFICATE}/aadhaar`;
    const res = await request(app).post(url).set('Authorization', volunteer);
    expect(res.status).toBe(200);
    expect(res.body.aadhaarNumber).toBe(TEST_AADHAAR);
    expect(res.headers['cache-control']).toContain('no-store');
    expect((await request(app).post(url).set('Authorization', student)).status).toBe(403);
    expect((await request(app).post(`/api/verification/applications/${appId}/documents/${docIds.MARKSHEET}/aadhaar`).set('Authorization', volunteer)).status).toBe(404);
    expect(await AuditLog.countDocuments({ action: 'AADHAAR_VIEWED', resourceId: docIds.INCOME_CERTIFICATE })).toBe(1);
  });

  it('requires evidence before marking a document verified', async () => {
    const res = await request(app)
      .post(`/api/verification/applications/${appId}/documents/${docIds.INCOME_CERTIFICATE}/review`)
      .set('Authorization', volunteer)
      .send({ type: 'INCOME_CERTIFICATE', outcome: 'VERIFIED', note: 'Checked on AP Seva.' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['portalCertificateNumber', 'holderName', 'annualIncome', 'issueDate']));
  });

  it('records an income check and compares it with the application', async () => {
    const res = await request(app)
      .post(`/api/verification/applications/${appId}/documents/${docIds.INCOME_CERTIFICATE}/review`)
      .set('Authorization', volunteer)
      .send({
        type: 'INCOME_CERTIFICATE',
        outcome: 'REVIEW_REQUIRED',
        note: 'Portal shows a higher income than the application states.',
        portalCertificateNumber: 'IC2026-0012345',
        holderName: 'Rahul Kumar',
        annualIncome: 180000,
        // Three years old: still within the 4-year validity.
        issueDate: `${new Date().getFullYear() - 3}-01-15`,
      });
    expect(res.status).toBe(200);
    const doc = res.body.application.documents.find((d: { type: string }) => d.type === 'INCOME_CERTIFICATE');
    expect(doc.status).toBe('REVIEW_REQUIRED');
    const byField = Object.fromEntries(doc.review.checks.map((c: { field: string; match: boolean }) => [c.field, c.match]));
    expect(byField).toEqual({ 'Certificate number': true, 'Name on certificate': true, 'Annual family income': false, 'Within 4-year validity': true });
    expect(res.body.inconsistencies).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Annual family income', application: '₹1,40,000', found: '₹1,80,000' })]));
  });

  it('does not show reviewer notes to the student', async () => {
    const res = await request(app).get('/api/applications/current').set('Authorization', student);
    const doc = res.body.application.documents.find((d: { type: string }) => d.type === 'INCOME_CERTIFICATE');
    expect(doc.status).toBe('REVIEW_REQUIRED');
    expect(doc.review).toBeUndefined();
  });

  it('only accepts the review once every document has a result', async () => {
    const early = await request(app)
      .post(`/api/verification/applications/${appId}/review`)
      .set('Authorization', volunteer)
      .send({ recommendation: 'NEEDS_ADMIN_ATTENTION', summary: 'Income on the certificate is higher than declared in the application.' });
    expect(early.status).toBe(400);
    // College ID already has a result (from the enrolment check); only the marksheet is left.
    expect(early.body.error.details.documents).toHaveLength(1);

    // The college adds the student on EduVault; checking again now finds a matching record.
    enrolmentSpy.mockResolvedValueOnce({
      institution: TIT,
      enrolled: true,
      student: { fullName: 'Rahul Kumar', rollNumber: '21TEST0043', programme: 'B.Tech Computer Science', admissionYear: 2023 },
      checkedAt: new Date().toISOString(),
    });
    const recheck = await request(app).post(`/api/verification/applications/${appId}/enrolment-check`).set('Authorization', volunteer);
    expect(recheck.status).toBe(200);
    const collegeId = recheck.body.application.documents.find((d: { type: string }) => d.type === 'COLLEGE_ID');
    expect(collegeId.status).toBe('VERIFIED');
    expect(collegeId.enrolmentCheck.checks.every((c: { match: boolean }) => c.match)).toBe(true);
    // No manual result can override a confirmed enrolment.
    const manual = await request(app)
      .post(`/api/verification/applications/${appId}/documents/${docIds.COLLEGE_ID}/review`)
      .set('Authorization', volunteer)
      .send({ type: 'COLLEGE_ID', outcome: 'REJECTED', note: 'Trying to override the automatic result.' });
    expect(manual.status).toBe(409);
    expect(await AuditLog.countDocuments({ action: 'ENROLMENT_CHECKED', resourceId: docIds.COLLEGE_ID })).toBe(2);
    expect(
      (
        await request(app)
          .post(`/api/verification/applications/${appId}/documents/${docIds.MARKSHEET}/review`)
          .set('Authorization', volunteer)
          .send({ type: 'MARKSHEET', outcome: 'VERIFIED', note: 'Marksheet matches the details given.', nameOnDocument: 'Rahul Kumar', percentage: 81.5 })
      ).status,
    ).toBe(200);
  });

  it('blocks people who have not claimed the application', async () => {
    const res = await request(app)
      .post(`/api/verification/applications/${appId}/documents/${docIds.MARKSHEET}/review`)
      .set('Authorization', admin)
      .send({ type: 'MARKSHEET', outcome: 'REJECTED', note: 'Trying without claiming first.' });
    expect(res.status).toBe(403);
  });

  it('submits the preliminary review and hands the application to the admin', async () => {
    const res = await request(app)
      .post(`/api/verification/applications/${appId}/review`)
      .set('Authorization', volunteer)
      .send({ recommendation: 'NEEDS_ADMIN_ATTENTION', summary: 'Income on the certificate is higher than declared in the application.' });
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('VOLUNTEER_REVIEWED');
    expect(res.body.canEdit).toBe(false);
    expect(res.body.volunteerReview).toMatchObject({ recommendation: 'NEEDS_ADMIN_ATTENTION', by: { name: 'Meera Iyer' } });

    const reviewed = await request(app).get('/api/verification/queue?scope=reviewed').set('Authorization', volunteer);
    expect(reviewed.body.items[0]).toMatchObject({ id: appId, recommendation: 'NEEDS_ADMIN_ATTENTION' });
    const stats = await request(app).get('/api/verification/stats').set('Authorization', volunteer);
    expect(stats.body).toMatchObject({ mine: 0, reviewedByMe: 1 });

    // The volunteer keeps read access to what they reviewed, but can no longer change it.
    expect((await request(app).get(`/api/verification/applications/${appId}`).set('Authorization', volunteer)).status).toBe(200);
    expect((await request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', volunteer)).status).toBe(409);

    const actions = await AuditLog.distinct('action', { resourceId: { $in: [appId, ...Object.values(docIds)] } });
    expect(actions).toEqual(expect.arrayContaining(['VERIFICATION_CLAIMED', 'DOCUMENT_REVIEWED', 'VOLUNTEER_REVIEW_SUBMITTED']));
  });
});
