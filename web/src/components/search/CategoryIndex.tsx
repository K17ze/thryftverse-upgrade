'use client';

/**
 * CategoryIndex — expandable category → subcategory list for /categories.
 * One open row at a time; categories without children link straight
 * through to their landing page. Counts are fixture-truth (live items
 * per category / subcategory).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { CATEGORIES, LISTINGS } from '@/lib/data/fixtures';
import { subcategoriesFor, subcategoryCount } from './taxonomy';

const ITEM_COUNTS = (() => {
  const counts = new Map<string, number>();
  for (const l of LISTINGS) {
    counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  }
  return counts;
})();

export function CategoryIndex() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border-subtle border-y border-border-subtle">
      {CATEGORIES.map((cat) => {
        const subs = subcategoriesFor(cat.slug);
        const count = ITEM_COUNTS.get(cat.slug) ?? 0;
        const open = openSlug === cat.slug;

        if (subs.length === 0) {
          // Leaf category — the row is the link.
          return (
            <li key={cat.slug}>
              <Link
                href={`/category/${cat.slug}`}
                className="pressable flex h-14 items-center justify-between px-1 hover:bg-row-pressed"
              >
                <span className="text-body-emphasis font-medium text-text-primary">
                  {cat.name}
                </span>
                <span className="flex items-center gap-2 text-text-muted">
                  {count > 0 ? (
                    <span className="tnum text-caption">{count}</span>
                  ) : null}
                  <Icon name="forward" size={16} />
                </span>
              </Link>
            </li>
          );
        }

        return (
          <li key={cat.slug}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenSlug(open ? null : cat.slug)}
              className="pressable flex h-14 w-full items-center justify-between px-1 text-left hover:bg-row-pressed"
            >
              <span className="text-body-emphasis font-medium text-text-primary">
                {cat.name}
              </span>
              <span className="flex items-center gap-2 text-text-muted">
                <span className="text-caption">
                  {subs.length} subcategories
                </span>
                <Icon
                  name="chevronDown"
                  size={16}
                  className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
              </span>
            </button>

            {open ? (
              <ul className="border-t border-border-subtle pb-1">
                <li>
                  <Link
                    href={`/category/${cat.slug}`}
                    className="pressable flex h-11 items-center justify-between px-1 pl-4 text-body font-semibold text-text-primary hover:bg-row-pressed"
                  >
                    All {cat.name}
                    <Icon
                      name="forward"
                      size={14}
                      className="text-text-muted"
                    />
                  </Link>
                </li>
                {subs.map((s) => {
                  const subCount = subcategoryCount(cat.slug, s);
                  return (
                    <li key={s}>
                      <Link
                        href={`/category/${cat.slug}?sub=${encodeURIComponent(s)}`}
                        className="pressable flex h-11 items-center justify-between px-1 pl-4 text-body text-text-secondary hover:bg-row-pressed hover:text-text-primary"
                      >
                        {s}
                        <span className="flex items-center gap-2 text-text-muted">
                          {subCount > 0 ? (
                            <span className="tnum text-caption">
                              {subCount}
                            </span>
                          ) : null}
                          <Icon
                            name="forward"
                            size={14}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
