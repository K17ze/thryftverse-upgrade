'use client';

/**
 * Mobile tab bar — 1:1 port of TabNavigator: 5 slots, center Create
 * action button, labels visible, glass backdrop, badges.
 * Rendered below md; content scrolls behind it.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useSession } from '@/lib/session/SessionProvider';
import { useConversations } from '@/lib/hooks/queries';
import type { AppIconName } from '@/components/ui/Icon';

const TABS: { href: string; label: string; icon: AppIconName }[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/explore', label: 'Explore', icon: 'explore' },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isGuest } = useSession();
  const { data: conversations } = useConversations();
  const unread = (conversations ?? []).filter((c) => c.unread).length;

  const item = (
    href: string,
    label: string,
    content: React.ReactNode,
    active: boolean,
  ) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={`pressable flex min-h-11 flex-1 flex-col items-center justify-center gap-1 ${
        active ? 'text-text-primary' : 'text-text-muted'
      }`}
    >
      {content}
      <span className="text-meta font-medium leading-none">{label}</span>
    </Link>
  );

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border-subtle bg-header/85 backdrop-blur-xl md:hidden"
      aria-label="Primary"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-[68px] items-stretch">
        {TABS.map((t) =>
          item(t.href, t.label, <Icon name={t.icon} filled={isActive(t.href)} size={24} />, isActive(t.href)),
        )}

        {/* Create — center action, not a destination */}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            aria-label="Create — list a new item"
            onClick={() => router.push('/sell')}
            className="pressable flex h-[52px] w-[52px] items-center justify-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-text-inverse">
              <Icon name="plus" size={24} />
            </span>
          </button>
        </div>

        {item(
          '/inbox',
          'Inbox',
          <span className="relative">
            <Icon name="inbox" filled={isActive('/inbox')} size={24} />
            {unread > 0 ? (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-md border border-surface bg-danger px-1 text-[10px] font-bold text-scrim-text-primary">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </span>,
          isActive('/inbox'),
        )}

        {item(
          isGuest ? '/auth' : '/profile',
          isGuest ? 'Sign in' : 'Profile',
          isGuest ? (
            <Icon name="profile" filled={isActive('/auth')} size={24} />
          ) : (
            <span className={`rounded-full ${isActive('/profile') ? 'ring-2 ring-text-primary' : ''}`}>
              <Avatar src={user?.avatar} name={user?.username} size={27} />
            </span>
          ),
          isGuest ? isActive('/auth') : isActive('/profile'),
        )}
      </div>
    </nav>
  );
}
