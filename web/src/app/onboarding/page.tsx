'use client';

/**
 * /onboarding — the mobile OnboardingScreen's web counterpart: wordmark
 * top, bottom-anchored welcome block, one CTA that asks for notification
 * permission, a Skip link, and the denial recovery state. Completion
 * writes the persisted flag the app layout already honours.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useStore } from '@/lib/store/useStore';

export default function OnboardingPage() {
  const router = useRouter();
  const markOnboardingSeen = useStore((s) => s.markOnboardingSeen);
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);

  const finish = () => {
    markOnboardingSeen();
    router.replace('/');
  };

  const handleContinue = async () => {
    setRequesting(true);
    try {
      if (typeof Notification === 'undefined' || Notification.permission === 'denied') {
        setDenied(true);
        return;
      }
      const result = await Notification.requestPermission();
      if (result === 'granted') finish();
      else setDenied(true);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pb-10 pt-8 sm:px-8">
      <p className="text-body-emphasis font-bold tracking-tight text-text-primary">ThryftVerse</p>

      <div className="mt-auto max-w-sm">
        {denied ? (
          <>
            <h1 className="text-display font-bold tracking-tight text-text-primary">
              Notifications off
            </h1>
            <p className="mt-3 text-body text-text-secondary">
              You&rsquo;ll miss order updates and auction alerts. Enable them later in Settings.
            </p>
            <div className="mt-6 space-y-2">
              <Button variant="primary" className="w-full" onClick={finish}>
                Continue without
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setDenied(false)}>
                Try again
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-display font-bold tracking-tight text-text-primary">
              Find pieces no one else has.
            </h1>
            <p className="mt-3 text-body text-text-secondary">
              Curated fashion from independent sellers. Co-own high-value pieces. Bid at live auctions.
            </p>
            <div className="mt-6 space-y-2">
              <Button variant="primary" className="w-full" disabled={requesting} onClick={handleContinue}>
                {requesting ? 'Requesting…' : 'Get started'}
              </Button>
              <Button variant="quiet" className="w-full" onClick={finish}>
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
