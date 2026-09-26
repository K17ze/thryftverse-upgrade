'use client';

/**
 * /auth/login — email + password sign-in. Show/hide password, forgot
 * path → /auth/forgot, submit → signIn() → home.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface LoginErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();

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
    else if (password.length < 6) next.password = 'Passwords are at least 6 characters';
    setErrors(next);
    if (next.email || next.password) return;

    setSubmitting(true);
    setFormError(null);
    void login(email.trim(), password)
      .then(() => router.push('/'))
      .catch((err: unknown) => {
        setFormError(err instanceof Error ? err.message : 'Log in failed. Try again.');
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

      <h1 className="text-screen-title font-bold text-text-primary">Log in</h1>
      <p className="mt-1.5 text-body text-text-secondary">Enter your details to continue.</p>

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
        <Link href="/auth/signup" className="font-semibold text-text-primary hover:underline">
          Sign up
        </Link>
      </p>

      <p className="mt-3 text-body text-text-secondary">
        Just looking?{' '}
        <Link href="/" className="font-semibold text-text-primary hover:underline">
          Continue as guest
        </Link>
      </p>
    </AuthShell>
  );
}
