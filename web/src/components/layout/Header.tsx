'use client';

/**
 * Desktop header — flat canvas, hairline base. Logo, primary nav,
 * command search, utility icons, Sell CTA, avatar.
 * Mobile collapses to logo + search entry; tabs live in MobileTabBar.
 */

import { Logo } from './Logo';
import { DepartmentNav } from './DepartmentNav';
import { HeaderSearchForm } from './header/HeaderSearchForm';
import { HeaderUtilities } from './header/HeaderUtilities';
import { HeaderDepartmentRail } from './header/HeaderDepartmentRail';
import { CountBadge } from './header/CountBadge';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import {
  useUnreadConversationCount,
  useUnreadNotificationCount,
} from '@/lib/hooks/queries';
import { useStore, useHydrated } from '@/lib/store/useStore';

export { CountBadge };

export function Header() {
  const { isGuest } = useSession();
  const { requireAuth, wall } = useSignupWall();

  // Count-only badge reads — the notification endpoint is a scalar; the
  // chat badge derives from the shared conversations cache (no count
  // endpoint exists on the backend — see queries.ts).
  const { data: unreadChatCount } = useUnreadConversationCount();
  const { data: unreadNotifCount } = useUnreadNotificationCount();
  const hydrated = useHydrated();
  const bagCount = useStore((s) => s.bag.length);

  // Mute/request accounting and the read overlay live inside the count
  // hooks — the badge never touches row payloads.
  const unreadChats = unreadChatCount ?? 0;
  const unreadNotifs = unreadNotifCount ?? 0;
  const bagTotal = hydrated ? bagCount : 0;

  return (
    <>
      <header className="sticky top-0 z-sticky border-b border-border-subtle bg-header">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:gap-3 md:h-16 md:gap-4 md:px-6">
          <Logo className="shrink-0" />

          {/* Primary nav — desktop only, department flyouts on hover/focus */}
          <DepartmentNav />

          {/* Search — command-center, grows to fill. Below md it collapses
              to an icon that routes to the dedicated /search surface; the
              mobile tab bar owns primary navigation. */}
          <HeaderSearchForm />

          {/* Utilities — transparent 44px targets, glyph scrim not needed
              off-media. Mobile keeps search, alerts, bag, account — the
              actions the tab bar doesn't carry. */}
          <HeaderUtilities
            unreadNotifs={unreadNotifs}
            unreadChats={unreadChats}
            bagTotal={bagTotal}
            hydrated={hydrated}
            isGuest={isGuest}
            requireAuth={requireAuth}
          />
        </div>

        {/* Department rail — only in the md–lg gap: below md the tab bar
            owns navigation, at lg the inline DepartmentNav takes over. */}
        <HeaderDepartmentRail />
      </header>
      {wall}
    </>
  );
}
