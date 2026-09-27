'use client';

/**
 * BoardSortControl — sort trigger + option sheet for board grids
 * (Custom / Newest / A–Z). Same grammar as ClosetSortControl, scoped to
 * the Pinterest board-order set. The choice persists via boardPrefs.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { BOARD_SORT_OPTIONS, useBoardPrefs } from './boardPrefs';

export function BoardSortControl() {
  const [open, setOpen] = useState(false);
  const value = useBoardPrefs((s) => s.sort);
  const setSort = useBoardPrefs((s) => s.setSort);
  const current =
    BOARD_SORT_OPTIONS.find((o) => o.value === value) ?? BOARD_SORT_OPTIONS[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Sort boards, currently ${current.label}`}
        className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-surface-alt px-3.5 text-caption font-semibold text-text-primary hover:bg-surface-raised"
      >
        <Icon name="sort" size={16} />
        {current.label}
        <Icon name="chevronDown" size={14} className="text-text-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Sort boards" maxWidth={400}>
        <ul className="py-2">
          {BOARD_SORT_OPTIONS.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSort(o.value);
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
