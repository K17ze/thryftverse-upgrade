'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from './Header';
import { MobileTabBar } from './MobileTabBar';
import { Footer } from './Footer';
import { useHydrated, useStore } from '@/lib/store/useStore';

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
  /^\/($|item\/|u\/|poster\/|look\/|search|browse|collections|galleria|auctions|live|co-own|about|terms|privacy|support|help|category|categories|explore|pulse|moodboards|outfits|buyer-protection|agents|invite)/;

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
  const hydrated = useHydrated();
  const hasSeenOnboarding = useStore((s) => s.hasSeenOnboarding);
  const isPublic = PUBLIC_RE.test(pathname);
  const needsOnboarding = hydrated && !hasSeenOnboarding && !chromeless && !isPublic;

  useEffect(() => {
    if (!needsOnboarding) return;
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
  }, [needsOnboarding, router]);

  if (chromeless) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-dvh">
        {children}
      </main>
    );
  }

  if (needsOnboarding) {
    // Redirect in flight — render nothing rather than flash the app shell
    // for a frame before /onboarding lands.
    return <main id="main-content" tabIndex={-1} className="min-h-dvh" />;
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
    </div>
  );
}
