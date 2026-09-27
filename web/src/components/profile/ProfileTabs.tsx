'use client';

/**
 * ProfileTabs — sticky underline tab rail (Items | Sold | Reviews | …).
 * One hairline base, 2px brand underline on the active tab, quiet tnum
 * counts, horizontal scroll on mobile. Tabs either toggle local state
 * (onChange → real <button> tabs, no history/hash pollution) or navigate
 * (href → route links) — one grammar for both.
 */

import Link from 'next/link';
import { useRef } from 'react';

interface ProfileTab<T extends string> {
  key: T;
  label: string;
  count?: number;
  /** When set, the tab is a route link instead of a state toggle. */
  href?: string;
}

interface ProfileTabsProps<T extends string> {
  tabs: ProfileTab<T>[];
  active: T;
  onChange?: (tab: T) => void;
  /** Accessible label for the tablist/nav landmark. */
  ariaLabel?: string;
}

export function ProfileTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel = 'Sections',
}: ProfileTabsProps<T>) {
  const linkMode = tabs.length > 0 && tabs.every((t) => typeof t.href === 'string');
  const railClass = 'no-scrollbar flex gap-1 overflow-x-auto px-1 sm:px-3';
  const railRef = useRef<HTMLDivElement | null>(null);

  // Roving-tabindex tablist: arrows move selection AND focus (automatic
  // activation), Home/End jump to the edges. State tabs are buttons —
  // no hash nav, no history entries.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (linkMode || tabs.length === 0) return;
    let next = -1;
    const current = tabs.findIndex((t) => t.key === active);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (current + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (current - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange?.(tab.key);
    railRef.current
      ?.querySelectorAll<HTMLElement>('[role="tab"]')
      [next]?.focus();
  };

  const items = tabs.map((t) => {
    const isActive = t.key === active;
    const cls = `pressable relative flex items-baseline gap-1.5 whitespace-nowrap px-3 py-3.5 text-body-emphasis ${
      isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
    }`;
    const inner = (
      <>
        {t.label}
        {typeof t.count === 'number' ? (
          <span className="tnum text-meta font-medium text-text-muted">{t.count}</span>
        ) : null}
        {isActive ? (
          <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden />
        ) : null}
      </>
    );
    return t.href ? (
      <Link
        key={t.key}
        href={t.href}
        aria-current={isActive ? 'page' : undefined}
        className={cls}
      >
        {inner}
      </Link>
    ) : (
      <button
        key={t.key}
        type="button"
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        onClick={() => onChange?.(t.key)}
        className={cls}
      >
        {inner}
      </button>
    );
  });

  return (
    <div className="sticky top-16 z-elevated border-b border-border-subtle bg-background/95 backdrop-blur-sm">
      {linkMode ? (
        <nav aria-label={ariaLabel} className={railClass}>
          {items}
        </nav>
      ) : (
        <div
          role="tablist"
          aria-label={ariaLabel}
          className={railClass}
          onKeyDown={onKeyDown}
          ref={railRef}
        >
          {items}
        </div>
      )}
    </div>
  );
}
