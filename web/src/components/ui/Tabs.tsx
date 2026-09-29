'use client';

/**
 * Tabs — the app's one page-level section-navigation grammar: quiet text
 * labels on a hairline baseline, active state = primary text + a 2px
 * underline indicator overlapping the hairline (stroke grammar: hairline
 * separates, 2px selects). Pills/chips are for filters inside a results
 * toolbar, not section nav — this component is the tab counterpart.
 *
 * Two modes, one grammar:
 *   - state tabs (onChange) → role="tablist"/role="tab", roving tabindex,
 *     arrows + Home/End move selection AND focus (automatic activation,
 *     WAI-APG), no history/hash pollution;
 *   - route tabs (every tab carries href) → <nav> + <Link> with
 *     aria-current="page" — links, not ARIA tabs.
 *
 * Counts are honest: only rendered when the caller passes a real number
 * greater than zero (quiet tabular meta, never a fabricated badge).
 * The rail scrolls horizontally when the set overflows — mobile parity
 * with ProfileTabs/OrdersTabRail.
 */

import Link from 'next/link';
import { useRef } from 'react';

export interface TabItem<T extends string> {
  key: T;
  label: string;
  /** Real count for this section — shown as quiet meta when > 0. */
  count?: number;
  /** When set on every tab, the rail is route navigation (<nav>/<Link>). */
  href?: string;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange?: (tab: T) => void;
  /** Accessible label for the tablist/nav landmark. */
  ariaLabel?: string;
  /** Extra classes on the strip (spacing, width). */
  className?: string;
  /** Extra classes on the scrolling rail (e.g. bleed padding). */
  railClassName?: string;
  /** Set false when the parent already carries the baseline hairline and
   *  the tab indicator should overlap it instead (e.g. a toolbar row). */
  hairline?: boolean;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel = 'Sections',
  className = '',
  railClassName = '',
  hairline = true,
}: TabsProps<T>) {
  const linkMode = tabs.length > 0 && tabs.every((t) => typeof t.href === 'string');
  const railRef = useRef<HTMLDivElement | null>(null);
  // When no tab matches `active` (e.g. a secondary selection owns the
  // view), the first tab keeps the rail keyboard-reachable.
  const activeIndex = Math.max(
    tabs.findIndex((t) => t.key === active),
    0,
  );

  // Roving-tabindex tablist: arrows move selection AND focus (automatic
  // activation), Home/End jump to the edges.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (linkMode || tabs.length === 0) return;
    const current = tabs.findIndex((t) => t.key === active);
    let next = -1;
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

  const items = tabs.map((t, i) => {
    const isActive = t.key === active;
    // px-3 + py-3 over a 21px line ≈ 45px hit height; the indicator
    // overlays the strip hairline (-bottom-px), inset from the padding
    // so adjacent labels never share a stroke.
    const cls = `pressable relative flex items-baseline gap-1.5 whitespace-nowrap px-3 py-3 text-body-emphasis ${
      isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
    }`;
    const inner = (
      <>
        {t.label}
        {typeof t.count === 'number' && t.count > 0 ? (
          <span className="tnum text-meta font-medium text-text-muted">{t.count}</span>
        ) : null}
        {isActive ? (
          <span
            aria-hidden
            className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-text-primary"
          />
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
        tabIndex={i === activeIndex ? 0 : -1}
        onClick={() => onChange?.(t.key)}
        className={cls}
      >
        {inner}
      </button>
    );
  });

  const railClass = `no-scrollbar flex overflow-x-auto ${railClassName}`;

  return (
    <div
      className={`${hairline ? 'border-b border-border-subtle ' : ''}${className}`}
    >
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
