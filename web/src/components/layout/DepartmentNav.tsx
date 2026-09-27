'use client';

/**
 * DepartmentNav — desktop primary nav with Vinted-style flyouts.
 * Content-heavy departments open a hairline panel of their real
 * sub-navigation on hover or keyboard focus. Open state is explicit so
 * the trigger can carry honest ARIA (aria-expanded + aria-controls):
 * pointer enter/leave toggles, focus-in/focus-out toggles, Escape closes
 * and returns focus to the trigger, ArrowDown on the trigger moves into
 * the first flyout link. Panels only link to routes that exist under
 * app/. The mobile department rail in Header maps the same NAV
 * untouched.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { CATEGORIES } from '@/lib/data/fixtures';
import { useLocale } from '@/lib/i18n';

/** chrome.nav.* keys — resolved via useLocale().t at render. */
export type NavKey =
  | 'home'
  | 'explore'
  | 'pulse'
  | 'coown'
  | 'auctions'
  | 'live'
  | 'galleria';

export interface NavItem {
  href: string;
  labelKey: NavKey;
}

export const NAV: NavItem[] = [
  { href: '/', labelKey: 'home' },
  { href: '/explore', labelKey: 'explore' },
  { href: '/pulse', labelKey: 'pulse' },
  { href: '/co-own', labelKey: 'coown' },
  { href: '/auctions', labelKey: 'auctions' },
  { href: '/live', labelKey: 'live' },
  { href: '/galleria', labelKey: 'galleria' },
];

interface FlyoutLink {
  href: string;
  /** Literal label for data-derived strings (e.g. category names). */
  label?: string;
  /** chrome.links.* key — resolved via useLocale().t at render. */
  labelKey?: string;
}

interface FlyoutSection {
  /** chrome.groups.* key. */
  labelKey: string;
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
      labelKey: 'categories',
      wide: true,
      links: CATEGORIES.map((c) => ({
        href: `/category/${c.slug}`,
        label: c.name,
      })),
    },
    {
      labelKey: 'discover',
      links: [
        { href: '/categories', labelKey: 'allCategories' },
        { href: '/collections', labelKey: 'collections' },
        { href: '/outfits', labelKey: 'outfits' },
        { href: '/search/visual', labelKey: 'searchByPhoto' },
        { href: '/browse', labelKey: 'browseEverything' },
      ],
    },
  ],
  '/co-own': [
    {
      labelKey: 'invest',
      links: [
        { href: '/co-own', labelKey: 'browseAssets' },
        { href: '/co-own/portfolio', labelKey: 'yourPortfolio' },
        { href: '/co-own/syndicate', labelKey: 'syndicates' },
        { href: '/co-own/syndicate/create', labelKey: 'startSyndicate' },
      ],
    },
    {
      labelKey: 'track',
      links: [
        { href: '/co-own/distributions', labelKey: 'distributions' },
        { href: '/co-own/alerts', labelKey: 'priceAlerts' },
      ],
    },
  ],
  '/auctions': [
    {
      labelKey: 'bid',
      links: [
        { href: '/auctions', labelKey: 'liveAuctions' },
        { href: '/auctions/my-bids', labelKey: 'myBids' },
      ],
    },
    {
      labelKey: 'sell',
      links: [
        { href: '/auctions/create', labelKey: 'startAuction' },
        { href: '/seller-hub', labelKey: 'sellerHub' },
      ],
    },
  ],
  '/live': [
    {
      labelKey: 'liveShopping',
      links: [
        { href: '/live', labelKey: 'liveNow' },
        { href: '/live/create', labelKey: 'goLive' },
        { href: '/seller-hub', labelKey: 'sellerHub' },
      ],
    },
  ],
  '/galleria': [
    {
      labelKey: 'editorial',
      links: [
        { href: '/galleria', labelKey: 'latestIssue' },
        { href: '/collections', labelKey: 'collections' },
        { href: '/outfits', labelKey: 'outfits' },
        { href: '/outfits/builder', labelKey: 'outfitBuilder' },
      ],
    },
  ],
};

