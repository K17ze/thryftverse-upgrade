import Link from 'next/link';
import { Logo } from './Logo';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { href: '/explore', label: 'Explore' },
      { href: '/categories', label: 'Categories' },
      { href: '/collections', label: 'Collections' },
      { href: '/outfits', label: 'Outfits' },
      { href: '/co-own', label: 'Co-Own' },
      { href: '/auctions', label: 'Auctions' },
      { href: '/live', label: 'Live shopping' },
      { href: '/galleria', label: 'Galleria' },
      { href: '/pulse', label: 'Pulse' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { href: '/sell', label: 'List an item' },
      { href: '/seller-hub', label: 'Seller hub' },
      { href: '/orders', label: 'Orders' },
      { href: '/wallet', label: 'Wallet' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: '/about', label: 'About ThryftVerse' },
      { href: '/sustainability', label: 'Sustainability' },
      { href: '/buyer-protection', label: 'Buyer protection' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/help', label: 'Help centre' },
      { href: '/support', label: 'Support centre' },
      { href: '/settings', label: 'Settings' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 hidden border-t border-border-subtle md:block">
      <div className="mx-auto max-w-[1440px] px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-[220px] text-caption text-text-secondary">
              The marketplace for pre-loved fashion.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-body text-text-secondary transition-colors hover:text-text-primary"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-center justify-between border-t border-border-subtle pt-6 text-caption text-text-muted">
          <span>© 2026 ThryftVerse</span>
          <span>Made for circular fashion</span>
        </div>
      </div>
    </footer>
  );
}
