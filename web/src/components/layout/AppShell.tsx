'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { MobileTabBar } from './MobileTabBar';
import { Footer } from './Footer';

/** Routes that render without the global chrome (auth, immersive surfaces). */
const CHROMELESS_PREFIXES = ['/auth'];

/** Detail routes that keep the header but hide the mobile tab bar (pushed screens). */
const IMMERSIVE_RE = /^\/(inbox|poster|look)\/.+/;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless = CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p));
  const immersive = IMMERSIVE_RE.test(pathname);

  if (chromeless) {
    return <main className="min-h-dvh">{children}</main>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className={`flex-1 ${immersive ? '' : 'pb-[76px] md:pb-0'}`}>{children}</main>
      <Footer />
      {!immersive && <MobileTabBar />}
    </div>
  );
}
