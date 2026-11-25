import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5001),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  UPLOAD_DIR: z.string().default('./uploads'),
  EDUVAULT_API_URL: z.string().url().default('http://localhost:5100'),
  EDUVAULT_CLIENT_ID: z.string().default('edubridge'),
  EDUVAULT_CLIENT_SECRET: z.string().optional().default(''),
  /** PAN Registry (simulation) used to verify sponsors' PAN with an OTP. */
  PAN_REGISTRY_URL: z.string().url().default('http://localhost:5200'),
  PAN_REGISTRY_CLIENT_ID: z.string().default('edubridge'),
  PAN_REGISTRY_CLIENT_SECRET: z.string().optional().default(''),
  ML_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  ML_SERVICE_TOKEN: z.string().optional().default(''),
  /** 32-byte key (64 hex characters) used to encrypt sensitive fields such as Aadhaar numbers. */
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^([0-9a-fA-F]{64})?$/, 'DATA_ENCRYPTION_KEY must be 64 hex characters')
    .optional()
    .default(''),
  /** Files of applications that were not approved are deleted this many days after the decision. */
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(180),
  /** Email notifications (SMTP). Leave SMTP_HOST empty in development to print emails in the console instead. */
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  /** Sender shown in the inbox, e.g. "EduBridge <yourname@gmail.com>". Defaults to SMTP_USER. */
  MAIL_FROM: z.string().optional().default(''),
  /** Brevo API key. When set, email goes through Brevo over HTTPS instead of SMTP (needed on hosts that block SMTP). */
  BREVO_API_KEY: z.string().optional().default(''),
  /** The website address used in email links. Defaults to the first CLIENT_ORIGIN. */
  APP_URL: z.string().optional().default(''),
});

const parsed = envSchema.safeParse({
  ...process.env,
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ??
    (process.env.NODE_ENV === 'test' ? 'test-secret-test-secret-test-secret-123' : undefined),
});

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATA_ENCRYPTION_KEY) {
  console.error('❌ DATA_ENCRYPTION_KEY is required in production');
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.MONGODB_URI) {
  console.error('❌ MONGODB_URI is required in production');
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.SMTP_HOST && !parsed.data.BREVO_API_KEY) {
  console.warn('⚠️  Neither BREVO_API_KEY nor SMTP_HOST is set: email notifications will not be sent');
}
if (parsed.data.BREVO_API_KEY && !parsed.data.MAIL_FROM) {
  console.warn('⚠️  BREVO_API_KEY is set but MAIL_FROM is empty: set MAIL_FROM to a sender verified in Brevo');
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
/** Website address used in email links. */
export const appUrl = (env.APP_URL || env.CLIENT_ORIGIN.split(',')[0]).trim().replace(/\/+$/, '');
