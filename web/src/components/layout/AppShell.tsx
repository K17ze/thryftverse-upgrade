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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const chromeless = CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p));
  const immersive = IMMERSIVE_RE.test(pathname);

  // First-visit gate — the persisted flag the /onboarding completion CTA
  // writes. Until a session has seen the welcome step once, app routes
  // hand off to it (like mobile's first-launch flow); completion returns
  // to home. Hydration-gated: SSR can't know the stored flag.
  const hydrated = useHydrated();
  const hasSeenOnboarding = useStore((s) => s.hasSeenOnboarding);
  const needsOnboarding = hydrated && !hasSeenOnboarding && !chromeless;

  useEffect(() => {
    if (needsOnboarding) router.replace('/onboarding');
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