/**
 * Flyout panel — the invisible bridge (pt-2) keeps hover continuous
 * between the trigger and the card. visibility participates in the
 * 150ms transition so a closed panel is untabble and unannounced.
 */
function FlyoutPanel({
  id,
  label,
  sections,
  open,
}: {
  id: string;
  /** Resolved department label — used in the panel's aria name. */
  label: string;
  sections: FlyoutSection[];
  open: boolean;
}) {
  const { t } = useLocale();
  return (
    <div
      id={id}
      role="group"
      aria-label={t('chrome.aria.sections', { label })}
      className={`absolute left-1/2 top-full z-dropdown w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 pt-2 transition-[opacity,visibility] duration-150 ease-standard ${
        open ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
    >
      <div className="flex max-h-[70vh] gap-9 overflow-y-auto rounded-lg border border-border bg-surface-elevated p-5 shadow-subtle">
        {sections.map((section) => (
          <div key={section.labelKey} className="min-w-[148px]">
            <p className="px-2 text-label font-semibold uppercase tracking-wide text-text-muted">
              {t(`chrome.groups.${section.labelKey}`)}
            </p>
            <ul
              className={`mt-1.5 ${section.wide ? 'grid grid-cols-2 gap-x-5' : ''}`}
            >
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    tabIndex={open ? 0 : -1}
                    className="pressable block rounded-md px-2 py-1.5 text-body text-text-secondary hover:bg-row hover:text-text-primary focus:bg-row focus:text-text-primary focus:outline-none"
                  >
                    {link.labelKey ? t(`chrome.links.${link.labelKey}`) : link.label}
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
  const { t } = useLocale();
  const [openHref, setOpenHref] = useState<string | null>(null);
  // Escape restores focus to the trigger — that focus event must not
  // re-open the panel it just closed, so the next focus-open per item
  // is swallowed once.
  const suppressFocusOpen = useRef<string | null>(null);

  return (
    <nav
      className="ml-2 hidden h-full items-stretch gap-1 lg:flex"
      aria-label={t('chrome.aria.primaryNav')}
    >
      {NAV.map((item) => {
        const label = t(`chrome.nav.${item.labelKey}`);
        const active =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
        const flyout = FLYOUTS[item.href];
        const panelId = `dept-flyout-${item.href.replace(/\//g, '') || 'home'}`;
        const open = flyout != null && openHref === item.href;
        return (
          <div
            key={item.href}
            className="relative flex items-center"
            onMouseEnter={() => {
              if (flyout) setOpenHref(item.href);
            }}
            onMouseLeave={() => {
              setOpenHref((cur) => (cur === item.href ? null : cur));
            }}
            onFocus={() => {
              if (suppressFocusOpen.current === item.href) {
                suppressFocusOpen.current = null;
                return;
              }
              if (flyout) setOpenHref(item.href);
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOpenHref((cur) => (cur === item.href ? null : cur));
              }
            }}
            onKeyDown={(e) => {
              // Escape closes and restores focus to the trigger — the
              // member keeps their place in the nav instead of dropping
              // to <body>.
              if (e.key === 'Escape' && open) {
                e.preventDefault();
                setOpenHref(null);
                suppressFocusOpen.current = item.href;
                e.currentTarget.querySelector<HTMLElement>('a')?.focus();
              }
            }}
          >
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              aria-expanded={flyout ? open : undefined}
              aria-controls={flyout ? panelId : undefined}
              onKeyDown={(e) => {
                // APG: ArrowDown opens the flyout and moves into the
                // first link — keyboard users get the panel content
                // sighted users get on hover.
                if (e.key === 'ArrowDown' && flyout) {
                  e.preventDefault();
                  setOpenHref(item.href);
                  requestAnimationFrame(() => {
                    document
                      .getElementById(panelId)
                      ?.querySelector<HTMLElement>('a')
                      ?.focus();
                  });
                }
              }}
              className={`pressable rounded-md px-3 py-2 text-body-emphasis ${
                active
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary focus:text-text-primary'
              }`}
            >
              {label}
            </Link>
            {flyout ? (
              <FlyoutPanel id={panelId} label={label} sections={flyout} open={open} />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
