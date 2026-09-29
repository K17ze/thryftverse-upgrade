'use client';

/**
 * /auth/signup — username, email, password with a live strength meter,
 * terms checkbox, submit → signIn() → home. Email prefills from the
 * landing's ?email= handoff.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';
import { clearReferralCode, peekReferralCode } from '@/lib/referralAttribution';
import { ONBOARDING_RETURN_KEY } from '@/components/layout/AppShell';
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_ERROR } from './passwordPolicy';
import { sanitizeReturnTo, withReturnTo } from './returnTo';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface SignupErrors {
  username?: string;
  email?: string;
  password?: string;
  terms?: string;
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signup } = useSession();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  // `?next=` resumes the gated destination once onboarding completes —
  // stashed via ONBOARDING_RETURN_KEY because onboarding's returnTo()
  // already validates and consumes it (single-use, internal paths only).
  const returnTo = sanitizeReturnTo(params.get('next'));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Code captured from an /invite/[code] link — forwarded on the signup
  // payload for server-side attribution. Read post-hydration: the store
  // is localStorage, which SSR cannot see.
  const [referralCode, setReferralCode] = useState<string | null>(null);
  useEffect(() => {
    setReferralCode(peekReferralCode());
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: SignupErrors = {};
    if (username.trim().length < 3) next.username = 'Pick a username of at least 3 characters';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address';
    if (password.length < MIN_PASSWORD_LENGTH) next.password = PASSWORD_LENGTH_ERROR;
    if (!terms) next.terms = 'Accept the terms to continue';
    setErrors(next);
    if (next.username || next.email || next.password || next.terms) return;

    setSubmitting(true);
    setFormError(null);
    // New accounts get the welcome + notification-permission step, like the
    // mobile app does on first launch. The captured referral code rides the
    // payload — attribution is one-shot, so it clears once signup lands.
    void signup(email.trim(), password, username.trim(), referralCode ?? undefined)
      .then(() => {
        if (referralCode) clearReferralCode();
        if (returnTo) {
          try {
            sessionStorage.setItem(ONBOARDING_RETURN_KEY, returnTo);
          } catch {
            // Storage unavailable — onboarding falls back to home.
          }
        }
        router.push('/onboarding');
      })
      .catch((err: unknown) => {
        setFormError(err instanceof Error ? err.message : 'Sign up failed. Try again.');
        setSubmitting(false);
      });
  };

  return (
    <AuthShell destination={returnTo ?? '/'}>
      <Link
        href={withReturnTo('/auth', returnTo)}
        className="pressable mb-10 inline-flex w-fit items-center gap-1.5 text-body text-text-secondary transition-colors hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Back
      </Link>

      <h1 className="text-screen-title text-text-primary">Create your account</h1>
      <p className="mt-1.5 text-body text-text-secondary">
        Buy and sell pre-loved fashion with protection on every order.
      </p>
      {referralCode ? (
        <p className="mt-3 flex items-center gap-2 text-caption text-text-secondary">
          <Icon name="people" size={14} className="shrink-0 text-brand" />
          Invited — referral code{' '}
          <code className="font-semibold tracking-[0.1em] text-text-primary">{referralCode}</code>{' '}
          applies automatically.
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
        <AuthField
          label="Username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="e.g. archive.thread"
          value={username}
          error={errors.username}
          onChange={(e) => {
            setUsername(e.target.value);
            setErrors((p) => ({ ...p, username: undefined }));
          }}
        />

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

        <div>
          <AuthField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="At least 8 characters"
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
          <PasswordStrength password={password} />
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => {
                setTerms(e.target.checked);
                setErrors((p) => ({ ...p, terms: undefined }));
              }}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border bg-input text-text-inverse transition-colors peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
            >
              {terms ? <Icon name="check" size={12} /> : null}
            </span>
            <span className="text-caption text-text-secondary">
              I agree to the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-text-primary underline-offset-2 hover:underline"
              >
                Terms
              </a>{' '}
              and{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
          {errors.terms ? (
            <p role="alert" className="mt-1.5 text-caption text-danger-text">
              {errors.terms}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="text-caption text-danger-text">
            {formError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitting}>
          {submitting ? 'Creating your account' : 'Sign up'}
        </Button>
      </form>

      <p className="mt-8 text-body text-text-secondary">
        Already a member?{' '}
        <Link
          href={withReturnTo('/auth/login', returnTo)}
          className="font-semibold text-text-primary hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export function SignupView() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
