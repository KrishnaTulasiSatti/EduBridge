import type { Role } from '@edubridge/shared';
import { hashPassword } from '../src/modules/auth/auth.service';
import { User } from '../src/modules/auth/user.model';

/** Test-only accounts for the automated tests (fictional). The app itself only creates the administrator: see src/scripts/seedData.ts. */
export const DEMO_PASSWORD = 'Demo@1234';

export const DEMO_USERS: { fullName: string; email: string; role: Role; status?: 'ACTIVE' | 'PENDING_APPROVAL' }[] = [
  { fullName: 'Ananya Rao', email: 'admin@edubridge.test', role: 'ADMIN' },
  { fullName: 'Rahul Kumar', email: 'student@edubridge.test', role: 'STUDENT' },
  { fullName: 'Meera Iyer', email: 'volunteer@edubridge.test', role: 'VOLUNTEER' },
  { fullName: 'Priya Sharma', email: 'sponsor@edubridge.test', role: 'SPONSOR' },
  { fullName: 'Arjun Verma', email: 'pending.volunteer@edubridge.test', role: 'VOLUNTEER', status: 'PENDING_APPROVAL' },
];

export async function seedDemoUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let created = 0;
  for (const u of DEMO_USERS) {
    const res = await User.updateOne(
      { email: u.email },
      {
        $set: { fullName: u.fullName, role: u.role },
        $setOnInsert: { email: u.email, status: u.status ?? 'ACTIVE', passwordHash, consentAcceptedAt: new Date() },
      },
      { upsert: true },
    );
    created += res.upsertedCount;
  }
  return created;
}
