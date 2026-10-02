'use client';

/**
 * SellerSectionNav — the hub's one navigation grammar: Overview /
 * Fulfilment / Earnings as route tabs on the shared ui/Tabs primitive
 * (hairline baseline, 2px ink underline, quiet tnum counts). Counts badge
 * the working surfaces so the radar is legible from anywhere.
 *
 * Below lg only — at lg the persistent SellerHubRail in the seller-hub
 * layout owns section navigation, so the strip hides itself.
 */

import { usePathname } from 'next/navigation';
import { Tabs } from '@/components/ui/Tabs';

export function SellerSectionNav({
  toPost = 0,
  posted = 0,
}: {
  toPost?: number;
  posted?: number;
}) {
  const pathname = usePathname();
  const sections: { href: string; label: string; count?: number }[] = [
    { href: '/seller-hub', label: 'Overview' },
    { href: '/seller-hub/listings', label: 'Listings' },
    { href: '/seller-hub/auctions', label: 'Auctions' },
    {
      href: '/seller-hub/fulfilment',
      label: 'Fulfilment',
      count: toPost + posted,
    },
    { href: '/seller-hub/earnings', label: 'Earnings' },
    { href: '/seller-hub/promotions', label: 'Promoted' },
    { href: '/seller-hub/analytics', label: 'Analytics' },
    { href: '/seller-hub/storefront', label: 'Storefront' },
    { href: '/seller-hub/settings', label: 'Settings' },
    // Utility routes — bare surfaces (no rail of their own) reachable only
    // through this nav grammar.
    { href: '/seller-hub/import', label: 'Import' },
    { href: '/seller-hub/quick-replies', label: 'Quick replies' },
  ];
  // Prefix-match only the section that owns child routes — the
  // per-listing manage surface keeps Listings lit.
  const active =
    sections.find(
      (s) =>
        pathname === s.href ||
        (s.href === '/seller-hub/listings' &&
          pathname.startsWith('/seller-hub/listings/')),
    )?.href ?? '';

  return (
    <Tabs
      className="-mx-4 mt-5 sm:-mx-6 lg:hidden"
      railClassName="px-1 sm:px-3"
      tabs={sections.map((s) => ({
        key: s.href,
        label: s.label,
        href: s.href,
        count: s.count,
      }))}
      active={active}
      ariaLabel="Seller hub sections"
    />
  );
}
