import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { DEMO_PASSWORD, seedDemoData } from './scripts/seedData';

async function main() {
  const inMemory = await connectDB();
  if (inMemory) {
    await seedDemoData();
    console.log('🧪 EduVault is using in-memory MongoDB (data resets on restart). Set MONGODB_URI in .env to keep data.');
    console.log(`   Demo logins: admin@eduvault.test, registrar@kvce.test, student@edubridge.test  /  ${DEMO_PASSWORD}`);
  }

  const server = createApp().listen(env.PORT, () => {
    console.log(`🔐 EduVault API running on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Failed to start EduVault API', err);
  process.exit(1);
});
