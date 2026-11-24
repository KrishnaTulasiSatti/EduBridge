import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { matchScore } from '@edubridge/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Application } from '../src/modules/applications/models';
import { AuditLog } from '../src/modules/audit/audit.model';
import { mlClient } from '../src/modules/assessment/mlClient';
import { issuePanTokenForTests } from '../src/modules/auth/sponsorPan.service';
import { vaultClient } from '../src/modules/eduvault/vaultClient';
import { Certificate, Sponsorship } from '../src/modules/sponsorship/models';
import { DEMO_PASSWORD, seedDemoUsers } from './fixtures';

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const today = () => new Date().toISOString().slice(0, 10);

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
vi.spyOn(mlClient, 'predict').mockRejectedValue(new Error('not needed'));

let student: string;
let admin: string;
let sponsor: string;
let sponsor2: string;
let appId = '';

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
  const volunteer = await login('volunteer@edubridge.test');
  [student, admin, sponsor] = await Promise.all([login('student@edubridge.test'), login('admin@edubridge.test'), login('sponsor@edubridge.test')]);
  const reg = await request(app).post('/api/auth/register').send({
    fullName: 'Kavya Nair',
    email: 'kavya@sponsor.test',
    password: DEMO_PASSWORD,
    role: 'SPONSOR',
    acceptTerms: true,
    panToken: issuePanTokenForTests('AAAPN1234K', 'Kavya Nair'),
  });
  sponsor2 = `Bearer ${reg.body.accessToken}`;

  await request(app).post('/api/applications/current').set('Authorization', student);
  await request(app).patch('/api/profile/me').set('Authorization', student).send({
    personal: { dateOfBirth: '2004-03-15', gender: 'MALE', addressLine: '12-4-56, Gandhi Nagar', city: 'Guntur', district: 'Guntur', state: 'Andhra Pradesh', pincode: '522002' },
    education: { institutionName: 'Test Institute of Technology', university: 'Test University', level: 'UNDERGRADUATE', course: 'B.Tech', currentYear: 3, durationYears: 4, rollNumber: '21TEST0042', lastExamPercentage: 81.5 },
  });
  await request(app).patch('/api/applications/current').set('Authorization', student).send({
    family: { familyMembers: 5, earningMembers: 1, dependentsStudying: 2, annualFamilyIncome: 140000, primaryEarnerOccupation: 'Farmer', circumstances: ['FIRST_GENERATION_LEARNER'] },
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
  await request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', volunteer);
  await request(app).post(`/api/verification/applications/${appId}/review`).set('Authorization', volunteer).send({ recommendation: 'RECOMMEND', summary: 'Checked.' });
  await Application.updateOne({ _id: appId }, { $set: { status: 'ASSESSED' } });
  const decided = await request(app).post(`/api/review/applications/${appId}/decision`).set('Authorization', admin).send({
    decision: 'APPROVED', needLevel: 'HIGH', approvedAmount: 60000, reason: 'High need, verified.',
  });
  expect(decided.status).toBe(200);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectDB();
});

describe('match score', () => {
  const pref = { levels: [], categories: [], states: [], circumstances: [] };
  const c = { level: 'UNDERGRADUATE' as const, state: 'Andhra Pradesh', expenses: { tuition: 75000, hostel: 25000 }, circumstances: ['ORPHAN' as const], remaining: 50000 };

  it('treats empty preferences as "any" and weights the factors 30/30/25/15', () => {
    const r = matchScore(pref, 100000, c);
    expect(r.score).toBe(100);
    expect(r.factors.map((f) => f.weight)).toEqual([0.3, 0.3, 0.25, 0.15]);
  });

  it('scores each factor from the sponsor’s preferences', () => {
    const r = matchScore({ levels: ['POSTGRADUATE'], categories: ['tuition'], states: ['Kerala'], circumstances: ['ORPHAN'] }, 25000, c);
    const v = Object.fromEntries(r.factors.map((f) => [f.key, f.value]));
    expect(v).toEqual({ education: 0, category: 0.75, budget: 0.5, preference: 0.5 });
    expect(r.score).toBe(Math.round((0.3 * 0 + 0.3 * 0.75 + 0.25 * 0.5 + 0.15 * 0.5) * 100));
  });
});

