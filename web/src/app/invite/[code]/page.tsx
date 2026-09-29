'use client';

/**
 * /invite/[code] — the shared referral-link landing. Captures the code
 * into referralAttribution storage (surviving until signup consumes it —
 * POST /auth/signup attributes it server-side), then hands off:
 *  - signed-in member → home (attribution is signup-time only)
 *  - visitor          → /auth/signup, where the code rides the payload
 *
 * The first-visit onboarding gate may detour this route before it mounts;
 * the stashed URL returns here after completion, so capture still runs.
 * The visible card is the fallback for a slow session resolve or a
 * stalled replace — never a dead screen.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/session/SessionProvider';
import { captureReferralCode } from '@/lib/referralAttribution';

export default function InviteCodePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user, sessionLoading } = useSession();
  const code = typeof params?.code === 'string' ? params.code : '';
  const [captured, setCaptured] = useState<string | null>(null);

  // Capture first — the code must persist before any route change, even
  // if the session takes a moment to resolve.
  useEffect(() => {
    setCaptured(captureReferralCode(code));
  }, [code]);

  useEffect(() => {
    if (sessionLoading) return;
    router.replace(user ? '/' : '/auth/signup');
  }, [sessionLoading, user, router]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:py-32">
      <p className="text-body-emphasis font-bold tracking-tight text-text-primary">ThryftVerse</p>
      <h1 className="mt-8 text-screen-title text-text-primary">You&apos;re invited</h1>
      <p className="mt-3 text-body text-text-secondary">
        {user
          ? 'You already have an account — referral codes apply at signup. Taking you home.'
          : 'A friend shared their invite. Create your account and their referral code is applied automatically.'}
      </p>
      {captured ? (
        <p className="mt-4 text-meta text-text-muted">
          Referral code <code className="font-semibold tracking-[0.15em] text-text-primary">{captured}</code> saved for signup.
        </p>
      ) : null}
      <div className="mt-8 w-full space-y-2">
        <Button
          variant="primary"
          fullWidth
          onClick={() => router.replace(user ? '/' : '/auth/signup')}
        >
          {user ? 'Open ThryftVerse' : 'Create your account'}
        </Button>
        {!user ? (
          <Button variant="quiet" fullWidth onClick={() => router.push('/auth/login')}>
            Already a member? Log in
          </Button>
        ) : null}
      </div>
    </div>
  );
}
