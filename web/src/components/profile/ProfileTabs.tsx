'use client';

/**
 * ProfileTabs — sticky underline tab rail (Items | Sold | Reviews | …).
 * One hairline base, 2px brand underline on the active tab, quiet tnum
 * counts, horizontal scroll on mobile. Tabs either toggle local state
 * (onChange) or navigate (href) — one grammar for both.
 */

import Link from 'next/link';

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
}

export function ProfileTabs<T extends string>({ tabs, active, onChange }: ProfileTabsProps<T>) {
  const linkMode = tabs.length > 0 && tabs.every((t) => typeof t.href === 'string');
  const railClass = 'no-scrollbar flex gap-1 overflow-x-auto px-1 sm:px-3';

  const items = tabs.map((t) => {
    const isActive = t.key === active;
    const cls = `pressable relative flex items-baseline gap-1.5 whitespace-nowrap px-3 py-3.5 text-body-emphasis ${
      isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
    }`;
    return (
      <Link
        key={t.key}
        href={t.href ?? '#'}
        aria-current={t.href && isActive ? 'page' : undefined}
        role={t.href ? undefined : 'tab'}
        aria-selected={t.href ? undefined : isActive}
        onClick={t.href ? undefined : () => onChange?.(t.key)}
        className={cls}
      >
        {t.label}
        {typeof t.count === 'number' ? (
          <span className="tnum text-meta font-medium text-text-muted">{t.count}</span>
        ) : null}
        {isActive ? (
          <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden />
        ) : null}
      </Link>
    );
  });

  return (
    <div className="sticky top-16 z-elevated border-b border-border-subtle bg-background/95 backdrop-blur-sm">
      {linkMode ? (
        <nav aria-label="Lists" className={railClass}>
          {items}
        </nav>
      ) : (
        <div role="tablist" className={railClass}>
          {items}
        </div>
      )}
    </div>
  );
}
