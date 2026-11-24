import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ruleBasedScore, type AssessmentInput } from '@edubridge/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { AuditLog } from '../src/modules/audit/audit.model';
import { StudentDocument } from '../src/modules/applications/models';
import { MlError, mlClient } from '../src/modules/assessment/mlClient';
import { vaultClient } from '../src/modules/eduvault/vaultClient';
import { DEMO_PASSWORD, seedDemoUsers } from './fixtures';

const app = createApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  return `Bearer ${res.body.accessToken}`;
}

// External services are mocked: EduVault (registry + enrolment) and the Python ML service.
const TIT = { institutionId: 'x', name: 'Test Institute of Technology', university: 'Test University', code: 'TIT', status: 'ACTIVE' as const };
vi.spyOn(vaultClient, 'listIssuers').mockResolvedValue({ items: [{ ...TIT, keys: [] }] });
vi.spyOn(vaultClient, 'checkEnrolment').mockResolvedValue({
  institution: TIT,
  enrolled: true,
  student: { fullName: 'Rahul Kumar', rollNumber: '21TEST0042', programme: 'B.Tech CSE', admissionYear: 2023 },
  checkedAt: new Date().toISOString(),
});
const MODEL = { modelId: 'm1', algorithm: 'Random Forest', trainedAt: new Date().toISOString(), source: 'SYNTHETIC_DEMO' as const, samples: 600, macroF1: 0.78 };
const predictSpy = vi.spyOn(mlClient, 'predict').mockResolvedValue({ prediction: 'HIGH', probabilities: { HIGH: 0.7, MEDIUM: 0.25, LOW: 0.05 }, model: MODEL });

let student: string;
let volunteer: string;
let admin: string;
let appId = '';

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
  [student, volunteer, admin] = await Promise.all([login('student@edubridge.test'), login('volunteer@edubridge.test'), login('admin@edubridge.test')]);

  // A submitted application that a volunteer has fully verified.
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
  const docs = Object.fromEntries(submitted.body.application.documents.map((d: { type: string; id: string }) => [d.type, d.id]));

  await request(app).post(`/api/verification/applications/${appId}/claim`).set('Authorization', volunteer);
  await request(app).post(`/api/verification/applications/${appId}/documents/${docs.INCOME_CERTIFICATE}/review`).set('Authorization', volunteer).send({
    type: 'INCOME_CERTIFICATE', outcome: 'VERIFIED', note: 'Found on AP Seva.', portalCertificateNumber: 'IC2026-0012345', holderName: 'Rahul Kumar',
    // The portal shows a slightly different (verified) income: the assessment must use it.
    annualIncome: 120000, issueDate: `${new Date().getFullYear() - 1}-06-01`,
  });
  await request(app).post(`/api/verification/applications/${appId}/documents/${docs.MARKSHEET}/review`).set('Authorization', volunteer).send({
    type: 'MARKSHEET', outcome: 'VERIFIED', note: 'Looks genuine.', nameOnDocument: 'Rahul Kumar', percentage: 81.5,
  });
  const reviewed = await request(app).post(`/api/verification/applications/${appId}/review`).set('Authorization', volunteer).send({ recommendation: 'RECOMMEND', summary: 'All documents check out.' });
  expect(reviewed.status).toBe(200);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectDB();
});

