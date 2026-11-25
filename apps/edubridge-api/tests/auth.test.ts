
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { AuditLog } from '../src/modules/audit/audit.model';
import { DEMO_PASSWORD, seedDemoUsers } from './fixtures';

const app = createApp();

const getCookie = (res: request.Response) => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('eb_refresh='))?.split(';')[0];
};

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
});
afterAll(async () => {
  await disconnectDB();
});

describe('auth', () => {
  const student = {
    fullName: 'Test Student',
    email: 'Test.Student@Example.com',
    password: 'Strong@123',
    role: 'STUDENT',
    phone: '9876543210',
    acceptTerms: true,
  };

  it('registers a student and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(student);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test.student@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(getCookie(res)).toBeDefined();
  });

  it('sets the refresh cookie as a browser-session cookie, so closing the browser signs out', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password });
    expect(res.status).toBe(200);
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('eb_refresh='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).not.toMatch(/Max-Age|Expires/i);
  });

  it('rejects duplicate email and weak passwords', async () => {
    const dup = await request(app).post('/api/auth/register').send(student);
    expect(dup.status).toBe(409);
    const weak = await request(app)
      .post('/api/auth/register')
      .send({ ...student, email: 'weak@example.com', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.password).toBeDefined();
  });

  it('requires a valid mobile number', async () => {
    const { phone: _phone, ...noPhone } = student;
    const missing = await request(app).post('/api/auth/register').send({ ...noPhone, email: 'nophone@example.com' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.phone).toBeDefined();
    const bad = await request(app).post('/api/auth/register').send({ ...student, email: 'badphone@example.com', phone: '12345' });
    expect(bad.status).toBe(400);
  });

  it('does not allow self-registering as admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...student, email: 'sneaky@example.com', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  it('puts new volunteers into pending approval without tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...student, email: 'vol@example.com', role: 'VOLUNTEER' });
    expect(res.status).toBe(201);
    expect(res.body.pendingApproval).toBe(true);
    expect(res.body.accessToken).toBeNull();
    const login = await request(app).post('/api/auth/login').send({ email: 'vol@example.com', password: student.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_PENDING');
  });

  it('logs in, rejects wrong password with a generic message', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email: student.email, password: 'Wrong@123' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Incorrect email or password');
    const ok = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password });
    expect(ok.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ok.body.accessToken}`);
    expect(me.body.user.role).toBe('STUDENT');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password });
    const first = getCookie(login)!;

    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(r1.status).toBe(200);
    const second = getCookie(r1)!;
    expect(second).not.toBe(first);

    // Replaying the old token is treated as theft...
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    // ...and the new token from the same family is now revoked too.
    const r2 = await request(app).post('/api/auth/refresh').set('Cookie', second);
    expect(r2.status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'REFRESH_TOKEN_REUSE' })).toBe(1);
  });

  it('logout revokes the session', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: student.email, password: student.password });
    const cookie = getCookie(login)!;
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('locks the account after 5 failed attempts', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ ...student, email: 'lock@example.com' });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: 'lock@example.com', password: 'Wrong@123' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: 'lock@example.com', password: student.password });
    expect(res.status).toBe(423);
  });
});

describe('RBAC', () => {
  const login = async (email: string) =>
    (await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD })).body.accessToken as string;

  it('blocks non-admins from user management', async () => {
    const token = await login('student@edubridge.test');
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/users')).status).toBe(401);
  });

  it('lets an admin approve a pending volunteer and records an audit entry', async () => {
    const token = await login('admin@edubridge.test');
    const list = await request(app)
      .get('/api/users?role=VOLUNTEER&status=PENDING_APPROVAL')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const pending = list.body.items.find((u: { email: string }) => u.email === 'pending.volunteer@edubridge.test');
    expect(pending).toBeDefined();

    const res = await request(app)
      .patch(`/api/users/${pending.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('ACTIVE');
    expect(await AuditLog.countDocuments({ action: 'USER_STATUS_CHANGED', resourceId: pending.id })).toBe(1);

    const volunteerToken = await login('pending.volunteer@edubridge.test');
    expect(volunteerToken).toBeTypeOf('string');
  });
});
