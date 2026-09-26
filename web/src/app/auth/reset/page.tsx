'use client';

/**
 * /auth/reset — set a new password after the email link, matching the
 * mobile ResetPasswordScreen state machine:
 *   no token            → "incomplete link" dead-end → /auth/forgot
 *   ?token=expired      → "link expired" dead-end    → /auth/forgot
 *   any other token     → new + confirm form with strength feedback
 *   submit              → success → /auth/login
 *
 * Fixture mode: the token is only simulated — `?token=expired` is the
 * deterministic hook for the expired-link state (the forgot page hands
 * off `?token=demo`).
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import * as authService from '@/lib/api/services/auth';

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const expired = token === 'expired';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: { password?: string; confirm?: string } = {};
    if (!password) next.password = 'Enter a new password';
    else if (password.length < MIN_PASSWORD_LENGTH)
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    if (!confirm) next.confirm = 'Confirm your new password';
    else if (confirm !== password) next.confirm = 'Passwords don’t match';
    setErrors(next);
    if (next.password || next.confirm) return;

    setSubmitting(true);
    setFormError(null);
    if (DATA_MODE === 'live' && token) {
      authService
        .confirmPasswordReset(token, password)
        .then(() => {
          setSubmitting(false);
          setDone(true);
        })
        .catch(() => {
          setSubmitting(false);
          setFormError('This reset link is invalid or has expired. Request a new one.');
        });
      return;
    }
    // Simulated latency — the credential is not stored in fixture mode.
    window.setTimeout(() => {
      setSubmitting(false);
      setDone(true);
    }, 700);
  };

  const eye = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      className="pressable absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
    >
      <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
    </button>
  );

  return (
    <AuthShell>
      <Link
        href="/auth/login"
        className="pressable mb-10 inline-flex w-fit items-center gap-1.5 text-body text-text-secondary transition-colors hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Back
      </Link>

      {!token || expired ? (
        <div className="flex flex-col items-center text-center">
          <Icon name="link" size={40} className="text-text-muted" />
          <h1 className="mt-4 text-screen-title font-bold text-text-primary">
            {expired ? 'Link expired' : 'Incomplete link'}
          </h1>
          <p className="mt-2 max-w-xs text-body text-text-secondary">
            {expired
              ? 'This reset link is invalid or has expired. Request a new one.'
              : 'This reset link is missing its token. Request a new one.'}
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-8"
            onClick={() => router.push('/auth/forgot')}
          >
            Request a new reset link
          </Button>
          <Link
            href="/auth/login"
            className="pressable mt-4 text-body text-text-secondary transition-colors hover:text-text-primary"
          >
            Back to log in
          </Link>
        </div>
      ) : done ? (
        <div className="flex flex-col items-center text-center">
          <Icon name="shieldCheck" size={40} className="text-success-text" />
          <h1 className="mt-4 text-screen-title font-bold text-text-primary">Password reset</h1>
          <p className="mt-2 max-w-xs text-body text-text-secondary">
            Your password has been reset. You can now log in.
          </p>
          {DATA_MODE === 'live' ? null : (
            <p className="mt-2 max-w-xs text-caption text-text-muted">
              Demo mode — nothing is stored in this preview.
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-8"
            onClick={() => router.push('/auth/login')}
          >
            Back to log in
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-screen-title font-bold text-text-primary">New password</h1>
          <p className="mt-1.5 text-body text-text-secondary">
            Choose a new password for your account.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
            <div>
              <AuthField
                label="New password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                error={errors.password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((p) => ({ ...p, password: undefined }));
                }}
                trailing={eye(showPassword, () => setShowPassword((s) => !s))}
              />
              <PasswordStrength password={password} />
            </div>

            <AuthField
              label="Confirm password"
              name="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirm}
              error={errors.confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setErrors((p) => ({ ...p, confirm: undefined }));
              }}
              trailing={eye(showConfirm, () => setShowConfirm((s) => !s))}
            />

            {formError ? (
              <p role="alert" className="text-caption text-danger-text">
                {formError}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={submitting || !password || !confirm}
            >
              {submitting ? 'Resetting' : 'Reset password'}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFlow />
    </Suspense>
  );
}
