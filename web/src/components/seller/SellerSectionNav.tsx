'use client';

/**
 * SellerSectionNav — the hub's one navigation grammar: Overview /
 * Fulfilment / Earnings as hairline tabs with a 2px active underline.
 * Counts badge the working surfaces so the radar is legible from anywhere.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SellerSectionNav({
  toPost = 0,
  posted = 0,
}: {
  toPost?: number;
  posted?: number;
}) {
  const pathname = usePathname();
  const sections = [
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
    { href: '/seller-hub/settings', label: 'Settings' },
  ];
  return (
    <nav
      aria-label="Seller hub sections"
      className="mt-5 flex gap-6 overflow-x-auto border-b border-border-subtle"
    >
      {sections.map((s) => {
        // Prefix-match only the section that owns child routes — the
        // per-listing manage surface keeps Listings lit.
        const active =
          pathname === s.href ||
          (s.href === '/seller-hub/listings' && pathname.startsWith('/seller-hub/listings/'));
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-body-emphasis transition-colors ${
              active
                ? 'border-text-primary font-semibold text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {s.label}
            {s.count ? (
              <span className="tnum rounded-full bg-surface-alt px-1.5 py-0.5 text-micro font-semibold text-text-secondary">
                {s.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
