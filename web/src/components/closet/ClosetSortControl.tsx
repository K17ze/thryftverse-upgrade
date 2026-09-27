'use client';

/**
 * ClosetSortControl — compact sort trigger + option sheet. Same grammar as
 * filters/SortMenu, scoped to the closet's order set (mobile ClosetSortMenu
 * port: Newest / Price ↑ / Price ↓ / Most liked).
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { CLOSET_SORT_OPTIONS, type ClosetSortKey } from './closetFilters';

interface ClosetSortControlProps {
  value: ClosetSortKey;
  onChange: (key: ClosetSortKey) => void;
}

export function ClosetSortControl({ value, onChange }: ClosetSortControlProps) {
  const [open, setOpen] = useState(false);
  const current =
    CLOSET_SORT_OPTIONS.find((o) => o.value === value) ?? CLOSET_SORT_OPTIONS[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Sort closet, currently ${current.label}`}
        className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-surface-alt px-3.5 text-caption font-semibold text-text-primary hover:bg-surface-raised"
      >
        <Icon name="sort" size={16} />
        {current.label}
        <Icon name="chevronDown" size={14} className="text-text-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Sort by" maxWidth={400}>
        <ul className="py-2">
          {CLOSET_SORT_OPTIONS.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="pressable flex h-12 w-full items-center justify-between px-5 text-left hover:bg-surface-alt"
                >
                  <span
                    className={`text-body-emphasis ${
                      active
                        ? 'font-semibold text-text-primary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {o.label}
                  </span>
                  {active ? (
                    <Icon name="check" size={18} className="text-brand" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
