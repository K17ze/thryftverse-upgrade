'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { useLocale } from '@/lib/i18n';

/** Link labels resolve through chrome.* keys — the authored table in
 *  scripts/sync-locales.mjs carries the translations. */
const COLUMNS: { titleKey: string; links: { href: string; key: string }[] }[] = [
  {
    titleKey: 'footer.colShop',
    links: [
      { href: '/explore', key: 'nav.explore' },
      { href: '/categories', key: 'groups.categories' },
      { href: '/collections', key: 'links.collections' },
      { href: '/outfits', key: 'links.outfits' },
      { href: '/co-own', key: 'nav.coown' },
      { href: '/auctions', key: 'nav.auctions' },
      { href: '/live', key: 'groups.liveShopping' },
      { href: '/galleria', key: 'nav.galleria' },
      { href: '/pulse', key: 'nav.pulse' },
    ],
  },
  {
    titleKey: 'footer.colSell',
    links: [
      { href: '/sell', key: 'links.listAnItem' },
      { href: '/seller-hub', key: 'links.sellerHub' },
      { href: '/orders', key: 'links.orders' },
      { href: '/wallet', key: 'links.wallet' },
    ],
  },
  {
    titleKey: 'footer.colAbout',
    links: [
      { href: '/about', key: 'links.aboutThryftverse' },
      { href: '/invite', key: 'links.inviteEarn' },
      { href: '/sustainability', key: 'links.sustainability' },
      { href: '/buyer-protection', key: 'links.buyerProtection' },
    ],
  },
  {
    titleKey: 'footer.colHelp',
    links: [
      { href: '/help', key: 'links.helpCentre' },
      { href: '/support', key: 'links.supportCentre' },
      { href: '/settings', key: 'links.settings' },
      { href: '/privacy', key: 'links.privacy' },
      { href: '/terms', key: 'links.terms' },
    ],
  },
];

const LEGAL_LINKS = [
  { href: '/help', key: 'links.help' },
  { href: '/support', key: 'links.support' },
  { href: '/buyer-protection', key: 'links.buyerProtection' },
  { href: '/terms', key: 'links.terms' },
  { href: '/privacy', key: 'links.privacy' },
  { href: '/about', key: 'links.about' },
];

export function Footer() {
  const { t } = useLocale();
  return (
    <footer className="mt-16 border-t border-border-subtle">
      {/* Mobile legal strip — the tab bar owns navigation but policy links
          must stay reachable below md; one quiet wrap row plus the line. */}
      <div className="px-5 pb-28 pt-8 md:hidden">
        <nav aria-label={t('chrome.footer.legalAria')}>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="pressable text-caption text-text-muted transition-colors hover:text-text-primary"
                >
                  {t(`chrome.${l.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-4 text-center text-meta text-text-muted">
          {t('chrome.footer.copyright')}
        </p>
      </div>

      {/* Desktop link columns */}
      <div className="mx-auto hidden max-w-[1440px] px-6 py-12 md:block">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-[220px] text-caption text-text-secondary">
              {t('chrome.footer.tagline')}
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.titleKey}>
              <h3 className="text-label text-text-muted">
                {t(`chrome.${col.titleKey}`)}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-body text-text-secondary transition-colors hover:text-text-primary"
                    >
                      {t(`chrome.${l.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-center justify-between border-t border-border-subtle pt-6 text-caption text-text-muted">
          <span>{t('chrome.footer.copyright')}</span>
          <span>{t('chrome.footer.madeFor')}</span>
        </div>
      </div>
    </footer>
  );
}
