'use client';

/**
 * /auth/forgot — request a password reset link. Email validation →
 * staged "check your inbox" state with resend, matching the mobile
 * ForgotPasswordScreen state machine. Fixture mode: no email leaves
 * this preview — the sent state says so and carries a simulated link
 * to /auth/reset so the flow stays navigable.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import * as authService from '@/lib/api/services/auth';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const isLive = DATA_MODE === 'live';

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState('');

  const requestReset = (onDone: () => void) => {
    if (isLive) {
      // Always resolves to the same sent state — the backend deliberately
      // does not reveal whether the email exists.
      authService
        .requestPasswordReset(email.trim().toLowerCase())
        .catch(() => undefined)
        .finally(onDone);
      return;
    }
    window.setTimeout(onDone, 700);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_RE.test(normalized)) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setSubmitting(true);
    // Simulated latency in fixture mode — there is no mail backend.
    requestReset(() => {
      setSubmitting(false);
      setSent(true);
    });
  };

  const resend = () => {
    if (resending) return;
    setResendNote('');
    setResending(true);
    requestReset(() => {
      setResending(false);
      setResendNote('Reset link resent.');
    });
  };

  return (
    <AuthShell>
      <Link
        href="/auth/login"
        className="pressable mb-10 inline-flex w-fit items-center gap-1.5 text-body text-text-secondary transition-colors hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Back
      </Link>

      <h1 className="text-screen-title font-bold text-text-primary">Reset password</h1>

      {sent ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <Icon name="mailUnread" size={40} className="text-success-text" />
          <p className="mt-4 text-body text-text-primary">
            We&apos;ve sent a reset link to{' '}
            <span className="font-semibold">{email.trim().toLowerCase()}</span>.
          </p>
          {isLive ? null : (
            <p className="mt-2 text-caption text-text-muted">
              Demo mode — nothing is actually emailed.{' '}
              <Link
                href="/auth/reset?token=demo"
                className="font-semibold text-text-primary underline-offset-2 hover:underline"
              >
                Open the simulated reset link
              </Link>
              .
            </p>
          )}

          <Button
            variant="secondary"
            size="md"
            fullWidth
            className="mt-6"
            onClick={resend}
            disabled={resending}
          >
            {resending ? 'Resending' : 'Resend reset link'}
          </Button>
          {resendNote ? (
            <p role="status" className="mt-2 text-caption text-text-secondary">
              {resendNote}
            </p>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-3"
            onClick={() => router.push('/auth/login')}
          >
            Back to log in
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-body text-text-secondary">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
            <AuthField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              error={error}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={submitting || !email.trim()}
            >
              {submitting ? 'Sending' : 'Send reset link'}
            </Button>
          </form>

          <p className="mt-8 text-body text-text-secondary">
            Remembered it?{' '}
            <Link href="/auth/login" className="font-semibold text-text-primary hover:underline">
              Log in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
