import nodeDns from 'node:dns';
import dns from 'node:dns/promises';
import mongoose from 'mongoose';
import { env } from './env';

let memoryServer: { stop: () => Promise<boolean> } | null = null;

/**
 * Connects to MongoDB. If MONGODB_URI is empty, an in-memory MongoDB is started so the project
 * runs with zero setup. Returns true when in-memory is used.
 */
export async function connectDB(uri = env.MONGODB_URI): Promise<boolean> {
  let inMemory = false;
  if (!uri) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    memoryServer = replSet;
    uri = replSet.getUri();
    inMemory = true;
  }
  if (uri.startsWith('mongodb+srv://')) await ensureSrvResolvable(uri);
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: env.MONGODB_DB });
  return inMemory;
}

/** Some Windows networks refuse Node's SRV lookups; fall back to public DNS for this process. */
async function ensureSrvResolvable(uri: string) {
  const host = new URL(uri).hostname;
  try {
    await dns.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    nodeDns.setServers(['1.1.1.1', '8.8.8.8']);
    console.warn('⚠️  System DNS could not resolve the Atlas SRV record; using public DNS (1.1.1.1, 8.8.8.8).');
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
