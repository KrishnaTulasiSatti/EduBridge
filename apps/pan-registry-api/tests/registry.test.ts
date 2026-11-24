import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { env } from '../src/config/env';
import { PanRecord } from '../src/modules/records/record.model';
import { testOutbox } from '../src/modules/verification/mailer';
import { Verification } from '../src/modules/verification/verification.model';

const app = createApp();
const partnerAuth = `Basic ${Buffer.from(`${env.EDUBRIDGE_CLIENT_ID}:${env.EDUBRIDGE_CLIENT_SECRET}`).toString('base64')}`;
const admin = { 'X-Admin-Key': env.ADMIN_KEY };

// Fictional holder used only by these tests.
const holder = { pan: 'abcpk1234l', fullName: 'Kiran Kumar Reddy', dateOfBirth: '1985-04-12', email: 'kiran.test@example.com' };
const verifyBody = { pan: 'ABCPK1234L', name: 'kiran  kumar reddy', dateOfBirth: '1985-04-12' };

const lastOtp = () => /\b(\d{6})\b/.exec(testOutbox.at(-1)!.text)![1];

beforeAll(async () => {
  await connectDB('');
});
afterAll(async () => {
  await disconnectDB();
});

describe('records admin', () => {
  it('requires the admin key', async () => {
    const res = await request(app).get('/api/admin/records');
    expect(res.status).toBe(401);
    const wrong = await request(app).get('/api/admin/records').set('X-Admin-Key', 'not-the-key');
    expect(wrong.status).toBe(401);
  });

  it('adds a record, normalising the PAN, and rejects duplicates and bad PANs', async () => {
    const res = await request(app).post('/api/admin/records').set(admin).send(holder);
    expect(res.status).toBe(201);
    expect(res.body.pan).toBe('ABCPK1234L');
    expect(res.body.holderType).toBe('Individual');

    const dup = await request(app).post('/api/admin/records').set(admin).send(holder);
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/admin/records').set(admin).send({ ...holder, pan: 'ABCXK1234L' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.pan).toBeDefined();

    const list = await request(app).get('/api/admin/records?q=kiran').set(admin);
    expect(list.body.items).toHaveLength(1);
  });
});

describe('partner verification', () => {
  beforeEach(async () => {
    await Verification.deleteMany({});
    await PanRecord.updateOne({ pan: 'ABCPK1234L' }, { status: 'ACTIVE' });
  });

  it('rejects calls without partner credentials', async () => {
    const res = await request(app).post('/api/partner/pan/verify').send(verifyBody);
    expect(res.status).toBe(401);
  });

  it('reports unknown PANs, wrong names and wrong dates of birth without sending a code', async () => {
    const sent = testOutbox.length;
    const unknown = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send({ ...verifyBody, pan: 'ZZZPZ9999Z' });
    expect(unknown.body.result).toBe('NOT_FOUND');
    const name = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send({ ...verifyBody, name: 'Someone Else' });
    expect(name.body.result).toBe('NAME_MISMATCH');
    const dob = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send({ ...verifyBody, dateOfBirth: '1990-01-01' });
    expect(dob.body.result).toBe('DOB_MISMATCH');
    const format = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send({ ...verifyBody, pan: '12345' });
    expect(format.body.result).toBe('INVALID_FORMAT');
    expect(testOutbox.length).toBe(sent);
  });

  it('reports a deactivated PAN', async () => {
    await PanRecord.updateOne({ pan: 'ABCPK1234L' }, { status: 'INACTIVE' });
    const res = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
    expect(res.body.result).toBe('INACTIVE');
  });

  it('emails an OTP to the registered address and verifies it once', async () => {
    const start = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
    expect(start.body.result).toBe('OTP_SENT');
    expect(start.body.otpSentTo).toBe('k*********@example.com');
    expect(testOutbox.at(-1)!.to).toBe(holder.email);
    const otp = lastOtp();

    const stored = await Verification.findOne({ reference: start.body.reference }).select('+otpHash');
    expect(stored!.otpHash).not.toContain(otp);

    const wrong = await request(app)
      .post('/api/partner/pan/confirm')
      .set('Authorization', partnerAuth)
      .send({ reference: start.body.reference, otp: otp === '000000' ? '111111' : '000000' });
    expect(wrong.body).toMatchObject({ result: 'INVALID_OTP', attemptsLeft: 4 });

    const ok = await request(app).post('/api/partner/pan/confirm').set('Authorization', partnerAuth).send({ reference: start.body.reference, otp });
    expect(ok.body).toMatchObject({ result: 'VERIFIED', pan: 'ABCPK1234L', fullName: 'Kiran Kumar Reddy', holderType: 'Individual' });

    const again = await request(app).post('/api/partner/pan/confirm').set('Authorization', partnerAuth).send({ reference: start.body.reference, otp });
    expect(again.body.result).toBe('ALREADY_USED');
  });

  it('locks a reference after 5 wrong codes', async () => {
    const start = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
    const otp = lastOtp();
    const wrongOtp = otp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/partner/pan/confirm').set('Authorization', partnerAuth).send({ reference: start.body.reference, otp: wrongOtp });
    }
    const fifth = await request(app).post('/api/partner/pan/confirm').set('Authorization', partnerAuth).send({ reference: start.body.reference, otp: wrongOtp });
    expect(fifth.body.result).toBe('TOO_MANY_ATTEMPTS');
    const right = await request(app).post('/api/partner/pan/confirm').set('Authorization', partnerAuth).send({ reference: start.body.reference, otp });
    expect(right.body.result).toBe('TOO_MANY_ATTEMPTS');
  });

  it('rejects an expired code', async () => {
    const start = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
    await Verification.updateOne({ reference: start.body.reference }, { expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).post('/api/partner/pan/confirm').set('Authorization', partnerAuth).send({ reference: start.body.reference, otp: lastOtp() });
    expect(res.body.result).toBe('EXPIRED');
  });

  it('limits how many codes one PAN can receive', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
      expect(ok.body.result).toBe('OTP_SENT');
    }
    const blocked = await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
    expect(blocked.status).toBe(429);
  });

  it('shows recent verifications to the admin with a masked PAN', async () => {
    await request(app).post('/api/partner/pan/verify').set('Authorization', partnerAuth).send(verifyBody);
    const res = await request(app).get('/api/admin/verifications').set(admin);
    expect(res.body.items[0].pan).toBe('XXXXXX234L');
  });

  it('serves the records page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('PAN Registry');
  });
});
