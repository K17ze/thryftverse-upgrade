'use client';

/**
 * Desktop header — flat canvas, hairline base. Logo, primary nav,
 * command search, utility icons, Sell CTA, avatar.
 * Mobile collapses to logo + search entry; tabs live in MobileTabBar.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { DepartmentNav, NAV } from './DepartmentNav';
import {
  SearchSuggestions,
  useSuggestionOptions,
  suggestionOptionId,
  type SuggestionOption,
} from './SearchSuggestions';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { AccountMenu } from './AccountMenu';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import {
  useUnreadConversationCount,
  useUnreadNotificationCount,
} from '@/lib/hooks/queries';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useRecentSearches } from '@/components/search/searchHistory';
import { useLocale } from '@/lib/i18n';

const SEARCH_LISTBOX_ID = 'header-search-listbox';

/** Numeric utility badge. `alert` (danger) is reserved for counts that
 *  need action — unread notifications, new messages. A bag count is
 *  inventory, not an alarm, so it wears the neutral brand pill. */
function CountBadge({ count, tone = 'alert' }: { count: number; tone?: 'alert' | 'neutral' }) {
  if (count <= 0) return null;
  return (
    <span
      className={`tnum pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-bold leading-none ${
        tone === 'alert' ? 'bg-danger text-scrim-text-primary' : 'bg-brand text-text-inverse'
      }`}
      aria-hidden
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { isGuest } = useSession();
  const { requireAuth, wall } = useSignupWall();
  // Count-only badge reads — the notification endpoint is a scalar; the
  // chat badge derives from the shared conversations cache (no count
  // endpoint exists on the backend — see queries.ts).
  const { data: unreadChatCount } = useUnreadConversationCount();
  const { data: unreadNotifCount } = useUnreadNotificationCount();
  const hydrated = useHydrated();
  const bagCount = useStore((s) => s.bag.length);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const { recent, add: addRecent, remove: removeRecent } = useRecentSearches();

  // Mute/request accounting and the read overlay live inside the count
  // hooks — the badge never touches row payloads.
  const unreadChats = unreadChatCount ?? 0;
  const unreadNotifs = unreadNotifCount ?? 0;
  const bagTotal = hydrated ? bagCount : 0;

  const suggestions = useSuggestionOptions(q, recent);

  const closeSuggestions = () => {
    setSearchOpen(false);
    setActiveOption(-1);
  };

  const selectTerm = (term: string) => {
    const t = term.trim();
    if (t) {
      addRecent(t);
      setQ(t);
    }
    closeSuggestions();
    router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
  };

  /** Direct destinations (member profiles) navigate; terms run a search. */
  const selectOption = (option: SuggestionOption) => {
    if (option.href) {
      closeSuggestions();
      router.push(option.href);
      return;
    }
    selectTerm(option.term);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    selectTerm(q);
  };

  // Close on route change — a selection (or the pinned visual-search
  // link) navigates; the panel must not linger across the transition.
  useEffect(() => {
    setSearchOpen(false);
    setActiveOption(-1);
  }, [pathname]);

  // Close on pointer-down outside the field + panel.
  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) {
        closeSuggestions();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!searchOpen) setSearchOpen(true);
      if (suggestions.length) {
        setActiveOption((i) => (i + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length) {
        setActiveOption((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      }
    } else if (e.key === 'Enter') {
      if (searchOpen && activeOption >= 0 && suggestions[activeOption]) {
        e.preventDefault();
        selectOption(suggestions[activeOption]);
      }
    } else if (e.key === 'Escape') {
      if (searchOpen) {
        e.preventDefault();
        closeSuggestions();
      }
    }
  };

  return (
    <>
    <header className="sticky top-0 z-sticky border-b border-border-subtle bg-header">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:gap-3 md:h-16 md:gap-4 md:px-6">
        <Logo className="shrink-0" />

        {/* Primary nav — desktop only, department flyouts on hover/focus */}
        <DepartmentNav />

        {/* Search — command-center, grows to fill. Below md it collapses
            to an icon that routes to the dedicated /search surface; the
            mobile tab bar owns primary navigation. */}
        <form onSubmit={submit} role="search" className="mx-auto hidden w-full min-w-0 max-w-xl flex-1 md:block">
          <div ref={searchBoxRef} className="relative">
            <label className="relative block">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                <Icon name="search" size={18} />
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSearchOpen(true);
                  setActiveOption(-1);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={(e) => {
                  if (!searchBoxRef.current?.contains(e.relatedTarget as Node)) {
                    closeSuggestions();
                  }
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={t('chrome.header.searchPlaceholder')}
                aria-label={t('chrome.header.searchPlaceholder')}
                role="combobox"
                aria-expanded={searchOpen}
                aria-controls={SEARCH_LISTBOX_ID}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  searchOpen && activeOption >= 0
                    ? suggestionOptionId(SEARCH_LISTBOX_ID, activeOption)
                    : undefined
                }
                autoComplete="off"
                className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-10 pr-4 text-body text-input-text placeholder:text-text-muted focus:border-border focus:bg-surface-raised focus:outline-none"
              />
            </label>
            {searchOpen ? (
              <SearchSuggestions
                listboxId={SEARCH_LISTBOX_ID}
                options={suggestions}
                activeIndex={activeOption}
                onActiveIndex={setActiveOption}
                onSelect={selectOption}
                onRemoveRecent={(term) => {
                  removeRecent(term);
                  setActiveOption(-1);
                }}
              />
            ) : null}
          </div>
        </form>

        {/* Utilities — transparent 44px targets, glyph scrim not needed
            off-media. Mobile keeps search, alerts, bag, account — the
            actions the tab bar doesn't carry. */}
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
              aria-label={`${t('chrome.header.notifications')}${unreadNotifs ? `, ${unreadNotifs} new` : ''}`}
              onClick={() => router.push('/notifications')}
            />
            {hydrated ? <CountBadge count={unreadNotifs} /> : null}
          </span>
          <span className="relative hidden sm:inline-flex">
            <IconButton
              name="inbox"
              aria-label={`${t('chrome.header.inbox')}${unreadChats ? `, ${unreadChats} unread` : ''}`}
              onClick={() => {
                if (requireAuth('message_seller')) router.push('/inbox');
              }}
            />
            {hydrated ? <CountBadge count={unreadChats} /> : null}
          </span>
          <span className="relative inline-flex">
            <IconButton
              name="cart"
              aria-label={`${t('chrome.header.bag')}${bagTotal ? `, ${bagTotal} items` : ''}`}
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
            className="ml-1 hidden sm:inline-flex"
          />
          <Button
            variant="primary"
            size="sm"
            icon="plus"
            className="ml-2 hidden h-11 rounded-full md:inline-flex"
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
      </div>

      {/* Department rail — only in the md–lg gap: below md the tab bar
          owns navigation, at lg the inline DepartmentNav takes over. */}
      <nav
        className="no-scrollbar hidden items-center gap-1 overflow-x-auto border-t border-border-subtle px-3 md:flex lg:hidden"
        aria-label={t('chrome.header.departments')}
      >
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`pressable relative shrink-0 px-3 py-2.5 text-body-emphasis ${
                active ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {t(`chrome.nav.${item.labelKey}`)}
              {active ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-text-primary" aria-hidden />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
    {wall}
    </>
  );
}