describe('rule-based need score', () => {
  const base: AssessmentInput = {
    family: { familyMembers: 4, earningMembers: 1, dependentsStudying: 1, annualFamilyIncome: 100000, circumstances: [] },
    support: { expenses: { tuition: 50000 }, existingAid: 0, requestedAmount: 50000 },
  };

  it('adds up explainable factors to a 0–100 score', () => {
    const r = ruleBasedScore(base);
    expect(r.factors.map((f) => f.key)).toEqual(['income', 'cost_burden', 'dependency', 'circumstances', 'existing_support']);
    expect(r.factors.reduce((s, f) => s + f.max, 0)).toBe(100);
    expect(r.score).toBe(Math.round(r.factors.reduce((s, f) => s + f.points, 0)));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('gives more points for lower income, special circumstances and less existing aid', () => {
    const s = (over: Partial<AssessmentInput>) => ruleBasedScore({ ...base, ...over }).score;
    expect(s({ family: { ...base.family, annualFamilyIncome: 60000 } })).toBeGreaterThan(s({}));
    expect(s({ family: { ...base.family, circumstances: ['ORPHAN'] } })).toBeGreaterThan(s({}));
    expect(s({ support: { ...base.support, existingAid: 40000 } })).toBeLessThan(s({}));
    expect(ruleBasedScore({ ...base, family: { ...base.family, annualFamilyIncome: 2000000 } }).level).toBe('LOW');
  });

  it('uses the verified income when one was recorded', () => {
    const r = ruleBasedScore({ ...base, verifiedAnnualIncome: 300000 });
    expect(r.incomeUsed).toEqual({ amount: 300000, source: 'VERIFIED' });
  });
});

describe('admin review and decision', () => {
  it('assesses the application as soon as the volunteer review is submitted', async () => {
    const res = await request(app).get(`/api/review/applications/${appId}`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('ASSESSED');
    expect(res.body.canDecide).toBe(true);
    const a = res.body.assessment;
    expect(a.ruleBased.incomeUsed).toEqual({ amount: 120000, source: 'VERIFIED' });
    expect(a.features.annual_family_income).toBe(120000);
    expect(a.ml).toMatchObject({ status: 'OK', prediction: 'HIGH', model: { source: 'SYNTHETIC_DEMO' } });
    expect(a.ml.agreesWithRules).toBe(a.ruleBased.level === 'HIGH');
    expect(res.body.volunteerReview.recommendation).toBe('RECOMMEND');
  });

  it('lists it for admins only, highest need first', async () => {
    const q = await request(app).get('/api/review/queue?tab=awaiting').set('Authorization', admin);
    expect(q.body.items[0]).toMatchObject({ id: appId, documentsVerified: 3, documentsTotal: 3, recommendation: 'RECOMMEND', mlPrediction: 'HIGH' });
    expect(q.body.counts.awaiting).toBe(1);
    expect((await request(app).get('/api/review/queue').set('Authorization', volunteer)).status).toBe(403);
    expect((await request(app).get(`/api/review/applications/${appId}`).set('Authorization', student)).status).toBe(403);
  });

  it('never strands an application that was reviewed but not yet assessed', async () => {
    const { Application } = await import('../src/modules/applications/models');
    await Application.updateOne({ _id: appId }, { $set: { status: 'VOLUNTEER_REVIEWED' }, $unset: { assessment: 1 } });
    const q = await request(app).get('/api/review/queue?tab=awaiting').set('Authorization', admin);
    expect(q.body.items.map((i: { id: string }) => i.id)).toContain(appId);
    const res = await request(app).post(`/api/review/applications/${appId}/assess`).set('Authorization', admin);
    expect(res.body.application.status).toBe('ASSESSED');
    expect(res.body.assessment.ruleBased.score).toBeGreaterThan(0);
  });

  it('keeps working when the ML service is down', async () => {
    predictSpy.mockRejectedValueOnce(new MlError(503, 'down'));
    const res = await request(app).post(`/api/review/applications/${appId}/assess`).set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.assessment.ml.status).toBe('UNAVAILABLE');
    expect(res.body.assessment.ruleBased.score).toBeGreaterThan(0);
  });

  it('validates the decision', async () => {
    const noAmount = await request(app).post(`/api/review/applications/${appId}/decision`).set('Authorization', admin).send({ decision: 'APPROVED', needLevel: 'HIGH', reason: 'Clear need.' });
    expect(noAmount.status).toBe(400);
    expect(noAmount.body.error.details.approvedAmount).toBeDefined();
    const tooMuch = await request(app).post(`/api/review/applications/${appId}/decision`).set('Authorization', admin).send({ decision: 'APPROVED', needLevel: 'HIGH', approvedAmount: 90000, reason: 'Clear need.' });
    expect(tooMuch.status).toBe(400);
  });

  it('puts on hold, then approves; the student sees only the outcome and message', async () => {
    const hold = await request(app).post(`/api/review/applications/${appId}/decision`).set('Authorization', admin).send({
      decision: 'ON_HOLD', needLevel: 'HIGH', reason: 'Waiting for fee receipt.', messageToStudent: 'Please send your fee receipt.',
    });
    expect(hold.status).toBe(200);
    expect(hold.body.application.status).toBe('ON_HOLD');
    // Aadhaar is kept while on hold.
    let income = await StudentDocument.findOne({ type: 'INCOME_CERTIFICATE' }).select('+aadhaarEncrypted');
    expect(income!.aadhaarEncrypted).toBeTruthy();

    const approve = await request(app).post(`/api/review/applications/${appId}/decision`).set('Authorization', admin).send({
      decision: 'APPROVED', needLevel: 'HIGH', approvedAmount: 75000, reason: 'Verified low income; strong volunteer recommendation.', messageToStudent: 'Congratulations!',
    });
    expect(approve.status).toBe(200);
    expect(approve.body.decision).toMatchObject({ decision: 'APPROVED', needLevel: 'HIGH', approvedAmount: 75000, by: { name: 'Ananya Rao' } });
    expect(approve.body.canDecide).toBe(false);

    // The Aadhaar number is deleted once the decision is final; the last 4 digits remain for reference.
    income = await StudentDocument.findOne({ type: 'INCOME_CERTIFICATE' }).select('+aadhaarEncrypted');
    expect(income!.aadhaarEncrypted).toBeUndefined();
    expect(income!.aadhaarLast4).toBe('0124');

    const mine = await request(app).get('/api/applications/current').set('Authorization', student);
    expect(mine.body.application.status).toBe('APPROVED');
    expect(mine.body.application.outcome).toMatchObject({ decision: 'APPROVED', approvedAmount: 75000, message: 'Congratulations!' });
    expect(JSON.stringify(mine.body)).not.toContain('Verified low income'); // internal reason stays internal
    expect(mine.body.application.assessment).toBeUndefined();

    const again = await request(app).post(`/api/review/applications/${appId}/decision`).set('Authorization', admin).send({ decision: 'REJECTED', needLevel: 'LOW', reason: 'Changed mind.' });
    expect(again.status).toBe(409);
    expect(await AuditLog.countDocuments({ action: 'APPLICATION_DECIDED', resourceId: appId })).toBe(2);
  });
});

describe('need model', () => {
  it('reports reviewed decisions and refuses to train on too few', async () => {
    const reportSpy = vi.spyOn(mlClient, 'report').mockRejectedValueOnce(new MlError(404, 'No model'));
    const status = await request(app).get('/api/review/model').set('Authorization', admin);
    expect(status.body).toMatchObject({ service: 'UP', reviewedDecisions: { total: 1, byLevel: { HIGH: 1 } }, canTrainOnDecisions: false });
    reportSpy.mockRestore();

    const train = await request(app).post('/api/review/model/train').set('Authorization', admin).send({ source: 'REVIEWED_DECISIONS' });
    expect(train.status).toBe(400);
    expect(train.body.error.message).toMatch(/At least 30/);
  });

  it('reports a clear error when the ML service is not running', async () => {
    vi.spyOn(mlClient, 'trainSynthetic').mockRejectedValueOnce(new MlError(503, 'The ML service is not running.'));
    const res = await request(app).post('/api/review/model/train').set('Authorization', admin).send({ source: 'SYNTHETIC_DEMO' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ML_UNAVAILABLE');
  });
});
