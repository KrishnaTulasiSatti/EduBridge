import { env } from '../config/env';
import { connectDB, disconnectDB } from '../config/db';
import { ADMIN_EMAIL, seedAdmin } from './seedData';

if (!env.MONGODB_URI) {
  console.log('MONGODB_URI is empty — the dev server already creates the administrator in its in-memory database. Nothing to do.');
  process.exit(0);
}

await connectDB();
const created = await seedAdmin();
console.log(created ? `✅ Administrator created: ${ADMIN_EMAIL}` : `✅ Administrator already exists: ${ADMIN_EMAIL} (unchanged)`);
await disconnectDB();
