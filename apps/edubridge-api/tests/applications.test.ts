import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { AuditLog } from '../src/modules/audit/audit.model';
import { DEMO_PASSWORD, seedDemoUsers } from '../src/scripts/seedData';

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const personal = {
  dateOfBirth: '2004-03-15',
  gender: 'MALE',
  addressLine: '12-4-56, Gandhi Nagar',
  city: 'Guntur',
  district: 'Guntur',
  state: 'Andhra Pradesh',
  pincode: '522002',
};
const education = {
  institutionName: 'Test Institute of Technology',
  university: 'Test University',
  level: 'UNDERGRADUATE',
  course: 'B.Tech',
  specialization: 'Computer Science',
  currentYear: 3,
  durationYears: 4,
  rollNumber: '21TEST0042',
  lastExamPercentage: 81.5,
};
const family = {
  familyMembers: 5,
  earningMembers: 1,
  dependentsStudying: 2,
  annualFamilyIncome: 140000,
  primaryEarnerOccupation: 'Daily wage worker',
  circumstances: ['FIRST_GENERATION_LEARNER'],
};
const support = {
  expenses: { tuition: 65000, hostel: 30000, books: 5000, exam: 3000, transport: 2000, other: 0 },
  existingAid: 25000,
  existingAidSource: 'State scholarship',
  requestedAmount: 80000,
  statement:
    'My father is the only earning member and my younger sister is also in school. I need help with tuition and hostel fees for my third year.',
};

async function login(email: string, password = DEMO_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return `Bearer ${res.body.accessToken}`;
}
async function registerStudent(email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Second Student', email, password: 'Strong@123', role: 'STUDENT', acceptTerms: true });
  return `Bearer ${res.body.accessToken}`;
}

let student: string;
let admin: string;
let sponsor: string;

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
  [student, admin, sponsor] = await Promise.all([
    login('student@edubridge.test'),
    login('admin@edubridge.test'),
    login('sponsor@edubridge.test'),
  ]);
});
afterAll(async () => {
  await disconnectDB();
});

