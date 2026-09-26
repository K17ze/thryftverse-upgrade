'use client';

/**
 * SortDropdown — the results sort control. A real dropdown (trigger +
 * anchored listbox), not a chip row: current choice on the trigger, one
 * checked option in the menu, keyboard-navigable, closes on outside
 * press / Escape / selection. One sort grammar across search, category
 * and browse.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SORT_OPTIONS, type SortKey } from '@/components/filters/filterTypes';

interface SortDropdownProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

/** Product language for the default order — eBay's "Best match". */
const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
};

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = SORT_OPTIONS.map((o) => ({
    ...o,
    label: SORT_LABELS[o.value],
  }));
  const current = options.find((o) => o.value === value) ?? options[0];

  // Dismiss on outside press or Escape — the two exits a dropdown owns.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const commit = (key: SortKey) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setActive(options.findIndex((o) => o.value === value));
          setOpen((v) => !v);
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
          className="absolute right-0 top-[calc(100%+4px)] z-dropdown min-w-[208px] rounded-lg border border-border-subtle bg-surface-elevated py-1 shadow-floating"
        >
          {options.map((o, i) => {
            return (
              <li key={o.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => commit(o.value)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex h-10 w-full items-center justify-between px-3.5 text-left ${
                    active === i ? 'bg-surface-alt' : ''
                  }`}
                >
                  <span
                    className={`text-body ${
                      o.value === value
                        ? 'font-semibold text-text-primary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {o.label}
                  </span>
                  {o.value === value ? (
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
