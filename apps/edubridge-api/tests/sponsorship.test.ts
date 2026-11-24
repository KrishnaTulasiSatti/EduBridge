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
import { flushMail, testOutbox } from '../src/modules/notifications/mailer';
import { migrateToConnections } from '../src/modules/sponsorship/migrate';
import { SponsorProfile, Sponsorship } from '../src/modules/sponsorship/models';
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

describe('connecting sponsors with students', () => {
  it('requires preferences before finding students', async () => {
    const res = await request(app).get('/api/sponsor/students').set('Authorization', sponsor);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PREFERENCES_REQUIRED');
    expect((await request(app).get('/api/sponsor/students').set('Authorization', student)).status).toBe(403);
  });

  it('saves preferences', async () => {
    for (const [token, budget] of [[sponsor, 50000], [sponsor2, 100000]] as const) {
      const res = await request(app).put('/api/sponsor/preferences').set('Authorization', token).send({
        displayName: token === sponsor ? 'Priya Sharma' : 'Kavya Nair', budget,
        levels: ['UNDERGRADUATE'], categories: ['tuition'], states: [], circumstances: ['FIRST_GENERATION_LEARNER'],
      });
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({ budget, committed: 0, available: budget });
    }
  });

  it('lists students only after they agree to be shown and to share contact details', async () => {
    expect((await request(app).get('/api/sponsor/students').set('Authorization', sponsor)).body.total).toBe(0);

    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    expect(funding.body).toMatchObject({ eligible: true, approvedAmount: 60000, promised: 0, remaining: 60000, visible: false });

    const noConsent = await request(app).put('/api/funding/me/visibility').set('Authorization', student).send({ visible: true });
    expect(noConsent.status).toBe(400);
    expect(noConsent.body.error.details.shareContact).toBeDefined();

    const res = await request(app).put('/api/funding/me/visibility').set('Authorization', student).send({ visible: true, shareContact: true, noteToSponsors: 'Thank you for reading.' });
    expect(res.body.visible).toBe(true);

    const after = await request(app).get('/api/sponsor/students').set('Authorization', sponsor);
    expect(after.body.total).toBe(1);
    const card = after.body.items[0];
    expect(card).toMatchObject({ id: appId, level: 'UNDERGRADUATE', course: 'B.Tech', state: 'Andhra Pradesh', needLevel: 'HIGH', promised: 0, remaining: 60000, noteToSponsors: 'Thank you for reading.' });
    expect(card.alias).toMatch(/^Student [A-Z2-9]{6}$/);
    expect(card.match.score).toBeGreaterThan(50);
    // Before connecting, no private details reach sponsors.
    const text = JSON.stringify(after.body);
    for (const secret of ['Rahul', 'Kumar', 'Guntur', 'Gandhi Nagar', '21TEST0042', 'Test Institute', '140000', 'EB-', 'student@edubridge.test']) {
      expect(text).not.toContain(secret);
    }
  });

  it('never lets a promise exceed the budget or the remaining requirement', async () => {
    expect((await request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor).send({ amount: 55000 })).status).toBe(400);
    expect((await request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor2).send({ amount: 70000 })).status).toBe(400);
    expect((await request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor).send({ amount: 100 })).status).toBe(400);
  });

  it('handles two sponsors connecting at the same moment without over-covering', async () => {
    const [a, b] = await Promise.all([
      request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor).send({ amount: 40000 }),
      request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor2).send({ amount: 40000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await Application.findById(appId).lean())!.funding!.promised).toBe(40000);
    const winner = a.status === 201 ? sponsor : sponsor2;
    const id = (a.status === 201 ? a : b).body.sponsorship.id;
    expect((await request(app).post(`/api/sponsor/sponsorships/${id}/end`).set('Authorization', winner)).status).toBe(200);
    const after = await Application.findById(appId).lean();
    expect(after!.funding!.promised).toBe(0);
    expect(after!.status).toBe('APPROVED');
  });

  let connectionId = '';
  it('connects instantly and shares contact details both ways', async () => {
    const res = await request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor).send({ amount: 40000, messageToStudent: 'Keep going!' });
    expect(res.status).toBe(201);
    expect(res.body.sponsorship).toMatchObject({ status: 'CONNECTED', amount: 40000, student: { contact: { fullName: 'Rahul Kumar', email: 'student@edubridge.test' } } });
    expect(res.body.sponsorship.reference).toMatch(/^SP-\d{4}-\d{6}$/);
    connectionId = res.body.sponsorship.id;

    expect((await request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor).send({ amount: 5000 })).status).toBe(409);
    expect((await Application.findById(appId).lean())!.status).toBe('PARTIALLY_FUNDED');

    const prefs = await request(app).get('/api/sponsor/preferences').set('Authorization', sponsor);
    expect(prefs.body.profile).toMatchObject({ committed: 40000, available: 10000 });
    expect((await request(app).put('/api/sponsor/preferences').set('Authorization', sponsor).send({ ...prefs.body.profile, budget: 30000 })).status).toBe(400);

    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    expect(funding.body).toMatchObject({ promised: 40000, remaining: 20000 });
    expect(funding.body.sponsorships[0]).toMatchObject({
      messageToStudent: 'Keep going!',
      sponsor: { name: 'Priya Sharma', contact: { fullName: 'Priya Sharma', email: 'sponsor@edubridge.test' } },
    });

    // Other sponsors still see only the anonymised card.
    const other = await request(app).get(`/api/sponsor/students/${appId}`).set('Authorization', sponsor2);
    expect(JSON.stringify(other.body)).not.toContain('Rahul');
  });

  it('marks the student fully supported and removes them from the list', async () => {
    const res = await request(app).post(`/api/sponsor/students/${appId}/connect`).set('Authorization', sponsor2).send({ amount: 20000 });
    expect(res.status).toBe(201);
    expect((await Application.findById(appId).lean())!.status).toBe('FULLY_FUNDED');
    expect((await request(app).get('/api/sponsor/students').set('Authorization', sponsor)).body.total).toBe(0);

    const overview = await request(app).get('/api/sponsorships/overview').set('Authorization', admin);
    expect(overview.body.totals).toMatchObject({ promised: 60000, remaining: 0, fullySupported: 1 });
    expect(overview.body.counts).toMatchObject({ CONNECTED: 2, ENDED: 1 });
  });

  it('lets an admin end a connection, which hides contact details again', async () => {
    expect((await request(app).post(`/api/sponsorships/${connectionId}/end`).set('Authorization', sponsor).send({})).status).toBe(403);
    const res = await request(app).post(`/api/sponsorships/${connectionId}/end`).set('Authorization', admin).send({ reason: 'Sponsor asked to stop.' });
    expect(res.status).toBe(200);
    expect(res.body.sponsorship).toMatchObject({ status: 'ENDED', endReason: 'BY_ADMIN', endNote: 'Sponsor asked to stop.' });
    expect((await request(app).post(`/api/sponsorships/${connectionId}/end`).set('Authorization', admin).send({})).status).toBe(409);
    expect((await Application.findById(appId).lean())!.status).toBe('PARTIALLY_FUNDED');

    const mine = await request(app).get('/api/sponsor/sponsorships').set('Authorization', sponsor);
    expect(mine.body.items.find((s: { id: string }) => s.id === connectionId).student.contact).toBeUndefined();
    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    const ended = funding.body.sponsorships.find((s: { id: string }) => s.id === connectionId);
    expect(ended.sponsor.contact).toBeUndefined();
    expect(ended.endNote).toBeUndefined();
    expect((await request(app).get('/api/sponsor/preferences').set('Authorization', sponsor)).body.profile.committed).toBe(0);
  });

  it('emails the student, sponsors and volunteers at each step', async () => {
    await flushMail();
    const subjects = (email: string) => testOutbox.filter((m) => m.to === email).map((m) => m.subject);
    const student = subjects('student@edubridge.test');
    for (const rx of [/^We received your application EB-/, /^Verification has started/, /has been approved$/, /^Priya Sharma wants to support your education$/, /connection with Priya Sharma has ended$/]) {
      expect(student.some((t) => rx.test(t))).toBe(true);
    }
    expect(subjects('sponsor@edubridge.test')).toEqual(expect.arrayContaining(['You are connected with Rahul Kumar']));
    expect(subjects('sponsor@edubridge.test').some((t) => /has ended$/.test(t))).toBe(true);
    expect(subjects('volunteer@edubridge.test')).toContain('New applications are waiting for verification');

    const approved = testOutbox.find((m) => m.to === 'student@edubridge.test' && /approved$/.test(m.subject))!;
    expect(approved.text).toContain('₹60,000');
    // The last "connected" email is the one with the sponsor's message (an earlier test connected without one).
    const connectedMail = testOutbox.filter((m) => m.subject === 'Priya Sharma wants to support your education').at(-1)!;
    expect(connectedMail.text).toContain('sponsor@edubridge.test');
    expect(connectedMail.text).toContain('Keep going!');
  });

  it('asks students who agreed before contact sharing to agree again', async () => {
    await Application.updateOne({ _id: appId }, { $unset: { 'sponsorVisibility.shareContact': 1 } });
    const funding = await request(app).get('/api/funding/me').set('Authorization', student);
    expect(funding.body).toMatchObject({ visible: false, needsNewConsent: true });
    expect((await request(app).get('/api/sponsor/students').set('Authorization', sponsor)).body.total).toBe(0);
    await request(app).put('/api/funding/me/visibility').set('Authorization', student).send({ visible: true, shareContact: true });
  });

  it('records connections in the audit log', async () => {
    const actions = await AuditLog.distinct('action');
    for (const a of ['SPONSOR_PREFERENCES_UPDATED', 'SPONSOR_VISIBILITY_CHANGED', 'SPONSOR_CONNECTED', 'CONNECTION_ENDED']) expect(actions).toContain(a);
  });

  it('converts records from the old payment flow', async () => {
    const db = Application.db.db!;
    const app2 = await Application.findById(appId).lean();
    const base = { application: app2!._id, student: app2!.student, academicYear: app2!.academicYear, sponsorName: 'Old Sponsor', createdAt: new Date(), updatedAt: new Date() };
    const sponsorUser = (await SponsorProfile.findOne().lean())!.user;
    await Sponsorship.collection.insertMany([
      { ...base, reference: 'SP-OLD-1', sponsor: sponsorUser, amount: 1000, status: 'CONFIRMED', active: true, payment: { reference: 'UTR' }, showNameToStudent: false },
      { ...base, reference: 'SP-OLD-2', sponsor: sponsorUser, amount: 2000, status: 'CANCELLED', cancellation: { reason: 'EXPIRED', at: new Date(), wasConfirmed: false } },
    ]);
    await Application.collection.updateOne({ _id: app2!._id }, { $set: { funding: { pledged: 5, confirmed: 7 } } });
    await db.createCollection('bankaccounts');

    await migrateToConnections();

    const old1 = await Sponsorship.collection.findOne({ reference: 'SP-OLD-1' });
    expect(old1).toMatchObject({ status: 'CONNECTED', active: true });
    expect(old1!.payment).toBeUndefined();
    expect((await Sponsorship.collection.findOne({ reference: 'SP-OLD-2' }))!.status).toBe('ENDED');
    // Promised = the remaining sponsor2 connection (20000) + the converted one (1000).
    expect((await Application.collection.findOne({ _id: app2!._id }))!.funding).toEqual({ promised: 21000 });
    expect(await db.listCollections({ name: 'bankaccounts' }).toArray()).toHaveLength(0);

    // Running it again changes nothing.
    await migrateToConnections();
    expect((await Application.collection.findOne({ _id: app2!._id }))!.funding).toEqual({ promised: 21000 });
  });
});
