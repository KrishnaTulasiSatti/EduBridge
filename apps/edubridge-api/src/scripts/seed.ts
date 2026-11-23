import { env } from '../config/env';
import { connectDB, disconnectDB } from '../config/db';
import { DEMO_PASSWORD, DEMO_USERS, seedDemoUsers } from './seedData';

if (!env.MONGODB_URI) {
  console.log('MONGODB_URI is empty — the dev server already auto-seeds the in-memory database. Nothing to do.');
  process.exit(0);
}

await connectDB();
const created = await seedDemoUsers();
console.log(`✅ Seed complete (${created} new users). Password for all demo users: ${DEMO_PASSWORD}`);
DEMO_USERS.forEach((u) => console.log(`   ${u.role.padEnd(10)} ${u.email}`));
await disconnectDB();
