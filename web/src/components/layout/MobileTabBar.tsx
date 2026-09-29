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
import { useSignupWall, type SignupAction } from '@/components/auth/SignupWall';
import { useConversations } from '@/lib/hooks/queries';
import { useHydrated } from '@/lib/store/useStore';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useLocale } from '@/lib/i18n';
import type { AppIconName } from '@/components/ui/Icon';

/** chrome.tabs.* keys — resolved via useLocale().t at render. */
type TabKey = 'home' | 'explore' | 'inbox' | 'profile' | 'signIn';

const TABS: { href: string; labelKey: TabKey; icon: AppIconName }[] = [
  { href: '/', labelKey: 'home', icon: 'home' },
  { href: '/explore', labelKey: 'explore', icon: 'explore' },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { user, isGuest } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { data: conversations } = useConversations();
  const hydrated = useHydrated();
  const requestResolutions = useInboxPrefs((s) => s.requests);
  // Message requests aren't message unread — pending requests count
  // separately, the mobile TabNavigator badge grammar.
  const unread =
    (conversations ?? []).filter((c) => c.unread && !c.isRequest).length +
    (conversations ?? []).filter(
      (c) => c.isRequest && !(hydrated && requestResolutions[c.id]),
    ).length;

  const item = (
    href: string,
    label: string,
    content: React.ReactNode,
    active: boolean,
    /** Account-bound destinations pass their wall action — a guest tap
     *  raises the signup wall instead of navigating. */
    gate?: SignupAction,
    /** When the accessible name differs from the visible label (badges). */
    ariaLabel?: string,
  ) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel ?? label}
      onClick={(e) => {
        if (gate && !requireAuth(gate)) e.preventDefault();
      }}
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
    <>
    <nav
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border-subtle bg-header/85 backdrop-blur-xl md:hidden"
      aria-label={t('chrome.aria.primaryNav')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-[68px] items-stretch">
        {TABS.map((tab) =>
          item(
            tab.href,
            t(`chrome.tabs.${tab.labelKey}`),
            <Icon name={tab.icon} filled={isActive(tab.href)} size={24} />,
            isActive(tab.href),
          ),
        )}

        {/* Create — center action, not a destination. Mirrors the native
            + tab opening CreatorStudio: web lands on the /create picker
            (look | poster | sell an item). */}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            aria-label={t('chrome.tabs.createAria')}
            onClick={() => {
              if (requireAuth('create_content')) router.push('/create');
            }}
            className="pressable flex h-[52px] w-[52px] items-center justify-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-text-inverse">
              <Icon name="plus" size={24} />
            </span>
          </button>
        </div>

        {item(
          '/inbox',
          t('chrome.tabs.inbox'),
          <span className="relative" aria-hidden>
            <Icon name="inbox" filled={isActive('/inbox')} size={24} />
            {unread > 0 ? (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-md border border-surface bg-danger px-1 text-micro font-bold text-scrim-text-primary">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </span>,
          isActive('/inbox'),
          'message_seller',
          unread > 0
            ? `${t('chrome.tabs.inbox')}, ${unread} unread`
            : t('chrome.tabs.inbox'),
        )}

        {item(
          isGuest ? '/auth' : '/profile',
          isGuest ? t('chrome.tabs.signIn') : t('chrome.tabs.profile'),
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
    {wall}
    </>
  );
}