describe('sponsorship', () => {
  it('requires preferences before finding students', async () => {
    const res = await request(app).get('/api/sponsor/students').set('Authorization', sponsor);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PREFERENCES_REQUIRED');
    expect((await request(app).get('/api/sponsor/students').set('Authorization', student)).status).toBe(403);
  });

  it('saves preferences', async () => {
    for (const [token, budget] of [[sponsor, 50000], [sponsor2, 100000]] as const) {
      const res = await request(app).put('/api/sponsor/preferences').set('Authorization', token).send({
        displayName: token === sponsor ? 'Priya Sharma' : 'Kavya Nair', showNameToStudents: token === sponsor, budget,
        levels: ['UNDERGRADUATE'], categories: ['tuition'], states: [], circumstances: ['FIRST_GENERATION_LEARNER'],
      });
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({ budget, committed: 0, available: budget });
    }
  });

  it('hides students until they agree to be shown', async () => {
    const before = await request(app).get('/api/sponsor/students').set('Authorization', sponsor);
    expect(before.body.total).toBe(0);

    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    expect(funding.body).toMatchObject({ eligible: true, approvedAmount: 60000, remaining: 60000, visible: false });

    const res = await request(app).put('/api/funding/me/visibility').set('Authorization', student).send({ visible: true, noteToSponsors: 'Thank you for reading.' });
    expect(res.body.visible).toBe(true);

    const after = await request(app).get('/api/sponsor/students').set('Authorization', sponsor);
    expect(after.body.total).toBe(1);
    const card = after.body.items[0];
    expect(card).toMatchObject({ id: appId, level: 'UNDERGRADUATE', course: 'B.Tech', state: 'Andhra Pradesh', needLevel: 'HIGH', remaining: 60000, noteToSponsors: 'Thank you for reading.' });
    expect(card.alias).toMatch(/^Student [A-Z2-9]{6}$/);
    expect(card.match.score).toBeGreaterThan(50);
    // No private details reach sponsors.
    const text = JSON.stringify(after.body);
    for (const secret of ['Rahul', 'Kumar', 'Guntur', 'Gandhi Nagar', '21TEST0042', 'Test Institute', '140000', 'EB-', 'student@edubridge.test']) {
      expect(text).not.toContain(secret);
    }
  });

  it('never lets pledges exceed the budget or the remaining requirement', async () => {
    const overBudget = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 55000 });
    expect(overBudget.status).toBe(400);
    const overNeed = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor2).send({ amount: 70000 });
    expect(overNeed.status).toBe(400);
    expect((await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 100 })).status).toBe(400);
  });

  it('handles two sponsors pledging at the same moment without over-funding', async () => {
    const [a, b] = await Promise.all([
      request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 40000, messageToStudent: 'Keep going!' }),
      request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor2).send({ amount: 40000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const doc = await Application.findById(appId).lean();
    expect(doc!.funding!.pledged).toBe(40000);
    // Clean up so the rest of the tests start from a known state.
    const winner = a.status === 201 ? sponsor : sponsor2;
    const id = (a.status === 201 ? a : b).body.sponsorship.id;
    expect((await request(app).post(`/api/sponsor/sponsorships/${id}/withdraw`).set('Authorization', winner)).status).toBe(200);
    expect((await Application.findById(appId).lean())!.funding!.pledged).toBe(0);
  });

  let pledgeId = '';
  it('records a pledge, prevents duplicates, and lets the sponsor withdraw it', async () => {
    const res = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 40000, messageToStudent: 'Keep going!' });
    expect(res.status).toBe(201);
    expect(res.body.sponsorship).toMatchObject({ status: 'PLEDGED', amount: 40000 });
    expect(res.body.sponsorship.reference).toMatch(/^SP-\d{4}-\d{6}$/);
    pledgeId = res.body.sponsorship.id;

    const dup = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 5000 });
    expect(dup.status).toBe(409);

    const prefs = await request(app).get('/api/sponsor/preferences').set('Authorization', sponsor);
    expect(prefs.body.profile).toMatchObject({ committed: 40000, available: 10000 });
    const lower = await request(app).put('/api/sponsor/preferences').set('Authorization', sponsor).send({ ...prefs.body.profile, budget: 30000 });
    expect(lower.status).toBe(400);

    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    expect(funding.body).toMatchObject({ pledged: 40000, remaining: 20000 });
    expect(funding.body.sponsorships[0].sponsor.name).toBe('Priya Sharma');
    expect(funding.body.sponsorships[0].messageToStudent).toBe('Keep going!');
  });

  it('lets an admin confirm received funds, updates status and issues signed certificates', async () => {
    expect((await request(app).post(`/api/sponsorships/${pledgeId}/confirm`).set('Authorization', sponsor).send({ receivedOn: today(), reference: 'UTR1' })).status).toBe(403);
    const future = await request(app).post(`/api/sponsorships/${pledgeId}/confirm`).set('Authorization', admin).send({ receivedOn: '2999-01-01', reference: 'UTR1' });
    expect(future.status).toBe(400);

    const res = await request(app).post(`/api/sponsorships/${pledgeId}/confirm`).set('Authorization', admin).send({ receivedOn: today(), reference: 'UTR123456' });
    expect(res.status).toBe(200);
    expect(res.body.sponsorship).toMatchObject({ status: 'CONFIRMED', student: { name: 'Rahul Kumar' }, sponsor: { email: 'sponsor@edubridge.test' } });
    expect((await request(app).post(`/api/sponsorships/${pledgeId}/confirm`).set('Authorization', admin).send({ receivedOn: today(), reference: 'x' })).status).toBe(409);

    const a = await Application.findById(appId).lean();
    expect(a!.status).toBe('PARTIALLY_FUNDED');
    expect(a!.funding).toMatchObject({ pledged: 0, confirmed: 40000 });

    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    const cert = funding.body.sponsorships[0].certificate;
    expect(funding.body.sponsorships[0].confirmation.reference).toBeUndefined();
    expect(cert.number).toMatch(/^EBC-\d{4}-\d{6}$/);

    const verified = await request(app).get(`/api/certificates/${cert.number}?code=${cert.code}`);
    expect(verified.status).toBe(200);
    expect(verified.body.certificate).toMatchObject({ kind: 'STUDENT_AWARD', status: 'VALID', studentName: 'Rahul Kumar', sponsorName: 'Priya Sharma', amount: 40000, signature: { valid: true } });
    expect((await request(app).get(`/api/certificates/${cert.number}?code=WRONGCODE1`)).status).toBe(404);

    const mine = await request(app).get('/api/sponsor/sponsorships').set('Authorization', sponsor);
    const sponsorCert = mine.body.items[0].certificate;
    const sc = await request(app).get(`/api/certificates/${sponsorCert.number}?code=${sponsorCert.code}`);
    expect(sc.body.certificate.kind).toBe('SPONSOR_ACKNOWLEDGEMENT');
    expect(sc.body.certificate.studentName).toBeUndefined();

    // Tampering with stored contents breaks the signature.
    await Certificate.updateOne({ number: cert.number }, { $set: { 'payload.amount': 99999 } });
    const tampered = await request(app).get(`/api/certificates/${cert.number}?code=${cert.code}`);
    expect(tampered.body.certificate.signature.valid).toBe(false);
    await Certificate.updateOne({ number: cert.number }, { $set: { 'payload.amount': 40000 } });
  });

  it('hides the sponsor’s name from the student when asked and marks the application fully funded', async () => {
    const res = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor2).send({ amount: 20000 });
    expect(res.status).toBe(201);
    await request(app).post(`/api/sponsorships/${res.body.sponsorship.id}/confirm`).set('Authorization', admin).send({ receivedOn: today(), reference: 'UTR777' });
    expect((await Application.findById(appId).lean())!.status).toBe('FULLY_FUNDED');

    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    expect(funding.body.remaining).toBe(0);
    const s2 = funding.body.sponsorships.find((s: { amount: number }) => s.amount === 20000);
    expect(s2.sponsor).toMatchObject({ name: 'An EduBridge sponsor', anonymous: true });
    expect(JSON.stringify(funding.body)).not.toContain('Kavya');

    // Fully funded students no longer appear in discovery.
    expect((await request(app).get('/api/sponsor/students').set('Authorization', sponsor).send()).body.total).toBe(0);

    const overview = await request(app).get('/api/sponsorships/overview').set('Authorization', admin);
    expect(overview.body.totals).toMatchObject({ confirmed: 60000, pledged: 0, remaining: 0, fullyFunded: 1 });
  });

  it('lets an admin cancel a confirmed sponsorship, revoking its certificates', async () => {
    const res = await request(app).post(`/api/sponsorships/${pledgeId}/cancel`).set('Authorization', admin).send({ reason: 'Funds returned to the sponsor.' });
    expect(res.status).toBe(200);
    expect(res.body.sponsorship.status).toBe('CANCELLED');
    expect((await Application.findById(appId).lean())!.status).toBe('PARTIALLY_FUNDED');
    const certs = await Certificate.find({ sponsorship: pledgeId }).lean();
    expect(certs.every((c) => c.revokedAt)).toBe(true);
    const prefs = await request(app).get('/api/sponsor/preferences').set('Authorization', sponsor);
    expect(prefs.body.profile).toMatchObject({ committed: 0, confirmed: 0 });
  });

  it('releases pledges that were not confirmed in time', async () => {
    const res = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 10000 });
    expect(res.status).toBe(201);
    await Sponsorship.updateOne({ _id: res.body.sponsorship.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const list = await request(app).get('/api/sponsor/sponsorships').set('Authorization', sponsor);
    expect(list.body.items.find((s: { id: string }) => s.id === res.body.sponsorship.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'EXPIRED' });
    expect((await Application.findById(appId).lean())!.funding!.pledged).toBe(0);
  });

  it('lets the sponsor send money straight to the student’s bank account and the student confirm it', async () => {
    const ACCOUNT = '123456789012';
    const res = await request(app).post(`/api/sponsor/students/${appId}/pledge`).set('Authorization', sponsor).send({ amount: 30000 });
    expect(res.status).toBe(201);
    const id = res.body.sponsorship.id;
    expect(res.body.sponsorship.studentBankReady).toBe(false);

    // Nothing can be sent until the student has added bank details.
    const noBank = await request(app).get(`/api/sponsor/sponsorships/${id}/bank-details`).set('Authorization', sponsor);
    expect(noBank.body.error.code).toBe('BANK_DETAILS_MISSING');
    expect((await request(app).post(`/api/sponsor/sponsorships/${id}/sent`).set('Authorization', sponsor).send({ sentOn: today(), reference: 'UTR0001' })).status).toBe(409);

    const bad = await request(app).put('/api/funding/me/bank-details').set('Authorization', student).send({ accountHolderName: 'Rahul Kumar', accountNumber: ACCOUNT, ifsc: 'BAD', bankName: 'State Bank of India' });
    expect(bad.status).toBe(400);
    const saved = await request(app).put('/api/funding/me/bank-details').set('Authorization', student).send({ accountHolderName: 'Rahul Kumar', accountNumber: '1234 5678 9012', ifsc: 'sbin0001234', bankName: 'State Bank of India' });
    expect(saved.status).toBe(200);
    expect(saved.body.bankDetails).toMatchObject({ accountNumberLast4: '9012', ifsc: 'SBIN0001234' });
    expect(JSON.stringify(saved.body)).not.toContain(ACCOUNT);
    // Stored encrypted, never in the audit log.
    const { BankAccount } = await import('../src/modules/sponsorship/models');
    expect(JSON.stringify(await BankAccount.find().lean())).not.toContain(ACCOUNT);

    // Only this sponsor can see the full details, and only while the money is still to be sent.
    expect((await request(app).get(`/api/sponsor/sponsorships/${id}/bank-details`).set('Authorization', sponsor2)).status).toBe(404);
    const bank = await request(app).get(`/api/sponsor/sponsorships/${id}/bank-details`).set('Authorization', sponsor);
    expect(bank.body.bankDetails).toEqual({ accountHolderName: 'Rahul Kumar', accountNumber: ACCOUNT, ifsc: 'SBIN0001234', bankName: 'State Bank of India' });

    const sent = await request(app).post(`/api/sponsor/sponsorships/${id}/sent`).set('Authorization', sponsor).send({ sentOn: today(), reference: 'UTR0001' });
    expect(sent.status).toBe(200);
    expect(sent.body.items.find((s: { id: string }) => s.id === id)).toMatchObject({ status: 'SENT', payment: { reference: 'UTR0001', toAccountLast4: '9012' } });
    expect((await request(app).post(`/api/sponsor/sponsorships/${id}/withdraw`).set('Authorization', sponsor)).status).toBe(409);
    // Sent money does not expire.
    expect((await Sponsorship.findById(id).lean())!.expiresAt).toBeUndefined();

    // The student reports it missing; the sponsor can then record a corrected transfer.
    const missing = await request(app).post(`/api/funding/me/sponsorships/${id}/not-received`).set('Authorization', student).send({ note: 'Nothing in my account yet.' });
    expect(missing.body.sponsorships.find((s: { id: string }) => s.id === id).payment.notReceived.note).toBe('Nothing in my account yet.');
    const admins = await request(app).get('/api/sponsorships').set('Authorization', admin);
    expect(admins.body.items[0].id).toBe(id);
    const resent = await request(app).post(`/api/sponsor/sponsorships/${id}/sent`).set('Authorization', sponsor).send({ sentOn: today(), reference: 'UTR0002' });
    expect(resent.body.items.find((s: { id: string }) => s.id === id).payment).toMatchObject({ reference: 'UTR0002' });
    expect(resent.body.items.find((s: { id: string }) => s.id === id).payment.notReceived).toBeUndefined();

    // Another student cannot confirm it; this student can, with no administrator involved.
    const received = await request(app).post(`/api/funding/me/sponsorships/${id}/received`).set('Authorization', student);
    expect(received.status).toBe(200);
    const mine = received.body.sponsorships.find((s: { id: string }) => s.id === id);
    expect(mine).toMatchObject({ status: 'CONFIRMED', confirmation: { byStudent: true } });
    expect(mine.certificate.number).toMatch(/^EBC-/);
    expect(received.body).toMatchObject({ confirmed: 50000, pledged: 0 });
    expect((await request(app).post(`/api/funding/me/sponsorships/${id}/received`).set('Authorization', student)).status).toBe(409);
    expect((await request(app).get(`/api/sponsor/sponsorships/${id}/bank-details`).set('Authorization', sponsor)).status).toBe(409);

    const logs = JSON.stringify(await AuditLog.find({ action: { $in: ['BANK_DETAILS_SAVED', 'BANK_DETAILS_VIEWED'] } }).lean());
    expect(logs).not.toContain(ACCOUNT);
  });

  it('records every sponsorship activity in the audit log', async () => {
    const actions = await AuditLog.distinct('action');
    for (const a of ['SPONSOR_PREFERENCES_UPDATED', 'SPONSOR_VISIBILITY_CHANGED', 'SPONSORSHIP_PLEDGED', 'SPONSORSHIP_CONFIRMED', 'SPONSORSHIP_CANCELLED', 'SPONSORSHIP_EXPIRED', 'CERTIFICATE_ISSUED', 'CERTIFICATE_REVOKED', 'BANK_DETAILS_SAVED', 'BANK_DETAILS_VIEWED', 'SPONSORSHIP_SENT', 'SPONSORSHIP_NOT_RECEIVED']) {
      expect(actions).toContain(a);
    }
  });
});
