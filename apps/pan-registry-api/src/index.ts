import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';

async function main() {
  const inMemory = await connectDB();
  if (inMemory) {
    console.log('🧪 PAN Registry is using in-memory MongoDB (records reset on restart). Set MONGODB_URI in .env to keep them.');
  }
  if (!env.SMTP_HOST) {
    console.log('📧 Email is not configured: one-time passwords will be printed here instead of emailed.');
  }

  const server = createApp().listen(env.PORT, () => {
    console.log(`🪪 PAN Registry (simulation) running on http://localhost:${env.PORT}  ·  records page: http://localhost:${env.PORT}/`);
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
  console.error('❌ Failed to start PAN Registry', err);
  process.exit(1);
});
