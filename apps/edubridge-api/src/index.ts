import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { scheduleRetention } from './modules/retention/retention.service';
import { flushMail } from './modules/notifications/mailer';
import { migrateToConnections } from './modules/sponsorship/migrate';
import { ADMIN_EMAIL, seedAdmin } from './scripts/seedData';

async function main() {
  const inMemory = await connectDB();
  if (inMemory) {
    await seedAdmin();
    console.log('🧪 Using in-memory MongoDB (data resets on restart). Set MONGODB_URI in .env to use Atlas.');
    console.log(`   Administrator: ${ADMIN_EMAIL}. Everyone else registers on the website.`);
  }

  await migrateToConnections();
  scheduleRetention();

  const server = createApp().listen(env.PORT, () => {
    console.log(`🚀 EduBridge API running on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await flushMail();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
