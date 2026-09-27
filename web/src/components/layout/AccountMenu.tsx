'use client';

/**
 * AccountMenu — avatar dropdown for the signed-in desktop header, the
 * Vinted/eBay account pattern the shell was missing. Identity header,
 * account destinations, sign out. Menu ARIA semantics, Escape/arrow
 * handling, outside-pointer dismissal.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';
import { useLocale } from '@/lib/i18n';

/** labelKey resolves under chrome.* via useLocale().t at render. */
const DESTINATIONS: { href: string; labelKey: string; icon: AppIconName }[] = [
  { href: '/profile', labelKey: 'tabs.profile', icon: 'profile' },
  { href: '/orders', labelKey: 'links.orders', icon: 'receipt' },
  { href: '/saved', labelKey: 'account.saved', icon: 'heart' },
  { href: '/outfits', labelKey: 'links.outfits', icon: 'layers' },
  { href: '/offers', labelKey: 'account.offers', icon: 'tag' },
  { href: '/wallet', labelKey: 'links.wallet', icon: 'wallet' },
  { href: '/seller-hub', labelKey: 'links.sellerHub', icon: 'store' },
  { href: '/agents', labelKey: 'account.aiAgents', icon: 'chip' },
  { href: '/invite', labelKey: 'links.inviteEarn', icon: 'people' },
  { href: '/support', labelKey: 'links.support', icon: 'help' },
  { href: '/settings', labelKey: 'links.settings', icon: 'settings' },
];

export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  // Close on route change.
  useEffect(() => close(), [pathname]);

  // Close on pointer-down outside; focus the first item on open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (e.key === 'Tab') {
      // Menu grammar (the FeedItemMenu fix): close, return focus to the
      // trigger, then let the browser's default tab step continue from
      // it — an open menu left past its Tab position strands the order.
      close();
      rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx <= 0 ? items.length - 1 : idx - 1);
      items[next]?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative ml-1" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={t('chrome.account.yourAccount')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`pressable rounded-full ${open ? 'ring-2 ring-text-primary ring-offset-2 ring-offset-header' : ''}`}
      >
        <Avatar src={user?.avatar} name={user?.username} size={34} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('chrome.account.menu')}
          className="absolute right-0 top-full z-elevated mt-2 w-64 overflow-hidden rounded-lg border border-border bg-surface-elevated py-1.5 shadow-floating"
        >
          <Link
            href="/profile"
            role="menuitem"
            className="flex items-center gap-3 px-4 py-3 hover:bg-row focus:bg-row focus:outline-none"
          >
            <Avatar src={user?.avatar} name={user?.username} size={40} />
            <span className="min-w-0">
              <span className="clamp-1 block text-body-emphasis font-semibold text-text-primary">
                {user?.username}
              </span>
              <span className="block text-meta text-text-secondary">
                {t('chrome.account.viewProfile')}
              </span>
            </span>
          </Link>

          <div className="my-1.5 border-t border-border-subtle" role="separator" />

          {DESTINATIONS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-body text-text-primary hover:bg-row focus:bg-row focus:outline-none"
            >
              <Icon name={d.icon} size={19} className="text-text-secondary" />
              {t(`chrome.${d.labelKey}`)}
            </Link>
          ))}

          <div className="my-1.5 border-t border-border-subtle" role="separator" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              signOut();
              router.push('/');
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body text-text-primary hover:bg-row focus:bg-row focus:outline-none"
          >
            <Icon name="exit" size={19} className="text-text-secondary" />
            {t('chrome.account.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
