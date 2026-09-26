'use client';

/**
 * /auth/signup — username, email, password with a live strength meter,
 * terms checkbox, submit → signIn() → home. Email prefills from the
 * landing's ?email= handoff.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface SignupErrors {
  username?: string;
  email?: string;
  password?: string;
  terms?: string;
}

interface Strength {
  level: number;
  label: string;
  textClass: string;
  barClass: string;
}

function passwordStrength(password: string): Strength {
  if (!password.length) {
    return { level: 0, label: '', textClass: 'text-text-muted', barClass: 'bg-text-muted' };
  }
  const variety = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (variety >= 3) score += 1;
  if (variety >= 4 && password.length >= 10) score += 1;
  if (score <= 1)
    return { level: 1, label: 'Weak', textClass: 'text-danger-text', barClass: 'bg-danger-text' };
  if (score === 2)
    return { level: 2, label: 'Fair', textClass: 'text-warning-text', barClass: 'bg-warning' };
  if (score === 3)
    return { level: 3, label: 'Good', textClass: 'text-success-text', barClass: 'bg-success' };
  return { level: 4, label: 'Strong', textClass: 'text-success-text', barClass: 'bg-success' };
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signup } = useSession();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: SignupErrors = {};
    if (username.trim().length < 3) next.username = 'Pick a username of at least 3 characters';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address';
    if (password.length < 6) next.password = 'Use at least 6 characters';
    if (!terms) next.terms = 'Accept the terms to continue';
    setErrors(next);
    if (next.username || next.email || next.password || next.terms) return;

    setSubmitting(true);
    setFormError(null);
    // New accounts get the welcome + notification-permission step, like the
    // mobile app does on first launch.
    void signup(email.trim(), password, username.trim())
      .then(() => router.push('/onboarding'))
      .catch((err: unknown) => {
        setFormError(err instanceof Error ? err.message : 'Sign up failed. Try again.');
        setSubmitting(false);
      });
  };

  return (
    <AuthShell>
      <Link
        href="/auth"
        className="pressable mb-10 inline-flex w-fit items-center gap-1.5 text-body text-text-secondary transition-colors hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Back
      </Link>

      <h1 className="text-screen-title font-bold text-text-primary">Create your account</h1>
      <p className="mt-1.5 text-body text-text-secondary">
        Buy and sell pre-loved fashion with protection on every order.
      </p>

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
            placeholder="At least 6 characters"
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
          {password.length > 0 ? (
            <div className="mt-2 flex items-center gap-2.5" aria-live="polite">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < strength.level ? strength.barClass : 'bg-surface-raised'
                    }`}
                  />
                ))}
              </div>
              <span className={`w-12 text-right text-micro font-semibold ${strength.textClass}`}>
                {strength.label}
              </span>
            </div>
          ) : null}
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
                href="https://thryftverse.com/terms"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-text-primary underline-offset-2 hover:underline"
              >
                Terms
              </a>{' '}
              and{' '}
              <a
                href="https://thryftverse.com/privacy"
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
        <Link href="/auth/login" className="font-semibold text-text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
