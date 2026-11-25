import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { env } from '../src/config/env';
import { AuditLog } from '../src/modules/audit/audit.model';
import { panClient } from '../src/modules/auth/panClient';
import { User } from '../src/modules/auth/user.model';

const app = createApp();

// Fictional sponsor used only by these tests; the PAN registry itself is mocked.
const PAN = 'BCDPS5678M';
const sponsor = {
  fullName: 'Sunita Sharma',
  email: 'sunita@sponsor.test',
  password: 'Strong@123',
  role: 'SPONSOR',
  acceptTerms: true, phone: '9876543210',
};
const verifySpy = vi.spyOn(panClient, 'verify');
const confirmSpy = vi.spyOn(panClient, 'confirm');

function registryAccepts(pan = PAN, fullName = 'SUNITA SHARMA') {
  verifySpy.mockResolvedValue({ result: 'OTP_SENT', reference: `REF-${pan}`, otpSentTo: 's*****@example.com', expiresAt: new Date(Date.now() + 600_000).toISOString() });
  confirmSpy.mockResolvedValue({ result: 'VERIFIED', reference: `REF-${pan}`, pan, fullName, holderType: 'Individual', verifiedAt: new Date().toISOString() });
}

async function verifiedPanToken(pan = PAN, fullName = 'SUNITA SHARMA') {
  registryAccepts(pan, fullName);
  const start = await request(app).post('/api/auth/sponsor-pan/start').send({ pan: pan.toLowerCase(), fullName: sponsor.fullName, dateOfBirth: '1980-06-01' });
  expect(start.status).toBe(200);
  const confirm = await request(app).post('/api/auth/sponsor-pan/confirm').send({ reference: start.body.reference, otp: '123456' });
  expect(confirm.status).toBe(200);
  return confirm.body.panToken as string;
}

beforeAll(async () => {
  env.PAN_REGISTRY_CLIENT_SECRET = 'configured-for-tests';
  await connectDB('');
});
afterAll(async () => {
  await disconnectDB();
});
beforeEach(() => {
  verifySpy.mockReset();
  confirmSpy.mockReset();
});

describe('sponsor PAN verification', () => {
  it('does not create a sponsor account without a verified PAN', async () => {
    const res = await request(app).post('/api/auth/register').send(sponsor);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAN_VERIFICATION_REQUIRED');

    const forged = await request(app).post('/api/auth/register').send({ ...sponsor, panToken: 'not-a-real-token' });
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('PAN_VERIFICATION_EXPIRED');
  });

  it('rejects badly formatted PANs before calling the registry', async () => {
    const res = await request(app).post('/api/auth/sponsor-pan/start').send({ pan: '12345', fullName: sponsor.fullName, dateOfBirth: '1980-06-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.pan).toBeDefined();
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('explains a name mismatch on the name field', async () => {
    verifySpy.mockResolvedValue({ result: 'NAME_MISMATCH' });
    const res = await request(app).post('/api/auth/sponsor-pan/start').send({ pan: PAN, fullName: 'Someone Else', dateOfBirth: '1980-06-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fullName).toBeDefined();
    const logged = await AuditLog.findOne({ action: 'SPONSOR_PAN_CHECK_FAILED' });
    expect(logged?.metadata).toMatchObject({ maskedPan: 'XXXXXX678M', result: 'NAME_MISMATCH' });
  });

  it('reports a wrong OTP with the tries left', async () => {
    confirmSpy.mockResolvedValue({ result: 'INVALID_OTP', attemptsLeft: 3 });
    const res = await request(app).post('/api/auth/sponsor-pan/confirm').send({ reference: 'REF-SOMETHING', otp: '000000' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('3 tries left');
  });

  it('creates a sponsor with a verified PAN, stored encrypted and masked', async () => {
    const panToken = await verifiedPanToken();
    expect(verifySpy).toHaveBeenCalledWith({ pan: PAN, name: sponsor.fullName, dateOfBirth: '1980-06-01' });

    const res = await request(app).post('/api/auth/register').send({ ...sponsor, panToken });
    expect(res.status).toBe(201);
    expect(res.body.user.panVerification.maskedPan).toBe('XXXXXX678M');

    const stored = await User.findOne({ email: sponsor.email }).select('+panVerification.panEncrypted +panVerification.panHash');
    expect(stored!.panVerification!.panEncrypted).not.toContain(PAN);
    expect(stored!.panVerification!.panHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(res.body)).not.toContain(PAN);
  });

  it('allows only one sponsor account per PAN', async () => {
    const start = await request(app).post('/api/auth/sponsor-pan/start').send({ pan: PAN, fullName: sponsor.fullName, dateOfBirth: '1980-06-01' });
    expect(start.status).toBe(409);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('requires the account name to match the PAN name', async () => {
    const panToken = await verifiedPanToken('CDEPR2468N', 'RAVI TEJA');
    const res = await request(app).post('/api/auth/register').send({ ...sponsor, email: 'other@sponsor.test', fullName: 'Not Ravi', panToken });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fullName).toBeDefined();
    const ok = await request(app).post('/api/auth/register').send({ ...sponsor, email: 'ravi@sponsor.test', fullName: 'Ravi  Teja', panToken });
    expect(ok.status).toBe(201);
  });

  it('does not ask students for a PAN', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...sponsor, email: 'student.pan@example.com', role: 'STUDENT' });
    expect(res.status).toBe(201);
    expect(res.body.user.panVerification).toBeUndefined();
  });

  it('says so when the registry is down', async () => {
    verifySpy.mockRestore();
    env.PAN_REGISTRY_URL = 'http://127.0.0.1:9';
    const res = await request(app).post('/api/auth/sponsor-pan/start').send({ pan: 'DEFPA1357P', fullName: 'Anil Kumar', dateOfBirth: '1975-02-02' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAN_REGISTRY_UNAVAILABLE');
  });
});
