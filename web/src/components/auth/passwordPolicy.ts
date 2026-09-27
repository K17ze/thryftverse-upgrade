/**
 * Shared password policy — one minimum across every auth surface
 * (login, signup, reset, change-password). Native enforces 8 on
 * signup/reset (frontend/src/schemas/authSchemas.ts); web login
 * previously accepted 6, which no account password could ever satisfy —
 * unified on the stricter bound with one error string.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_LENGTH_ERROR = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
