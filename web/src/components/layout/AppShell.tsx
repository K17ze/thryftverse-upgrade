'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from './Header';
import { MobileTabBar } from './MobileTabBar';
import { Footer } from './Footer';
import { CommandPalette } from './CommandPalette';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useNotificationRealtime } from '@/lib/hooks/chat-realtime';
import { useLocale } from '@/lib/i18n/useLocale';
import { Spinner } from '@/components/ui/Spinner';

/** Routes that render without the global chrome (auth, onboarding, immersive surfaces). */
const CHROMELESS_PREFIXES = ['/auth', '/onboarding'];

/** Detail routes that keep the header but hide the mobile tab bar (pushed screens). */
const IMMERSIVE_RE = /^\/(inbox|poster|look)\/.+/;

/**
 * Public surfaces — a first-visit deep link renders its content
 * immediately (Pinterest/Vinted grammar: the shared PDP/profile/search
 * page IS the product; conversion happens contextually at save/buy/
 * message via the signup wall, not by hijacking the URL). The first-
 * visit onboarding gate still intercepts account-dependent routes
 * (bag, sell, inbox, settings, onboarding-adjacent flows).
 */
const PUBLIC_RE =
  /^\/($|item\/|u\/|poster\/|look\/|search|browse|collections|collection\/|galleria|auctions|live|co-own|about|terms|privacy|support|help|category|categories|explore|pulse|moodboards|moodboard\/|outfits|buyer-protection|agents|invite)/;

/** Where the pre-onboarding destination is stashed — consumed by the
 *  onboarding completion (OnboardingView) and validated there. */
export const ONBOARDING_RETURN_KEY = 'onboarding:return-to';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const chromeless = CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p));
  const immersive = IMMERSIVE_RE.test(pathname);

  // First-visit gate — the persisted flag the /onboarding completion CTA
  // writes. Public routes never redirect: a shared /item/x or /u/name
  // renders straight away and account actions gate at press time. Only
  // account-scoped surfaces (bag, sell, inbox, settings…) still hand off
  // to onboarding, and they stash the destination first so completion
  // can return to it. Hydration-gated: SSR can't know the stored flag.
  const { t } = useLocale();
  const hydrated = useHydrated();
  const hasSeenOnboarding = useStore((s) => s.hasSeenOnboarding);
  const ageConfirmed = useSettingsPrefs((s) => s.ageConfirmedAt !== null);
  const isPublic = PUBLIC_RE.test(pathname);
  const needsOnboarding = hydrated && !hasSeenOnboarding && !chromeless && !isPublic;

  // The 18+ declaration (native AgeVerificationScreen — app-launch gate
  // ahead of onboarding and auth) fires where native gates it: account
  // creation / first authenticated use. Web's equivalents are the /auth
  // entry points plus every account-scoped surface — i.e. the same set
  // onboarding covers — while public browsing and /onboarding itself
  // stay open (the marketplace is browsable signed-out; /onboarding is
  // the destination and must never redirect to itself).
  const onOnboardingRoute = pathname.startsWith('/onboarding');
  const onAuthRoute = pathname.startsWith('/auth');
  const needsAgeDeclaration =
    hydrated &&
    !ageConfirmed &&
    !onOnboardingRoute &&
    (onAuthRoute || (!chromeless && !isPublic));
  const needsGate = needsOnboarding || needsAgeDeclaration;

  // Live notification stream — `notifications.user:{id}` keeps the
  // header badge + feed fresh app-wide. Internally gated: guests,
  // fixture mode and pre-hydration never open the SSE connection.
  useNotificationRealtime();

  useEffect(() => {
    if (!needsGate) return;
    // Stash where the member was heading — full href (path + query) so
    // deep links like /item/x?ref=share survive. sessionStorage keeps the
    // /onboarding URL clean and shareable; the stash is consumed once by
    // the onboarding completion.
    try {
      const intended = `${window.location.pathname}${window.location.search}`;
      if (intended && intended !== '/onboarding') {
        sessionStorage.setItem(ONBOARDING_RETURN_KEY, intended);
      }
    } catch {
      // Storage unavailable (private mode) — completion falls back to home.
    }
    router.replace('/onboarding');
  }, [needsGate, router]);

  if (chromeless) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-dvh">
        {/* A gated chromeless route (/auth/* for the undeclared) renders
            nothing while the redirect lands — no auth form under a gate. */}
        {needsGate ? null : children}
      </main>
    );
  }

  if (needsGate) {
    // Redirect in flight — don't flash the app shell for a frame before
    // /onboarding lands, but don't leave a blank viewport either: the
    // first-visit deep-link path can hold this state for a beat on slow
    // networks, so a minimal brand mark + spinner carries the wait.
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-dvh items-center justify-center"
      >
        <div role="status" className="flex flex-col items-center gap-3">
          <span className="select-none text-[22px] font-extrabold tracking-[-0.8px] text-text-primary">
            ThryftVerse
          </span>
          <span className="flex items-center gap-2 text-meta text-text-muted">
            <Spinner size={14} tone="neutral" />
            {t('states.loading')}
          </span>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 ${immersive ? '' : 'pb-[76px] md:pb-0'}`}
      >
        {children}
      </main>
      <Footer />
      {!immersive && <MobileTabBar />}
      {/* ⌘K / `/` quick navigation — desktop power-user grammar. */}
      <CommandPalette />
    </div>
  );
}
