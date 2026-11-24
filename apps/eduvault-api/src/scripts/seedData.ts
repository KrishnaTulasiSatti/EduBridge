import { hashPassword } from '../modules/auth/auth.service';
import { User } from '../modules/auth/user.model';

/**
 * The only account EduVault creates by itself: the EduVault administrator, who approves institutions.
 * Institutions register on the EduVault website; students activate their accounts with the code their institution gives them.
 * Set ADMIN_EMAIL / ADMIN_PASSWORD in .env to choose them; the defaults are for local development only.
 */
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || 'admin@eduvault.test';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Demo@1234';

/** Creates the administrator if it does not exist yet. An existing account (and its password) is never changed. */
export async function seedAdmin() {
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_PASSWORD in the environment before creating the administrator in production');
  }
  const res = await User.updateOne(
    { email: ADMIN_EMAIL },
    {
      $setOnInsert: {
        email: ADMIN_EMAIL,
        fullName: 'EduVault Administrator',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        termsAcceptedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return res.upsertedCount;
}
