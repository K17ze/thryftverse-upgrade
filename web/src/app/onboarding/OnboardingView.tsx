'use client';

/**
 * /onboarding — the mobile OnboardingScreen's web counterpart: wordmark
 * top, bottom-anchored welcome block, one CTA that asks for notification
 * permission, a Skip link, and the denial recovery states. Completion
 * writes the persisted flag the app shell honours on first visit.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { ONBOARDING_RETURN_KEY } from '@/components/layout/AppShell';
import { DATA_MODE } from '@/lib/api/client';

/**
 * Denial has two honest shapes:
 * - 'dismissed' — the browser prompt was closed or left unanswered; a
 *   genuine retry is still allowed.
 * - 'blocked' — Notification.permission === 'denied'. The browser will
 *   not show the prompt again no matter how often we ask, so retrying is
 *   a lie — the only real path is the browser's site settings.
 */
type Denial = 'dismissed' | 'blocked' | null;

/**
 * The ask runs as the double-permission pattern: the welcome step never
 * fires the browser prompt — it hands off to a pre-ask that says what we
 * send and what it costs, and only the explicit "Enable notifications"
 * CTA on that step raises Notification.requestPermission(). A denied
 * prompt is sticky in most browsers, so the honest explanation comes first.
 */
type Step = 'intro' | 'notify';

const LIVE = DATA_MODE === 'live';

export function OnboardingView() {
  const router = useRouter();
  const markOnboardingSeen = useStore((s) => s.markOnboardingSeen);
  const [step, setStep] = useState<Step>('intro');
  const [requesting, setRequesting] = useState(false);
  const [denial, setDenial] = useState<Denial>(null);

  // Mirror of the AppShell gate: a session that already completed
  // onboarding has no business here — land on home. Hydration-gated
  // because the flag lives in persisted storage SSR can't see.
  const hydrated = useHydrated();
  const hasSeenOnboarding = useStore((s) => s.hasSeenOnboarding);
  useEffect(() => {
    if (hydrated && hasSeenOnboarding) router.replace('/');
  }, [hydrated, hasSeenOnboarding, router]);

  /**
   * The stashed deep-link destination (AppShell writes it when it gates
   * to /onboarding) — validated to an internal path (starts with '/',
   * never protocol-relative) and consumed on read so a reload can't
   * replay a stale destination.
   */
  const returnTo = (): string => {
    try {
      const stashed = sessionStorage.getItem(ONBOARDING_RETURN_KEY);
      sessionStorage.removeItem(ONBOARDING_RETURN_KEY);
      if (stashed && stashed.startsWith('/') && !stashed.startsWith('//')) {
        return stashed;
      }
    } catch {
      // Storage unavailable — home is the honest default.
    }
    return '/';
  };

  const finish = () => {
    markOnboardingSeen();
    router.replace(returnTo());
  };

  /**
   * The notify step only exists where the permission can do something.
   * Web has no push rail — no service worker, no PushSubscription, and the
   * backend device registry (POST /notifications/devices/register) only
   * accepts Expo push tokens a browser cannot mint. Asking for
   * Notification permission in live mode would promise order updates and
   * auction alerts nothing delivers, so live skips the ask; the fixture
   * preview keeps the designed flow.
   */
  const handleGetStarted = () => {
    if (LIVE) {
      finish();
      return;
    }
    setStep('notify');
  };

  const handleContinue = async () => {
    setRequesting(true);
    try {
      if (typeof Notification === 'undefined') {
        // No Notifications API — nothing to ask for; don't block entry.
        finish();
        return;
      }
      if (Notification.permission === 'denied') {
        setDenial('blocked');
        return;
      }
      const result = await Notification.requestPermission();
      if (result === 'granted') finish();
      else setDenial(result === 'denied' ? 'blocked' : 'dismissed');
    } finally {
      setRequesting(false);
    }
  };

  /** Blocked-state recheck — reads the live permission again after the
   *  member has (hopefully) enabled notifications in browser settings. */
  const checkAgain = () => {
    if (typeof Notification === 'undefined') {
      finish();
      return;
    }
    if (Notification.permission === 'granted') {
      finish();
      return;
    }
    // Still blocked → stay honest on this state; back to default → retry.
    if (Notification.permission === 'default') setDenial('dismissed');
  };

  if (hydrated && hasSeenOnboarding) {
    // Redirect in flight — render nothing rather than flash the welcome.
    return null;
  }

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pb-10 pt-8 sm:px-8 lg:items-center lg:justify-center lg:py-12">
      {/* Below lg this inner box is a transparent full-height column —
          wordmark top, welcome block bottom-anchored, exactly the mobile
          composition. At lg it becomes a centered first-run card. */}
      <div className="flex min-h-0 flex-1 flex-col lg:w-full lg:max-w-[440px] lg:flex-none lg:rounded-xl lg:border lg:border-border-subtle lg:bg-surface-alt lg:px-10 lg:py-9">
        <p className="text-body-emphasis font-bold tracking-tight text-text-primary">ThryftVerse</p>

        <div className="mt-auto max-w-sm lg:mt-10 lg:max-w-none">
        {denial === 'blocked' ? (
          <>
            <h1 className="text-display font-bold tracking-tight text-text-primary">
              Notifications are blocked
            </h1>
            <p className="mt-3 text-body text-text-secondary">
              Your browser won&rsquo;t let ThryftVerse ask again. To get order updates and
              auction alerts, allow notifications for this site in your browser&rsquo;s site
              settings &mdash; usually the padlock or tune icon in the address bar &mdash;
              then check again.
            </p>
            <div className="mt-6 space-y-2">
              <Button variant="primary" className="w-full" onClick={checkAgain}>
                I&rsquo;ve enabled them — check again
              </Button>
              <Button variant="secondary" className="w-full" onClick={finish}>
                Continue without
              </Button>
            </div>
          </>
        ) : denial === 'dismissed' ? (
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
              <Button
                variant="secondary"
                className="w-full"
                disabled={requesting}
                onClick={handleContinue}
              >
                {requesting ? 'Requesting…' : 'Try again'}
              </Button>
            </div>
          </>
        ) : step === 'notify' ? (
          <>
            <h1 className="text-display font-bold tracking-tight text-text-primary">
              Stay in the loop
            </h1>
            <p className="mt-3 text-body text-text-secondary">
              ThryftVerse sends order updates, price drops on pieces you&rsquo;ve saved,
              and auction alerts &mdash; only the categories you leave on in Settings.
            </p>
            <p className="mt-3 text-body text-text-secondary">
              Your browser will ask if it can show notifications.
            </p>
            <div className="mt-6 space-y-2">
              <Button
                variant="primary"
                className="w-full"
                disabled={requesting}
                onClick={handleContinue}
              >
                {requesting ? 'Requesting…' : 'Enable notifications'}
              </Button>
              <Button variant="quiet" className="w-full" onClick={finish}>
                Not now
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
              <Button variant="primary" className="w-full" onClick={handleGetStarted}>
                Get started
              </Button>
              <Button variant="quiet" className="w-full" onClick={finish}>
                Skip
              </Button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
