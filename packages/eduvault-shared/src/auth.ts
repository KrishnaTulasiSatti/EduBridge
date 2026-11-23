import { z } from 'zod';
import type { InstitutionStatus, VaultAccountStatus, VaultRole } from './roles';

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

const email = z.string().trim().toLowerCase().email('Enter a valid email');
const name = z.string().trim().min(2, 'Enter the full name').max(80);
const terms = z.literal(true, { error: 'You must accept the terms to continue' });

/** Activation codes look like `K7QMX-4TZRA`. Case and the dash are optional when typing. */
export const normalizeActivationCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const activationCodeSchema = z
  .string()
  .trim()
  .transform(normalizeActivationCode)
  .pipe(z.string().length(10, 'Enter the 10-character code from your institution'));

export const studentRegisterSchema = z.object({
  fullName: name,
  email,
  password: passwordSchema,
  activationCode: activationCodeSchema,
  acceptTerms: terms,
});
export type StudentRegisterInput = z.input<typeof studentRegisterSchema>;

export const institutionDetailsSchema = z.object({
  name: z.string().trim().min(4, 'Enter the institution name').max(150),
  university: z.string().trim().min(4, 'Enter the affiliating university').max(150),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,20}$/, 'Use 3–20 letters, numbers or dashes'),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.string().trim().min(2, 'Enter the state').max(80),
  website: z.string().trim().url('Enter a full address, e.g. https://college.edu.in').max(200).optional().or(z.literal('').transform(() => undefined)),
});
export type InstitutionDetails = z.infer<typeof institutionDetailsSchema>;

export const issuerRegisterSchema = z.object({
  fullName: name,
  designation: z.string().trim().min(2, 'Enter your designation').max(80),
  email,
  password: passwordSchema,
  institution: institutionDetailsSchema,
  acceptTerms: terms,
});
export type IssuerRegisterInput = z.input<typeof issuerRegisterSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface VaultUser {
  id: string;
  fullName: string;
  email: string;
  role: VaultRole;
  status: VaultAccountStatus;
  designation?: string;
  institution?: { id: string; name: string; status: InstitutionStatus };
  createdAt: string;
  lastLoginAt?: string;
}

export interface VaultAuthResponse {
  user: VaultUser;
  accessToken: string | null;
  pendingApproval?: boolean;
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, string[]> };
}
