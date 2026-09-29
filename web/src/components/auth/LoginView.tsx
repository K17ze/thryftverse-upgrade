'use client';

/**
 * /auth/login — email + password sign-in. Show/hide password, forgot
 * path → /auth/forgot, submit → signIn() → home.
 *
 * Two-step for 2FA accounts: when /auth/login answers with a TWO_FACTOR_*
 * challenge code (TOTP enrolled via settings → security), the view swaps
 * to an authenticator-code step with a recovery-code alternate. The
 * challenge resubmits the same endpoint with `twoFactorCode` or
 * `recoveryCode` attached — the backend branches on which is present.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';
import * as authService from '@/lib/api/services/auth';
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_ERROR } from './passwordPolicy';
import { sanitizeReturnTo, withReturnTo } from './returnTo';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const TOTP_LENGTH = 6;

type LoginStep = 'credentials' | 'challenge';
type ChallengeMode = 'totp' | 'recovery';

interface LoginErrors {
  email?: string;
  password?: string;
}

function LoginViewInner() {
  const router = useRouter();
  const { login, refreshSession } = useSession();
  // `?next=` resumes the gated destination after credentials (or the 2FA
  // challenge) succeed — sanitized to internal paths only.
  const returnTo = sanitizeReturnTo(useSearchParams().get('next'));

  const [step, setStep] = useState<LoginStep>('credentials');
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>('totp');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: LoginErrors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Enter your password';
    else if (password.length < MIN_PASSWORD_LENGTH) next.password = PASSWORD_LENGTH_ERROR;
    setErrors(next);
    if (next.email || next.password) return;

    setSubmitting(true);
    setFormError(null);
    void login(email.trim(), password)
      .then(() => router.push(returnTo ?? '/'))
      .catch((err: unknown) => {
        if (authService.isTwoFactorChallengeError(err)) {
          // Credentials passed — the account demands a second factor.
          setStep('challenge');
          setChallengeMode('totp');
          setCode('');
          setCodeError(undefined);
        } else {
          setFormError(err instanceof Error ? err.message : 'Log in failed. Try again.');
        }
        setSubmitting(false);
      });
  };

  const submitChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (challengeMode === 'totp' && trimmed.length < TOTP_LENGTH) {
      setCodeError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (challengeMode === 'recovery' && !trimmed) {
      setCodeError('Enter your recovery code.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setCodeError(undefined);
    // session.login carries no second factor — the challenge resubmits
    // /auth/login directly, then refreshSession() resolves the new
    // identity exactly like the provider's login path does.
    void authService
      .login({
        email: email.trim(),
        password,
        ...(challengeMode === 'recovery'
          ? { recoveryCode: trimmed }
          : { twoFactorCode: trimmed }),
      })
      .then(() => refreshSession())
      .then(() => router.push(returnTo ?? '/'))
      .catch((err: unknown) => {
        // A wrong code also returns a TWO_FACTOR_* challenge error — stay
        // on this step and show the server's reason verbatim.
        setFormError(err instanceof Error ? err.message : 'Verification failed. Try again.');
        setSubmitting(false);
      });
  };

  const backToCredentials = () => {
    setStep('credentials');
    setCode('');
    setCodeError(undefined);
    setFormError(null);
  };

  const inChallenge = step === 'challenge';

  return (
    <AuthShell destination={returnTo ?? '/'}>
      {inChallenge ? (
        <button
          type="button"
          onClick={backToCredentials}
          className="pressable mb-10 inline-flex w-fit items-center gap-1.5 text-body text-text-secondary transition-colors hover:text-text-primary"
        >
          <Icon name="back" size={16} />
          Back
        </button>
      ) : (
        <Link
          href={withReturnTo('/auth', returnTo)}
          className="pressable mb-10 inline-flex w-fit items-center gap-1.5 text-body text-text-secondary transition-colors hover:text-text-primary"
        >
          <Icon name="back" size={16} />
          Back
        </Link>
      )}

      <h1 className="text-screen-title text-text-primary">
        {inChallenge ? 'Two-factor authentication' : 'Log in'}
      </h1>
      <p className="mt-1.5 text-body text-text-secondary">
        {inChallenge
          ? `Enter the code from your authenticator app to finish signing in as ${email.trim()}.`
          : 'Enter your details to continue.'}
      </p>

      {inChallenge ? (
        <form onSubmit={submitChallenge} className="mt-8 flex flex-col gap-4" noValidate>
          <AuthField
            key={challengeMode}
            label={challengeMode === 'recovery' ? 'Recovery code' : 'Authenticator code'}
            name={challengeMode === 'recovery' ? 'recovery-code' : 'two-factor-code'}
            type="text"
            inputMode={challengeMode === 'recovery' ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoCapitalize={challengeMode === 'recovery' ? 'characters' : 'none'}
            autoCorrect="off"
            spellCheck={false}
            maxLength={challengeMode === 'recovery' ? 32 : 12}
            placeholder={challengeMode === 'recovery' ? 'XXXX-XXXX-XXXX-XXXX' : '000000'}
            autoFocus
            value={code}
            error={codeError}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(undefined);
            }}
          />

          <div>
            <button
              type="button"
              onClick={() => {
                setChallengeMode((m) => (m === 'totp' ? 'recovery' : 'totp'));
                setCode('');
                setCodeError(undefined);
                setFormError(null);
              }}
              className="pressable inline-flex min-h-11 items-center text-caption font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {challengeMode === 'recovery'
                ? 'Use an authenticator code'
                : 'Use a recovery code'}
            </button>
          </div>

          {formError ? (
            <p role="alert" className="text-caption text-danger-text">
              {formError}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
            {submitting ? 'Verifying' : 'Verify'}
          </Button>
        </form>
      ) : (
        <>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
            <AuthField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              error={errors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((p) => ({ ...p, email: undefined }));
              }}
            />

            <AuthField
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              error={errors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((p) => ({ ...p, password: undefined }));
              }}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="pressable absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
                </button>
              }
            />

            <div className="flex justify-end">
              <Link
                href="/auth/forgot"
                className="pressable text-caption font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Forgot password?
              </Link>
            </div>

            {formError ? (
              <p role="alert" className="text-caption text-danger-text">
                {formError}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
              {submitting ? 'Logging in' : 'Log in'}
            </Button>
          </form>

          <p className="mt-8 text-body text-text-secondary">
            New to ThryftVerse?{' '}
            <Link
              href={withReturnTo('/auth/signup', returnTo)}
              className="font-semibold text-text-primary hover:underline"
            >
              Sign up
            </Link>
          </p>

          <p className="mt-3 text-body text-text-secondary">
            Just looking?{' '}
            <Link href="/" className="font-semibold text-text-primary hover:underline">
              Continue as guest
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}

export function LoginView() {
  // useSearchParams requires a Suspense boundary under static rendering.
  return (
    <Suspense fallback={null}>
      <LoginViewInner />
    </Suspense>
  );
}
