'use client';

/**
 * HostGate — the signed-out surface for seller live surfaces. Full-page
 * variant of the SignupWall grammar: one icon, one value sentence,
 * Create account / Log in CTAs, "Maybe later" back to the live hub.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export function HostGate() {
  const router = useRouter();
  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-text-muted">
        <Icon name="videocam" size={28} />
      </span>
      <h1 className="mt-5 text-screen-title font-bold text-text-primary">
        Join ThryftVerse to go live
      </h1>
      <p className="mt-2 text-body text-text-secondary">
        Sell live from your own closet — create a free account to start a show.
      </p>
      <div className="mt-7 flex w-full flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/auth/signup')}>
          Create account
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={() => router.push('/auth/login')}>
          Log in
        </Button>
        <Link
          href="/live"
          className="pressable mt-1 h-11 rounded-md text-body font-medium text-text-primary hover:bg-brand-subtle inline-flex items-center justify-center"
        >
          Maybe later
        </Link>
      </div>
    </div>
  );
}
