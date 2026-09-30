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
import { Icon } from '@/components/ui/Icon';
import { useCategoryDirectory } from '@/components/search/useCategoryDirectory';

interface PdpBreadcrumbProps {
  listing: Listing;
}

export function PdpBreadcrumb({ listing }: PdpBreadcrumbProps) {
  const { categories } = useCategoryDirectory();
  // Live rows store the node id OR the display name — either spelling
  // resolves. Older writes may carry a LEAF node id (the subcategory was
  // stored as the category), so fall back to a parent-chain lookup:
  // find the department whose children contain the value.
  const direct =
    categories.find(
      (c) =>
        c.slug === listing.category ||
        c.name.toLowerCase() === listing.category.toLowerCase(),
    ) ?? null;
  const leafMatch = direct
    ? null
    : categories
        .flatMap((c) => c.subcategories.map((s) => ({ parent: c, sub: s })))
        .find(
          (m) =>
            m.sub.id.toLowerCase() === listing.category.toLowerCase() ||
            m.sub.name.toLowerCase() === listing.category.toLowerCase(),
        ) ?? null;
  const category = direct ?? leafMatch?.parent;
  if (!category) return null;

  // A leaf-stored category already names the sub level — render its
  // matched child as the sub crumb even when subcategory is empty.
  const sub = listing.subcategory ?? leafMatch?.sub.id ?? null;
  const subNode = sub
    ? category.subcategories.find(
        (s) =>
          s.id.toLowerCase() === sub.toLowerCase() ||
          s.name.toLowerCase() === sub.toLowerCase(),
      )
    : undefined;

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
              {subNode ? (
                <Link
                  href={`/category/${category.slug}?sub=${encodeURIComponent(subNode.id)}`}
                  className="pressable rounded-sm hover:text-text-primary"
                >
                  {subNode.name}
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
