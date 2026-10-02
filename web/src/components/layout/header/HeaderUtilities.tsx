'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { AccountMenu } from '../AccountMenu';
import { CountBadge } from './CountBadge';
import { useLocale } from '@/lib/i18n';
import type { SignupAction } from '@/components/auth/SignupWall';

interface HeaderUtilitiesProps {
  unreadNotifs: number;
  unreadChats: number;
  bagTotal: number;
  hydrated: boolean;
  isGuest: boolean;
  requireAuth: (reason: SignupAction) => boolean;
}

export function HeaderUtilities({
  unreadNotifs,
  unreadChats,
  bagTotal,
  hydrated,
  isGuest,
  requireAuth,
}: HeaderUtilitiesProps) {
  const router = useRouter();
  const { t } = useLocale();

  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
      <IconButton
        name="search"
        aria-label={t('chrome.header.searchPlaceholder')}
        onClick={() => router.push('/search')}
        className="md:hidden"
      />
      <span className="relative inline-flex">
        <IconButton
          name="notifications"
          aria-label={`${t('chrome.header.notifications')}${
            unreadNotifs ? `, ${unreadNotifs} new` : ''
          }`}
          onClick={() => router.push('/notifications')}
        />
        {hydrated ? <CountBadge count={unreadNotifs} /> : null}
      </span>
      <span className="relative hidden sm:inline-flex">
        <IconButton
          name="inbox"
          aria-label={`${t('chrome.header.inbox')}${
            unreadChats ? `, ${unreadChats} unread` : ''
          }`}
          onClick={() => {
            if (requireAuth('message_seller')) router.push('/inbox');
          }}
        />
        {hydrated ? <CountBadge count={unreadChats} /> : null}
      </span>
      <span className="relative inline-flex">
        <IconButton
          name="cart"
          aria-label={`${t('chrome.header.bag')}${
            bagTotal ? `, ${bagTotal} items` : ''
          }`}
          onClick={() => router.push('/bag')}
        />
        {hydrated ? <CountBadge count={bagTotal} tone="neutral" /> : null}
      </span>

      {/* Creator entry — desktop counterpart of the tab bar's centre
          create button; lands on the /create picker (look | poster). */}
      <IconButton
        name="create"
        aria-label={t('chrome.header.create')}
        onClick={() => {
          if (requireAuth('create_content')) router.push('/create');
        }}
        className="ml-1 max-sm:hidden"
      />
      <Button
        variant="primary"
        size="sm"
        icon="plus"
        className="ml-2 h-11 rounded-full max-md:hidden"
        onClick={() => {
          if (requireAuth('create_listing')) router.push('/sell');
        }}
      >
        {t('chrome.header.sellNow')}
      </Button>

      {isGuest ? (
        <Button
          variant="secondary"
          size="sm"
          className="ml-2 h-11 rounded-full"
          onClick={() => router.push('/auth')}
        >
          {t('chrome.tabs.signIn')}
        </Button>
      ) : (
        <AccountMenu />
      )}
    </div>
  );
}