describe('student application flow', () => {
  let docId = '';

  it('starts one application per academic year (idempotent)', async () => {
    expect((await request(app).get('/api/applications/current').set('Authorization', student)).body.application).toBeNull();
    const a = await request(app).post('/api/applications/current').set('Authorization', student);
    const b = await request(app).post('/api/applications/current').set('Authorization', student);
    expect(a.status).toBe(201);
    expect(a.body.application.applicationNumber).toMatch(/^EB-\d{4}-\d{6}$/);
    expect(b.body.application.id).toBe(a.body.application.id);
    expect(a.body.application.status).toBe('DRAFT');
  });

  it('autosave keeps valid fields and drops invalid ones', async () => {
    const res = await request(app)
      .patch('/api/profile/me')
      .set('Authorization', student)
      .send({ personal: { city: 'Guntur', pincode: '12' } });
    expect(res.status).toBe(200);
    expect(res.body.profile.personal.city).toBe('Guntur');
    expect(res.body.profile.personal.pincode).toBeUndefined();
    expect(res.body.rejected).toContain('personal.pincode');
  });

  it('refuses to submit an incomplete application and lists the gaps', async () => {
    const res = await request(app)
      .post('/api/applications/current/submit')
      .set('Authorization', student)
      .send({ declaration: true, consentToVerify: true });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['personal', 'education', 'family', 'support', 'documents']));
  });

  it('validates uploads by content, size and required numbers', async () => {
    const fake = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', student)
      .field('type', 'MARKSHEET')
      .attach('file', Buffer.from('not really a pdf'), { filename: 'marks.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);

    const big = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', student)
      .field('type', 'MARKSHEET')
      .attach('file', Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), 'big.pdf');
    expect(big.status).toBe(413);

    const noNumber = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', student)
      .field('type', 'INCOME_CERTIFICATE')
      .attach('file', PDF, 'income.pdf');
    expect(noNumber.status).toBe(400);
    expect(noNumber.body.error.details.certificateNumber).toBeDefined();
  });

  it('uploads, replaces and deletes documents', async () => {
    const up = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', student)
      .field('type', 'MARKSHEET')
      .attach('file', PDF, 'marks.pdf');
    expect(up.status).toBe(201);
    const first = up.body.application.documents[0];
    expect(first).toMatchObject({ type: 'MARKSHEET', status: 'PENDING', mimeType: 'application/pdf' });
    expect(first.sha256).toHaveLength(64);

    const replaced = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', student)
      .field('type', 'MARKSHEET')
      .attach('file', PNG, 'marks.png');
    expect(replaced.body.application.documents).toHaveLength(1);
    expect(replaced.body.application.documents[0].mimeType).toBe('image/png');

    const del = await request(app)
      .delete(`/api/applications/current/documents/${replaced.body.application.documents[0].id}`)
      .set('Authorization', student);
    expect(del.body.application.documents).toHaveLength(0);
  });

  it('rejects a request larger than the remaining need', async () => {
    await request(app).patch('/api/profile/me').set('Authorization', student).send({ personal, education });
    await request(app)
      .patch('/api/applications/current')
      .set('Authorization', student)
      .send({ family, support: { ...support, requestedAmount: 90000 } });
    for (const [type, extra] of [
      ['MARKSHEET', {}],
      ['INCOME_CERTIFICATE', { certificateNumber: 'IC2026-0012345', aadhaarNumber: '234567890124' }],
      ['COLLEGE_ID', { rollNumber: '21TEST0042' }],
    ] as const) {
      const r = request(app).post('/api/applications/current/documents').set('Authorization', student).field('type', type);
      for (const [k, v] of Object.entries(extra)) r.field(k, v);
      expect((await r.attach('file', PDF, `${type}.pdf`)).status).toBe(201);
    }
    const res = await request(app)
      .post('/api/applications/current/submit')
      .set('Authorization', student)
      .send({ declaration: true, consentToVerify: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details.support[0]).toMatch(/remaining need of ₹80,000/);
  });

  it('requires the declaration and consent', async () => {
    const res = await request(app).post('/api/applications/current/submit').set('Authorization', student).send({ declaration: true });
    expect(res.status).toBe(400);
  });

  it('submits a complete application and locks it', async () => {
    await request(app).patch('/api/applications/current').set('Authorization', student).send({ support });
    const res = await request(app)
      .post('/api/applications/current/submit')
      .set('Authorization', student)
      .send({ declaration: true, consentToVerify: true });
    expect(res.status).toBe(200);
    const a = res.body.application;
    expect(a.status).toBe('SUBMITTED');
    expect(a.history.map((h: { status: string }) => h.status)).toEqual(['DRAFT', 'SUBMITTED']);
    expect(a.profileSnapshot.education.institutionName).toBe(education.institutionName);
    docId = a.documents[0].id;

    const edit = await request(app).patch('/api/applications/current').set('Authorization', student).send({ family: { familyMembers: 3 } });
    expect(edit.status).toBe(409);
    const upload = await request(app)
      .post('/api/applications/current/documents')
      .set('Authorization', student)
      .field('type', 'MARKSHEET')
      .attach('file', PDF, 'm.pdf');
    expect(upload.status).toBe(409);
  });

  it('protects document files by owner and role', async () => {
    const own = await request(app).get(`/api/documents/${docId}/file`).set('Authorization', student);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect(own.headers['cache-control']).toContain('no-store');

    const other = await registerStudent('other.student@example.com');
    expect((await request(app).get(`/api/documents/${docId}/file`).set('Authorization', other)).status).toBe(403);
    expect((await request(app).get(`/api/documents/${docId}/file`).set('Authorization', sponsor)).status).toBe(403);
    expect((await request(app).get(`/api/documents/${docId}/file`)).status).toBe(401);

    expect((await request(app).get(`/api/documents/${docId}/file`).set('Authorization', admin)).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'DOCUMENT_VIEWED', resourceId: docId })).toBe(1);
  });

  it('lists submitted applications for admins only', async () => {
    const list = await request(app).get('/api/applications?search=Rahul').set('Authorization', admin);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ status: 'SUBMITTED', requestedAmount: 80000, documentsUploaded: 3 });
    expect((await request(app).get('/api/applications').set('Authorization', student)).status).toBe(403);

    const stats = await request(app).get('/api/users/stats').set('Authorization', admin);
    expect(stats.body.applications).toMatchObject({ SUBMITTED: 1 });
  });
});
