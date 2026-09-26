'use client';

/**
 * /auth — auth landing. Tabs to the sub-flows, email continue (→ signup
 * with the address prefilled), quiet social paths, terms line.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField } from '@/components/auth/AuthField';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/session/SessionProvider';

export default function AuthLandingPage() {
  const router = useRouter();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);

  const continueWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim();
    router.push(`/auth/signup${normalized ? `?email=${encodeURIComponent(normalized)}` : ''}`);
  };

  const socialSignIn = (provider: 'google' | 'apple') => {
    setSocialLoading(provider);
    window.setTimeout(() => {
      signIn();
      router.push('/');
    }, 700);
  };

  return (
    <AuthShell>
      <nav aria-label="Account" className="flex gap-8 border-b border-border-subtle">
        <span
          aria-current="page"
          className="-mb-px border-b-2 border-text-primary pb-3 text-body-emphasis font-semibold text-text-primary"
        >
          Sign up
        </span>
        <Link
          href="/auth/login"
          className="pressable -mb-px border-b-2 border-transparent pb-3 text-body-emphasis text-text-secondary transition-colors hover:text-text-primary"
        >
          Log in
        </Link>
      </nav>

      <form onSubmit={continueWithEmail} className="mt-8" noValidate>
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth className="mt-4">
          Continue
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-border-subtle" />
        <span className="text-caption text-text-muted">or</span>
        <span className="h-px flex-1 bg-border-subtle" />
      </div>

      <SocialButtons
        loading={socialLoading}
        onGoogle={() => socialSignIn('google')}
        onApple={() => socialSignIn('apple')}
      />

      <p className="mt-8 text-caption text-text-muted">
        By continuing, you agree to our{' '}
        <a
          href="https://thryftverse.com/terms"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Terms
        </a>{' '}
        and{' '}
        <a
          href="https://thryftverse.com/privacy"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Privacy Policy
        </a>
        .
      </p>

      <p className="mt-6 text-body text-text-secondary">
        Already a member?{' '}
        <Link href="/auth/login" className="font-semibold text-text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
