import { z } from 'zod';
import { SELF_REGISTER_ROLES, type AccountStatus, type Role } from './roles';

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z
    .string({ error: 'Enter your mobile number' })
    .trim()
    .min(1, 'Enter your mobile number')
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  password: passwordSchema,
  role: z.enum(SELF_REGISTER_ROLES),
  acceptTerms: z.literal(true, { error: 'You must accept the terms and privacy policy' }),
  /** Sponsors only: proof that their PAN was verified (from /auth/sponsor-pan/confirm). */
  panToken: z.string().max(2000).optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;

/** PAN: 5 letters, 4 digits, 1 letter. The 4th letter is the holder type (P = individual). */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const isPastDate = (d: string) => {
  const date = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d) && date < new Date();
};

export const sponsorPanStartSchema = z.object({
  pan: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine((v) => PAN_PATTERN.test(v), 'Enter a valid PAN, e.g. ABCPK1234L'),
  fullName: z.string().trim().min(2, 'Enter your name as printed on your PAN card').max(80),
  dateOfBirth: z.string().refine(isPastDate, 'Enter your date of birth'),
});
export type SponsorPanStartInput = z.input<typeof sponsorPanStartSchema>;

export const sponsorPanConfirmSchema = z.object({
  reference: z.string().trim().min(8).max(64),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type SponsorPanConfirmInput = z.input<typeof sponsorPanConfirmSchema>;

export interface SponsorPanStartResponse {
  reference: string;
  otpSentTo: string;
  expiresAt: string;
}

export interface SponsorPanConfirmResponse {
  panToken: string;
  maskedPan: string;
  fullName: string;
}

/** Names are compared ignoring case, dots and extra spaces ("K. Ravi  Kumar" = "K RAVI KUMAR"). */
export const normalizePersonName = (name: string) =>
  name
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt?: string;
  /** Sponsors: their PAN was checked against the PAN registry with an OTP. */
  panVerification?: { maskedPan: string; verifiedAt: string };
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
