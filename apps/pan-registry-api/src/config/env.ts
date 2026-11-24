import 'dotenv/config';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5200),
  MONGODB_URI: z.string().optional().default(''),
  /** Database name inside the cluster, so registry data never mixes with EduBridge or EduVault data. */
  MONGODB_DB: z.string().default('panregistry'),

  /** Key for the records admin page (adding and deactivating PAN records). */
  ADMIN_KEY: z.string().min(16, 'ADMIN_KEY must be at least 16 characters'),

  /** EduBridge, registered as the partner allowed to verify PANs. */
  EDUBRIDGE_CLIENT_ID: z.string().min(3).default('edubridge'),
  EDUBRIDGE_CLIENT_SECRET: z.string().min(32, 'EDUBRIDGE_CLIENT_SECRET must be at least 32 characters'),

  /** Email (SMTP) settings for sending one-time passwords. Leave SMTP_HOST empty in development to print OTPs in the console. */
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
});

const testDefaults = isTest
  ? { ADMIN_KEY: 'test-admin-key-test-admin-key', EDUBRIDGE_CLIENT_SECRET: 'test-pan-partner-secret-test-pan-partner' }
  : {};

const parsed = envSchema.safeParse({ ...testDefaults, ...process.env });

if (!parsed.success) {
  console.error('❌ Invalid PAN Registry environment configuration:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production') {
  if (!parsed.data.MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in production');
    process.exit(1);
  }
  if (!parsed.data.SMTP_HOST) {
    console.error('❌ SMTP_HOST is required in production (one-time passwords are sent by email)');
    process.exit(1);
  }
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
