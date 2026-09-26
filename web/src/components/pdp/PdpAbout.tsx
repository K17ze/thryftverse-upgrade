'use client';

/**
 * PdpAbout — "About this item", the eBay item-specifics beat. A quiet
 * two-column definition list built only from real Listing contract fields
 * (buyers scan specifics before description prose), followed by the
 * seller's own description. Seller-declared attributes the contract
 * doesn't declare yet (colour, material, style…) are read dynamically off
 * the payload so live responses surface automatically; absent keys render
 * nothing — the ledger never fabricates.
 */

import type { Listing } from '@/lib/contracts/domain';
import { CATEGORIES } from '@/lib/data/fixtures';

interface PdpAboutProps {
  listing: Listing;
}

export function PdpAbout({ listing }: PdpAboutProps) {
  const record = listing as unknown as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  const categoryName =
    CATEGORIES.find((c) => c.slug === listing.category)?.name ?? listing.category;

  const specs = [
    { label: 'Brand', value: listing.brand },
    { label: 'Size', value: listing.size ?? 'One size' },
    { label: 'Condition', value: listing.condition },
    { label: 'Category', value: categoryName },
    { label: 'Type', value: listing.subcategory ?? null },
    { label: 'Colour', value: pick('colour') ?? pick('color') },
    { label: 'Material', value: pick('material') ?? pick('materialComposition') },
    { label: 'Style', value: pick('style') },
    { label: 'Measurements', value: pick('measurements') },
    { label: 'Declared flaws', value: pick('flaws') },
    { label: 'Model', value: pick('model') },
    { label: 'Year', value: pick('year') },
  ].filter((s) => !!s.value);

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-about">
      <h2 id="pdp-about" className="text-section-title font-semibold text-text-primary">
        About this item
      </h2>

      {/* Specifics — two-column ledger, hairline rows, label quieter than
          value so the eye lands on what the item is. */}
      <dl className="mt-4 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {specs.map((s) => (
          <div
            key={s.label}
            className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5"
          >
            <dt className="text-caption text-text-muted">{s.label}</dt>
            <dd className="text-right text-body font-medium capitalize text-text-primary">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* The seller's own words, line breaks preserved. */}
      {listing.description ? (
        <p className="mt-5 whitespace-pre-line text-pretty text-body leading-relaxed text-text-primary">
          {listing.description}
        </p>
      ) : null}
    </section>
  );
}
