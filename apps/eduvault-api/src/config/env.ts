import 'dotenv/config';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5100),
  /** EduVault web origin(s). The first one is used to build consent links. */
  CLIENT_ORIGIN: z.string().default('http://localhost:5174'),
  MONGODB_URI: z.string().optional().default(''),
  /** Database name inside the cluster, so EduVault data never mixes with EduBridge data. */
  MONGODB_DB: z.string().default('eduvault'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** 32-byte hex key that encrypts institution private signing keys at rest (AES-256-GCM). */
  KEY_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'KEY_ENCRYPTION_KEY must be 64 hex characters'),

  /** The EduBridge platform, registered as a partner that may request documents. */
  EDUBRIDGE_CLIENT_ID: z.string().min(3).default('edubridge'),
  EDUBRIDGE_CLIENT_SECRET: z.string().min(32, 'EDUBRIDGE_CLIENT_SECRET must be at least 32 characters'),
  /** Private storage for marksheet PDFs (outside any public folder). */
  UPLOAD_DIR: z.string().default('./uploads'),

  EDUBRIDGE_REDIRECT_URIS: z.string().default('http://localhost:5173/dashboard/eduvault/callback'),

  /** Email (SMTP) for sending activation codes to students. Leave SMTP_HOST empty in development to print emails in the console. */
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  /** Brevo API key. When set, email goes through Brevo over HTTPS instead of SMTP (needed on hosts that block SMTP). */
  BREVO_API_KEY: z.string().optional().default(''),
});

const testDefaults = isTest
  ? {
      JWT_ACCESS_SECRET: 'vault-test-secret-vault-test-secret-123',
      KEY_ENCRYPTION_KEY: '0'.repeat(64),
      EDUBRIDGE_CLIENT_SECRET: 'test-partner-secret-test-partner-secret',
    }
  : {};

const parsed = envSchema.safeParse({ ...testDefaults, ...process.env });

if (!parsed.success) {
  console.error('❌ Invalid EduVault environment configuration:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.MONGODB_URI) {
  console.error('❌ MONGODB_URI is required in production');
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const webOrigin = env.CLIENT_ORIGIN.split(',')[0].trim();
