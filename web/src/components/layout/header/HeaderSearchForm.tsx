'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  SearchSuggestions,
  useSuggestionOptions,
  suggestionOptionId,
  type SuggestionOption,
} from '../SearchSuggestions';
import { aiFeatureOn, useAIPrefs } from '@/lib/store/aiPrefs';
import { useRecentSearches } from '@/components/search/searchHistory';
import {
  RotatingSearchHint,
  useRotatingSearchHint,
} from '@/components/search/RotatingSearchHint';
import { useLocale } from '@/lib/i18n';
import { isFocusRestore, restoreFocus } from '@/lib/a11y/focus';

const SEARCH_LISTBOX_ID = 'header-search-listbox';

export function HeaderSearchForm() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();

  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { recent, add: addRecent, remove: removeRecent } = useRecentSearches();

  // Idle-empty hint rotation — recent/saved searches and departments cycle
  // through the field while it rests (visual only; the aria-label stays the
  // canonical placeholder). Off while focused, typing, panel open, under
  // reduced motion, or before hydration.
  const searchPlaceholder = t('chrome.header.searchPlaceholder');
  const hint = useRotatingSearchHint({
    base: searchPlaceholder,
    idle: q === '' && !searchFocused && !searchOpen,
    containerRef: searchBoxRef,
  });

  // Device AI preference (/settings/recommendations) — off keeps the
  // field a plain search box: no suggestion layer, no autocomplete reads.
  const autocompleteOn = useAIPrefs((s) =>
    aiFeatureOn(s, 'searchAutocomplete'),
  );
  const suggestions = useSuggestionOptions(q, recent, autocompleteOn);
  const suggestionsVisible = searchOpen && autocompleteOn;

  const closeSuggestions = () => {
    setSearchOpen(false);
    setActiveOption(-1);
  };

  const selectTerm = (term: string) => {
    const trimmed = term.trim();
    if (trimmed) {
      addRecent(trimmed);
      setQ(trimmed);
    }
    closeSuggestions();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
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

  // Option lists can shrink without a keystroke (live-mode queries
  // resolve after the debounce; a recent-term removal drops a row) —
  // clamp the highlight so Enter never commits a stale index.
  useEffect(() => {
    setActiveOption((i) => Math.min(i, suggestions.length - 1));
  }, [suggestions.length]);

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
    // Suggestion layer disabled — let every key keep its native field
    // behaviour; Enter still submits the form as usual.
    if (!autocompleteOn) return;
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
    } else if (e.key === 'Home' || e.key === 'End') {
      // ⌘K parity — jump the highlight to the edges while the panel is
      // open; closed, Home/End keep their native caret behaviour.
      if (searchOpen && suggestions.length) {
        e.preventDefault();
        setActiveOption(e.key === 'Home' ? 0 : suggestions.length - 1);
      }
    }
  };

  return (
    <form onSubmit={submit} role="search" className="mx-auto hidden w-full min-w-0 max-w-xl flex-1 md:block">
      <div
        ref={searchBoxRef}
        className="relative"
        onKeyDown={(e) => {
          // Esc dismisses from anywhere inside the box — the field
          // itself or the pinned visual-search row — and returns
          // focus to the field (APG combobox close).
          if (e.key === 'Escape' && suggestionsVisible) {
            e.preventDefault();
            e.stopPropagation();
            closeSuggestions();
            // restoreFocus so the refocus doesn't re-open the layer
            // via the input's own onFocus.
            restoreFocus(searchInputRef.current);
          }
        }}
      >
        <label className="relative block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSearchOpen(true);
              setActiveOption(-1);
            }}
            onFocus={() => {
              setSearchFocused(true);
              // A focus restore (overlay Esc handing focus back, or
              // the combobox's own collapse) is not the user
              // re-entering the field — the layer must stay closed.
              if (isFocusRestore()) return;
              setSearchOpen(true);
            }}
            onBlur={(e) => {
              setSearchFocused(false);
              if (!searchBoxRef.current?.contains(e.relatedTarget as Node)) {
                closeSuggestions();
              }
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={hint.active ? '' : searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded={suggestionsVisible}
            aria-controls={SEARCH_LISTBOX_ID}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              suggestionsVisible && activeOption >= 0
                ? suggestionOptionId(SEARCH_LISTBOX_ID, activeOption)
                : undefined
            }
            autoComplete="off"
            className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-10 pr-12 text-body text-input-text placeholder:text-text-muted focus:border-border focus:bg-surface-raised focus:outline-none"
          />
          {/* Rotating idle hint — aligned to the input's text start
              (pl-10), clipped before the ⌘K affordance (pr-12). */}
          {hint.active ? (
            <RotatingSearchHint
              text={hint.text}
              className="left-10 right-12 text-body text-text-muted"
            />
          ) : null}
          {/* ⌘K affordance — the shortcut lives in CommandPalette;
              this is the discoverable hint, not a separate trigger. */}
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-micro text-text-muted"
          >
            ⌘K
          </kbd>
        </label>
        {suggestionsVisible ? (
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
  );
}
