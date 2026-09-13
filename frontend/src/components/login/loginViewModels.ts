/**
 * Login view models — pure derivation, formatting and validation helpers for
 * the login screen's credential, OTP, magic-link and social flows. Kept out
 * of the screen so the orchestrator stays lean and the rules stay testable.
 *
 * Every message string and threshold below is verbatim from the original
 * LoginScreen implementation — extraction only, no behavior change.
 */

import type { loginWithPassword } from '../../services/authApi';

/** Success payload shared by password, OTP, Google and Apple auth calls. */
export type LoginAuthResult = Awaited<ReturnType<typeof loginWithPassword>>;
export type LoginAuthMethod = 'email' | 'google' | 'apple';
export type LoginAuthSuccessHandler = (
  result: LoginAuthResult,
  method: LoginAuthMethod,
  surface: string
) => void;

/** Permissive email shape used across every login flow. */
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export const MIN_PASSWORD_LENGTH = 6;
export const MIN_OTP_CODE_LENGTH = 4;
export const TWO_FACTOR_CODE_LENGTH = 6;

/** Canonical email form used for every auth request. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(normalizedEmail: string): boolean {
  return EMAIL_PATTERN.test(normalizedEmail);
}

/** Digits-only sanitiser for numeric codes (authenticator TOTP). */
export function sanitizeNumericCode(value: string, maxLength = TWO_FACTOR_CODE_LENGTH): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

/** Recovery codes render uppercase — matches backend canonicalisation. */
export function sanitizeRecoveryCode(value: string): string {
  return value.toUpperCase();
}

/**
 * Password-login field validation. Optional keys are present only when the
 * original flow touched that field-level error (the email-shape and
 * password-length branches each clear only their own field error).
 */
export interface PasswordLoginValidation {
  errorMsg: string;
  emailError?: string;
  passwordError?: string;
}

export function validatePasswordLogin(email: string, password: string): PasswordLoginValidation | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return {
      errorMsg: 'Fill in both email and password.',
      emailError: normalizedEmail ? '' : 'Email is required.',
      passwordError: password ? '' : 'Password is required.',
    };
  }
  if (!isValidEmail(normalizedEmail)) {
    return {
      errorMsg: 'Enter a valid email address.',
      emailError: 'Enter a valid email address.',
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      errorMsg: 'Password must be at least 6 characters.',
      passwordError: 'Password must be at least 6 characters.',
    };
  }
  return null;
}

export function validateEmailForOtp(email: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return 'Enter your email first to receive an OTP code.';
  if (!isValidEmail(normalizedEmail)) return 'Enter a valid email address before requesting OTP.';
  return null;
}

export function validateEmailForMagicLink(email: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return 'Enter your email first to request a magic link.';
  if (!isValidEmail(normalizedEmail)) return 'Enter a valid email address before requesting a magic link.';
  return null;
}

export function validateOtpCode(otpCode: string): string | null {
  return otpCode.trim().length < MIN_OTP_CODE_LENGTH
    ? 'Enter the OTP code from your email.'
    : null;
}

export function validateOtpTwoFactorInput(params: {
  useRecovery: boolean;
  twoFactorCode: string;
  recoveryCode: string;
}): string | null {
  if (params.useRecovery) {
    return params.recoveryCode.trim() ? null : 'Enter your recovery code.';
  }
  return params.twoFactorCode.trim().length < TWO_FACTOR_CODE_LENGTH
    ? 'Enter the 6-digit code from your authenticator app.'
    : null;
}

/** Password-login error codes that surface the inline 2FA challenge. */
const TWO_FACTOR_CHALLENGE_CODES: ReadonlySet<string> = new Set([
  'TWO_FACTOR_CODE_REQUIRED',
  'TWO_FACTOR_CODE_INVALID',
  'RECOVERY_CODE_INVALID',
  'TWO_FACTOR_NOT_CONFIGURED',
]);

export function isTwoFactorChallengeError(code: string | undefined): boolean {
  return code != null && TWO_FACTOR_CHALLENGE_CODES.has(code);
}

export function isOtpTwoFactorRequired(code: string | undefined): boolean {
  return code === 'TWO_FACTOR_REQUIRED';
}

/** OTP verify failure copy — appends server-provided attempts remaining. */
export function formatOtpErrorMessage(error: unknown): string {
  const maybeAttempts = (error as { attemptsRemaining?: number }).attemptsRemaining;
  const baseMessage = (error as Error).message || 'Unable to verify OTP right now.';
  return typeof maybeAttempts === 'number'
    ? `${baseMessage} Attempts left: ${maybeAttempts}.`
    : baseMessage;
}

/** Post-request info copy for the OTP challenge. */
export function otpRequestInfoMessage(result: { developmentCode?: string }): string {
  return result.developmentCode
    ? `Development OTP: ${result.developmentCode}`
    : 'OTP sent to your email. Enter the code below.';
}

/** Post-request info copy for the magic-link flow. */
export function magicLinkInfoMessage(result: { message: string; developmentMagicLink?: string }): string {
  return result.developmentMagicLink
    ? `Development magic link: ${result.developmentMagicLink}`
    : result.message;
}

export interface LoginActionInput {
  email: string;
  password: string;
  isSubmitting: boolean;
  isMagicSending: boolean;
  isOtpSending: boolean;
  isOtpVerifying: boolean;
  otpChallengeId: string | null;
  otpCode: string;
  otpTwoFactorRequired: boolean;
}

/** Button enablement flags — pure derivation over the form state machine. */
export function deriveLoginActionState(input: LoginActionInput) {
  return {
    canSubmit: input.email.trim().length > 0 && input.password.length > 0 && !input.isSubmitting,
    canRequestMagicLink: input.email.trim().length > 0 && !input.isSubmitting && !input.isMagicSending,
    canRequestOtp: input.email.trim().length > 0 && !input.isSubmitting && !input.isOtpSending,
    canVerifyOtp:
      !!input.otpChallengeId &&
      input.otpCode.trim().length >= MIN_OTP_CODE_LENGTH &&
      !input.isOtpVerifying &&
      !input.isSubmitting &&
      !input.otpTwoFactorRequired,
  };
}

/** Google OAuth is configured when any platform client id is present. */
export function hasGoogleOAuthConfig(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID
  );
}
