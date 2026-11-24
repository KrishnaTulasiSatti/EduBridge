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

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
