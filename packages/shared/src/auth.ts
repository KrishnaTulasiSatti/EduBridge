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
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
  role: z.enum(SELF_REGISTER_ROLES),
  acceptTerms: z.literal(true, { error: 'You must accept the terms and privacy policy' }),
});
export type RegisterInput = z.input<typeof registerSchema>;

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
