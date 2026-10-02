'use client';

/**
 * SortDropdown — the results sort control. A real dropdown (trigger +
 * anchored listbox), not a chip row: current choice on the trigger, one
 * checked option in the menu, full keyboard support (ArrowUp/Down/Home/
 * End to move, Enter to commit, Tab/Escape/outside-press to dismiss),
 * focus returns to the trigger on close. One sort grammar across
 * search, category and browse.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  getContextualSortOptions,
  type SortKey,
} from '@/components/filters/filterTypes';

interface SortDropdownProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

/** Product language for each sort — native casing (filterTypes.ts). */
const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  'most-liked': 'Most liked',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
  'discount-desc': 'Biggest discount',
  'ending-soon': 'Ending soon',
};

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // "Best match" is only honest while a real query drives scoring —
  // /search's `q` produces per-listing match scores; on browse/category
  // (and on a bare /search) the same 'relevance' key silently falls back
  // to the engagement order, which native labels "Most liked" for exactly
  // this reason (CategoryDetailScreen ~282). The duplicate 'most-liked'
  // row collapses into it — one label, one truth.
  const pathname = usePathname();
  const params = useSearchParams();
  const hasQuery = pathname === '/search' && (params.get('q') ?? '').trim() !== '';

  // Auction sort context (native isAuctionSortContext): the /category/<slug>
  // segment, the ?category/?sub params, or the query itself may carry an
  // auction scope. Only then does "Ending soon" join the option list.
  const slugSegment = pathname.startsWith('/category/')
    ? pathname.slice('/category/'.length).split('/')[0]
    : '';
  const categoryContext = [slugSegment, params.get('category') ?? '', params.get('sub') ?? '']
    .filter(Boolean)
    .join(' ');
  const sortOptions = getContextualSortOptions(
    categoryContext,
    params.get('q') ?? undefined,
  );

  const options = sortOptions.filter((o) => hasQuery || o.value !== 'most-liked').map(
    (o) => ({
      ...o,
      label:
        o.value === 'relevance' && !hasQuery ? 'Most liked' : SORT_LABELS[o.value],
    }),
  );
  const current =
    options.find((o) => o.value === value) ??
    options.find((o) => o.value === 'relevance') ??
    options[0];

  // On open, focus the selected option — keyboard users land on it
  // directly; pointer users lose nothing (focus ring is keyboard-only).
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
    // active is set before open in every path — refocus belongs to open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Dismiss on outside press or Escape — the two exits a dropdown owns.
  // Escape also returns focus to the trigger (menu closed under it).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const move = (next: number) => {
    const i = Math.max(0, Math.min(options.length - 1, next));
    setActive(i);
    itemRefs.current[i]?.focus();
  };

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const commit = (key: SortKey) => {
    onChange(key);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) openMenu();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort results, currently ${current.label}`}
        className="pressable inline-flex h-9 items-center gap-1.5 rounded-md bg-surface-alt px-3.5 text-caption font-semibold text-text-primary hover:bg-surface-raised"
      >
        <Icon name="sort" size={16} />
        <span className="hidden sm:inline">{current.label}</span>
        <span className="sm:hidden">Sort</span>
        <Icon
          name="chevronDown"
          size={14}
          className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Sort results"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              move(active + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              move(active - 1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              move(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              move(options.length - 1);
            } else if (e.key === 'Tab') {
              // Menus don't trap — let focus leave and close behind it.
              setOpen(false);
            }
          }}
          className="absolute right-0 top-[calc(100%+4px)] z-dropdown min-w-[208px] rounded-lg border border-border-subtle bg-surface-elevated py-1 shadow-floating"
        >
          {options.map((o, i) => {
            // Without a query the 'most-liked' row is folded into the
            // 'relevance' row — mark it selected for either stored value
            // (native: Recommended checks the "Most liked" row).
            const selected =
              o.value === value ||
              (!hasQuery && o.value === 'relevance' && value === 'most-liked');
            return (
              <li key={o.value} role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => commit(o.value)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className={`flex h-10 w-full items-center justify-between px-3.5 text-left ${
                    active === i ? 'bg-surface-alt' : ''
                  }`}
                >
                  <span
                    className={`text-body ${
                      selected
                        ? 'font-semibold text-text-primary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {o.label}
                  </span>
                  {selected ? (
                    <Icon name="check" size={16} className="text-brand" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
