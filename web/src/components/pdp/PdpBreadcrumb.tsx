'use client';

/**
 * PdpBreadcrumb — category trail from the real taxonomy: Home →
 * {Category} → {Subcategory}. Category links to /category/[slug]; the
 * subcategory deep-links to the category page's ?sub= filter only when
 * the browse taxonomy actually carries it — a chip that would silently
 * widen to the whole category renders as plain text instead.
 * Desktop only: on mobile the back control serves navigation and the
 * facts row already carries the category.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { CATEGORIES } from '@/lib/data/fixtures';
import { Icon } from '@/components/ui/Icon';
import { subcategoriesFor } from '@/components/search/taxonomy';

interface PdpBreadcrumbProps {
  listing: Listing;
}

export function PdpBreadcrumb({ listing }: PdpBreadcrumbProps) {
  const category = CATEGORIES.find((c) => c.slug === listing.category);
  if (!category) return null;

  const sub = listing.subcategory ?? null;
  const subLinked = !!sub && subcategoriesFor(category.slug).includes(sub);

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden px-4 pt-4 sm:px-6 lg:block"
    >
      <ol className="flex items-center gap-1.5 text-caption text-text-muted">
        <li>
          <Link
            href="/"
            className="pressable rounded-sm hover:text-text-primary"
          >
            Home
          </Link>
        </li>
        <li aria-hidden>
          <Icon name="forward" size={11} className="text-border" />
        </li>
        <li>
          <Link
            href={`/category/${category.slug}`}
            className="pressable rounded-sm hover:text-text-primary"
          >
            {category.name}
          </Link>
        </li>
        {sub ? (
          <>
            <li aria-hidden>
              <Icon name="forward" size={11} className="text-border" />
            </li>
            <li>
              {subLinked ? (
                <Link
                  href={`/category/${category.slug}?sub=${encodeURIComponent(sub)}`}
                  className="pressable rounded-sm hover:text-text-primary"
                >
                  {sub}
                </Link>
              ) : (
                <span>{sub}</span>
              )}
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
