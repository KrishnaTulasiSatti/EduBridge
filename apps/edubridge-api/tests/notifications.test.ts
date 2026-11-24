import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { User } from '../src/modules/auth/user.model';
import { flushMail, testOutbox } from '../src/modules/notifications/mailer';
import { buildEmail } from '../src/modules/notifications/template';
import { DEMO_PASSWORD, seedDemoUsers } from './fixtures';

const app = createApp();
const sentTo = (email: string) => testOutbox.filter((m) => m.to === email);

beforeAll(async () => {
  await connectDB('');
  await seedDemoUsers();
});
afterAll(async () => {
  await disconnectDB();
});
beforeEach(() => {
  testOutbox.length = 0;
});

describe('email notifications', () => {
  it('welcomes a new student with a link to the application', async () => {
    const res = await request(app).post('/api/auth/register').send({ fullName: 'Asha Devi', email: 'asha@example.com', password: 'Strong@123', role: 'STUDENT', acceptTerms: true });
    expect(res.status).toBe(201);
    await flushMail();
    const [mail] = sentTo('asha@example.com');
    expect(mail.subject).toBe('Welcome to EduBridge');
    expect(mail.text).toContain('Hello Asha,');
    expect(mail.text).toContain('http://localhost:5173/dashboard/application');
  });

  it('tells admins about a new volunteer, and the volunteer when approved or suspended', async () => {
    const reg = await request(app).post('/api/auth/register').send({ fullName: 'Vikram Rao', email: 'vikram@example.com', password: 'Strong@123', role: 'VOLUNTEER', acceptTerms: true });
    await flushMail();
    expect(sentTo('vikram@example.com')[0].text).toContain('administrator reviews every volunteer account');
    const adminMail = sentTo('admin@edubridge.test')[0];
    expect(adminMail.subject).toBe('New volunteer waiting for approval: Vikram Rao');

    const login = await request(app).post('/api/auth/login').send({ email: 'admin@edubridge.test', password: DEMO_PASSWORD });
    const admin = `Bearer ${login.body.accessToken}`;
    testOutbox.length = 0;
    await request(app).patch(`/api/users/${reg.body.user.id}/status`).set('Authorization', admin).send({ status: 'ACTIVE' });
    await flushMail();
    expect(sentTo('vikram@example.com')[0].subject).toBe('Your EduBridge volunteer account is approved');

    await request(app).patch(`/api/users/${reg.body.user.id}/status`).set('Authorization', admin).send({ status: 'SUSPENDED', reason: 'Requested by the volunteer' });
    await flushMail();
    const suspended = sentTo('vikram@example.com')[1];
    expect(suspended.subject).toBe('Your EduBridge account has been suspended');
    expect(suspended.text).toContain('Reason: Requested by the volunteer');
  });

  it('never lets an email problem break the request', async () => {
    // A user whose email is missing from the database still gets a normal response.
    const res = await request(app).post('/api/auth/register').send({ fullName: 'Lata Nair', email: 'lata@example.com', password: 'Strong@123', role: 'STUDENT', acceptTerms: true });
    expect(res.status).toBe(201);
    await User.deleteOne({ email: 'lata@example.com' });
    await flushMail();
  });

  it('escapes text written by people in the HTML version', () => {
    const mail = buildEmail({
      to: 'x@example.com',
      subject: 'Test',
      name: '<b>Eve</b>',
      paragraphs: ['Hello'],
      quote: { from: 'Sponsor', text: '<script>alert(1)</script>' },
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<b>Eve');
  });
});
