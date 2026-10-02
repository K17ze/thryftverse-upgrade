'use client';

/**
 * SellerHubChrome — the desktop composition for the /seller-hub tree.
 * Below lg nothing here renders: each page owns its column and mounts the
 * horizontal SellerSectionNav tab strip (which hides itself at lg). At lg
 * the tree composes as a persistent left rail — the settings grammar: a
 * ~232px sticky column of the section destinations (plus the import and
 * quick-replies utility routes) beside a fluid content column.
 *
 * Destinations mirror SellerSectionNav 1:1, icons filled/outline per the
 * one-icon-family rule; the fulfilment badge reads the same
 * useFulfilmentCounts source the tab strip does. Surfaces that never
 * mounted the section nav — the printable label sheet, catalog import,
 * quick replies — pass through untouched so their narrower composition
 * (print sheet, wizard, back-bar column) survives.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useFulfilmentCounts } from '@/lib/hooks/seller-queries';

/** In-tree routes that keep their own composition — no rail. */
const BARE_ROUTES = [
  '/seller-hub/fulfilment/label',
  '/seller-hub/import',
  '/seller-hub/quick-replies',
];

const SECTIONS: {
  href: string;
  label: string;
  icon: AppIconName;
  /** Counts the to-post + posted queue — the tab strip's badge source. */
  queueBadge?: boolean;
}[] = [
  { href: '/seller-hub', label: 'Overview', icon: 'dashboard' },
  { href: '/seller-hub/listings', label: 'Listings', icon: 'inventory' },
  { href: '/seller-hub/auctions', label: 'Auctions', icon: 'auction' },
  { href: '/seller-hub/fulfilment', label: 'Fulfilment', icon: 'box', queueBadge: true },
  { href: '/seller-hub/earnings', label: 'Earnings', icon: 'payout' },
  { href: '/seller-hub/promotions', label: 'Promoted', icon: 'trending' },
  { href: '/seller-hub/analytics', label: 'Analytics', icon: 'analytics' },
  { href: '/seller-hub/storefront', label: 'Storefront', icon: 'store' },
  { href: '/seller-hub/settings', label: 'Settings', icon: 'settings' },
  // Utility routes — BARE_ROUTES, so nothing highlights on them; they sit
  // here so every hub destination is reachable from the one nav grammar.
  { href: '/seller-hub/import', label: 'Import', icon: 'download' },
  { href: '/seller-hub/quick-replies', label: 'Quick replies', icon: 'zap' },
];

function SellerHubRail() {
  const pathname = usePathname();
  const counts = useFulfilmentCounts();
  const queueCount = counts.toPost + counts.posted;

  // Same rule as SellerSectionNav — exact match, plus the section that
  // owns child routes (the per-listing manage surface keeps Listings lit).
  const isActive = (href: string) =>
    pathname === href ||
    (href === '/seller-hub/listings' &&
      pathname.startsWith('/seller-hub/listings/'));

  return (
    <nav aria-label="Seller hub sections" className="hidden lg:block lg:pt-12">
      <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-10 pr-1">
        <div className="space-y-px">
          {SECTIONS.map((s) => {
            const active = isActive(s.href);
            const count = s.queueBadge ? queueCount : 0;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={`pressable flex min-h-11 items-center gap-2.5 rounded-md px-3 text-body ${
                  active
                    ? 'bg-surface-alt font-medium text-text-primary'
                    : 'text-text-secondary hover:bg-row hover:text-text-primary'
                }`}
              >
                <Icon
                  name={s.icon}
                  size={16}
                  filled={active}
                  className={`shrink-0 ${active ? 'text-text-primary' : 'text-text-muted'}`}
                />
                <span className="clamp-1 min-w-0 flex-1">{s.label}</span>
                {count > 0 ? (
                  <span className="tnum text-meta font-medium text-text-muted">
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function SellerHubChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return <>{children}</>;
  }
  return (
    <div className="lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-6">
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 xl:gap-14">
        <SellerHubRail />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
