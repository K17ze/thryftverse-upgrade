'use client';

/**
 * DepartmentNav — desktop primary nav with Vinted-style flyouts.
 * Content-heavy departments open a hairline panel of their real
 * sub-navigation on hover or keyboard focus — driven by CSS
 * (group-hover + group-focus-within), so there is no open state to
 * manage. Mouseleave closes naturally; Escape releases focus, which
 * collapses the focus-within panel. Panels only link to routes that
 * exist under app/. The mobile department rail in Header maps the
 * same NAV untouched.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CATEGORIES } from '@/lib/data/fixtures';

export interface NavItem {
  href: string;
  label: string;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/pulse', label: 'Pulse' },
  { href: '/co-own', label: 'Co-Own' },
  { href: '/auctions', label: 'Auctions' },
  { href: '/live', label: 'Live' },
  { href: '/galleria', label: 'Galleria' },
];

interface FlyoutLink {
  href: string;
  label: string;
}

interface FlyoutSection {
  label: string;
  links: FlyoutLink[];
  /** Dense link sets flow into two columns (Vinted's category grid). */
  wide?: boolean;
}

/**
 * Department sub-navigation — every href resolves to a real route.
 * Single-surface departments (Home, Pulse) carry no flyout.
 */
const FLYOUTS: Record<string, FlyoutSection[]> = {
  '/explore': [
    {
      label: 'Categories',
      wide: true,
      links: CATEGORIES.map((c) => ({
        href: `/category/${c.slug}`,
        label: c.name,
      })),
    },
    {
      label: 'Discover',
      links: [
        { href: '/categories', label: 'All categories' },
        { href: '/collections', label: 'Collections' },
        { href: '/outfits', label: 'Outfits' },
        { href: '/search/visual', label: 'Search by photo' },
        { href: '/browse', label: 'Browse everything' },
      ],
    },
  ],
  '/co-own': [
    {
      label: 'Invest',
      links: [
        { href: '/co-own', label: 'Browse assets' },
        { href: '/co-own/portfolio', label: 'Your portfolio' },
        { href: '/co-own/syndicate', label: 'Syndicates' },
        { href: '/co-own/syndicate/create', label: 'Start a syndicate' },
      ],
    },
    {
      label: 'Track',
      links: [
        { href: '/co-own/distributions', label: 'Distributions' },
        { href: '/co-own/alerts', label: 'Price alerts' },
      ],
    },
  ],
  '/auctions': [
    {
      label: 'Bid',
      links: [
        { href: '/auctions', label: 'Live auctions' },
        { href: '/auctions/my-bids', label: 'My bids' },
      ],
    },
    {
      label: 'Sell',
      links: [
        { href: '/auctions/create', label: 'Start an auction' },
        { href: '/seller-hub', label: 'Seller hub' },
      ],
    },
  ],
  '/live': [
    {
      label: 'Live shopping',
      links: [
        { href: '/live', label: 'Live now' },
        { href: '/live/create', label: 'Go live' },
        { href: '/seller-hub', label: 'Seller hub' },
      ],
    },
  ],
  '/galleria': [
    {
      label: 'Editorial',
      links: [
        { href: '/galleria', label: 'Latest issue' },
        { href: '/collections', label: 'Collections' },
        { href: '/outfits', label: 'Outfits' },
        { href: '/outfits/builder', label: 'Outfit builder' },
      ],
    },
  ],
};

/**
 * Flyout panel — invisible bridge (pt-2) keeps hover continuous between
 * the trigger and the card. visibility participates in the 150ms
 * transition so a hidden panel is untabble and unannounced.
 */
function FlyoutPanel({ sections }: { sections: FlyoutSection[] }) {
  return (
    <div className="invisible absolute left-1/2 top-full z-dropdown w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 pt-2 opacity-0 transition-[opacity,visibility] duration-150 ease-standard group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
      <div className="flex max-h-[70vh] gap-9 overflow-y-auto rounded-lg border border-border bg-surface-elevated p-5 shadow-subtle">
        {sections.map((section) => (
          <div key={section.label} className="min-w-[148px]">
            <p className="px-2 text-label font-semibold uppercase tracking-wide text-text-muted">
              {section.label}
            </p>
            <ul
              className={`mt-1.5 ${section.wide ? 'grid grid-cols-2 gap-x-5' : ''}`}
            >
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="pressable block rounded-md px-2 py-1.5 text-body text-text-secondary hover:bg-row hover:text-text-primary focus:bg-row focus:text-text-primary focus:outline-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DepartmentNav() {
  const pathname = usePathname();
  return (
    <nav
      className="ml-2 hidden h-full items-stretch gap-1 lg:flex"
      aria-label="Primary"
    >
      {NAV.map((item) => {
        const active =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
        const flyout = FLYOUTS[item.href];
        return (
          <div
            key={item.href}
            className="group relative flex items-center"
            onKeyDown={(e) => {
              // Escape closes the CSS flyout: releasing focus drops
              // focus-within, which returns the panel to hidden.
              if (e.key === 'Escape' && flyout) {
                e.preventDefault();
                (document.activeElement as HTMLElement | null)?.blur();
              }
            }}
          >
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`pressable rounded-md px-3 py-2 text-body-emphasis ${
                active
                  ? 'text-text-primary'
                  : 'text-text-secondary group-hover:text-text-primary group-focus-within:text-text-primary'
              }`}
            >
              {item.label}
            </Link>
            {flyout ? <FlyoutPanel sections={flyout} /> : null}
          </div>
        );
      })}
    </nav>
  );
}
