import { env } from '../config/env';
import { connectDB, disconnectDB } from '../config/db';
import { DEMO_PASSWORD, seedDemoData } from './seedData';

if (!env.MONGODB_URI) {
  console.log('MONGODB_URI is empty — the EduVault dev server already seeds its in-memory database. Nothing to do.');
  process.exit(0);
}

await connectDB();
const created = await seedDemoData();
console.log(`✅ EduVault seed complete (${created} new records) in database "${env.MONGODB_DB}". Password for demo accounts: ${DEMO_PASSWORD}`);
console.log('   ADMIN      admin@eduvault.test');
console.log('   ISSUER     registrar@kvce.test        (Krishna Valley College of Engineering — trusted)');
console.log('   ISSUER     registrar@riverside.test   (Riverside Institute of Science — awaiting approval)');
console.log('   STUDENT    student@edubridge.test     (roll number 21KV1A0542)');
await disconnectDB();
