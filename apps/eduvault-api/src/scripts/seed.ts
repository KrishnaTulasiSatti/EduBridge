import { env } from '../config/env';
import { connectDB, disconnectDB } from '../config/db';
import { ADMIN_EMAIL, seedAdmin } from './seedData';

if (!env.MONGODB_URI) {
  console.log('MONGODB_URI is empty — the EduVault dev server already creates the administrator in its in-memory database. Nothing to do.');
  process.exit(0);
}

await connectDB();
const created = await seedAdmin();
console.log(
  created
    ? `✅ EduVault administrator created in database "${env.MONGODB_DB}": ${ADMIN_EMAIL}`
    : `✅ EduVault administrator already exists in database "${env.MONGODB_DB}": ${ADMIN_EMAIL} (unchanged)`,
);
await disconnectDB();
