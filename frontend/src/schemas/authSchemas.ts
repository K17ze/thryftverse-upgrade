import { z } from 'zod';

// ── Login form schema ──────────────────────────────────────────────
// Email is normalised to lowercase + trim before validation.
// Password minimum length matches the backend contract (6 characters).
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Enter your email address.')
    .email('Enter a valid email address.')
    .transform((v) => v.trim().toLowerCase()),
  password: z
    .string()
    .min(1, 'Enter your password.')
    .min(6, 'Password must be at least 6 characters.'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// ── Sign-up form schema ────────────────────────────────────────────
// Username minimum length matches the backend contract (3 characters).
// Password minimum length matches the backend contract (8 characters).
export const signUpSchema = z.object({
  username: z
    .string()
    .min(1, 'Choose a username.')
    .min(3, 'Username must be at least 3 characters.')
    .transform((v) => v.trim()),
  email: z
    .string()
    .min(1, 'Enter your email address.')
    .email('Enter a valid email address.')
    .transform((v) => v.trim().toLowerCase()),
  password: z
    .string()
    .min(1, 'Create a password.')
    .min(8, 'Password must be at least 8 characters.'),
});

export type SignUpFormData = z.infer<typeof signUpSchema>;
