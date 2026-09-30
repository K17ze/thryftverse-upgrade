'use client';

/**
 * CommandPalette — ⌘K / Ctrl+K (and `/`) quick navigation.
 *
 * Desktop grammar (Linear/Vercel): a filtered action list driven entirely
 * by the keyboard — ArrowUp/Down move, Enter commits, Esc closes (via
 * Sheet). Actions are honest: every row is a real destination or a real
 * search submission; nothing here fabricates state. Recent searches come
 * from the same persisted bucket the header search writes.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/ui/Sheet';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useLocale } from '@/lib/i18n';
import { useRecentSearches } from '@/components/search/searchHistory';

interface PaletteItem {
  id: string;
  label: string;
  /** Right-aligned context — a section name or "Search". */
  hint?: string;
  icon: AppIconName;
  href: string;
  /** Search submissions also persist into the recent-searches bucket. */
  record?: boolean;
}

/** Focus returns to the dialog shell on open (Sheet behaviour) — the
 *  input steals it back a frame later so typing works immediately. */
function focusInput(ref: React.RefObject<HTMLInputElement | null>) {
  requestAnimationFrame(() => ref.current?.focus());
}

export function CommandPalette() {
  const router = useRouter();
  const { t } = useLocale();
  const { recent, add: addRecent } = useRecentSearches();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  // Global shortcut — ⌘K/Ctrl+K toggles anywhere; `/` opens unless the
  // keystroke is headed for an editable field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
        // Don't stack over an open modal (share sheet, filters…) — the
        // keystroke belongs to that dialog's context.
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    focusInput(inputRef);
  }, [open]);

  const destinations = useMemo<PaletteItem[]>(
    () => [
      { id: 'home', label: t('chrome.nav.home'), icon: 'home', href: '/' },
      { id: 'explore', label: t('chrome.nav.explore'), icon: 'compass', href: '/explore' },
      { id: 'search', label: t('common.navigation.search'), icon: 'search', href: '/search' },
      { id: 'live', label: t('chrome.nav.live'), icon: 'videocam', href: '/live' },
      { id: 'auctions', label: t('chrome.nav.auctions'), icon: 'auction', href: '/auctions' },
      { id: 'coown', label: t('chrome.nav.coown'), icon: 'layers', href: '/co-own' },
      { id: 'bag', label: t('chrome.header.bag'), icon: 'bag', href: '/bag' },
      { id: 'sell', label: t('chrome.header.sellNow'), icon: 'tag', href: '/sell' },
      { id: 'saved', label: t('chrome.account.saved'), icon: 'heart', href: '/saved' },
      { id: 'orders', label: t('chrome.links.orders'), icon: 'receipt', href: '/orders' },
      { id: 'offers', label: t('chrome.account.offers'), icon: 'pricetag', href: '/offers' },
      { id: 'inbox', label: t('chrome.tabs.inbox'), icon: 'inbox', href: '/inbox' },
      { id: 'wallet', label: t('chrome.links.wallet'), icon: 'wallet', href: '/wallet' },
      { id: 'sellerHub', label: t('chrome.links.sellerHub'), icon: 'store', href: '/seller-hub' },
      { id: 'outfits', label: t('chrome.links.outfits'), icon: 'layers', href: '/outfits' },
      { id: 'profile', label: t('chrome.tabs.profile'), icon: 'profile', href: '/profile' },
      { id: 'invite', label: t('chrome.links.inviteEarn'), icon: 'people', href: '/invite' },
      { id: 'settings', label: t('chrome.links.settings'), icon: 'settings', href: '/settings' },
      { id: 'support', label: t('chrome.links.support'), icon: 'help', href: '/support' },
    ],
    [t],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [
        ...recent.slice(0, 5).map((term, i) => ({
          id: `recent-${i}`,
          label: term,
          hint: t('chrome.search.recent'),
          icon: 'clock' as AppIconName,
          href: `/search?q=${encodeURIComponent(term)}`,
          record: true,
        })),
        ...destinations,
      ];
    }
    return [
      {
        id: 'search-term',
        label: `${t('common.navigation.search')} “${query.trim()}”`,
        icon: 'search',
        href: `/search?q=${encodeURIComponent(query.trim())}`,
        record: true,
      },
      ...destinations.filter((d) => d.label.toLowerCase().includes(q)),
    ];
  }, [query, recent, destinations, t]);

  useEffect(() => setActive(0), [items.length]);

  const commit = (item: PaletteItem) => {
    if (item.record) {
      const term = decodeURIComponent(item.href.split('q=')[1] ?? '');
      if (term) addRecent(term);
    }
    setOpen(false);
    router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) commit(item);
    }
  };

  // Keep the active row inside the scroll viewport.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-palette-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} ariaLabel={t('common.navigation.search')} maxWidth={560}>
      <div className="border-b border-border-subtle px-4 py-3">
        <label className="flex items-center gap-3">
          <Icon name="search" size={18} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t('chrome.header.searchPlaceholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted sm:block">
            esc
          </kbd>
        </label>
      </div>
      <ul id={listId} role="listbox" ref={listRef} aria-label={t('common.navigation.search')} className="max-h-[50dvh] overflow-y-auto py-1.5">
        {items.map((item, i) => (
          <li key={item.id} role="option" id={`${listId}-${item.id}`} aria-selected={i === active} data-palette-index={i}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => commit(item)}
              onMouseMove={() => setActive(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-body ${
                i === active ? 'bg-surface-muted text-text-primary' : 'text-text-secondary'
              }`}
            >
              <Icon name={item.icon} size={17} className="shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint ? <span className="shrink-0 text-caption text-text-muted">{item.hint}</span> : null}
            </button>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-body text-text-muted">{t('stateCopy.listings.emptyFiltered')}</li>
        ) : null}
      </ul>
    </Sheet>
  );
}
