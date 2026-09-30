'use client';

/**
 * PdpAbout — "About this item", the eBay item-specifics beat. The section
 * leads with the condition evidence (grade + plain-English definition +
 * a media jump — ported from the mobile ItemDetailItemDetails honesty
 * block), then the seller's own description behind progressive
 * disclosure, then the two-column specifics ledger built only from real
 * Listing contract fields. Seller-declared attributes the contract
 * doesn't declare yet (colour, material, style…) are read dynamically
 * off the payload so live responses surface automatically; absent keys
 * render nothing — the ledger never fabricates. A size-guide link opens
 * the reference sheet when the category is size-relevant, and the row
 * ends with the honest listed date.
 */

import { useEffect, useRef, useState } from 'react';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { categoryLabel } from '@/components/search/categoryDirectoryStore';
import { formatDate } from '@/lib/utils/format';
import { SizeGuideSheet, resolveSizeGuide } from './SizeGuideSheet';

interface PdpAboutProps {
  listing: Listing;
}

/**
 * Condition accent + plain-English definition — mirrors the mobile
 * itemDetailDerived conditionMeta map. 'New without tags' carries the
 * literal meaning of the grade; the definition stays absent only when the
 * grade itself is unmapped.
 */
const CONDITION_META: Partial<
  Record<ListingCondition, { dot: string; definition: string }>
> = {
  'New with tags': {
    dot: 'text-success-text',
    definition: 'Unworn, with original tags and packaging intact.',
  },
  'New without tags': {
    dot: 'text-success-text',
    definition: 'Unworn — original tags removed.',
  },
  'Very good': {
    dot: 'text-commerce-trust',
    definition: 'No visible flaws; minimal signs of wear.',
  },
  Good: {
    dot: 'text-warning-text',
    definition: 'Light wear consistent with gentle use; no major flaws.',
  },
  Satisfactory: {
    dot: 'text-antique-gold',
    definition: 'Visible wear or minor flaws; fully wearable.',
  },
};

export function PdpAbout({ listing }: PdpAboutProps) {
  const record = listing as unknown as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  const categoryName = categoryLabel(listing.category);

  const conditionMeta = CONDITION_META[listing.condition];
  const sizeGuide = resolveSizeGuide(listing);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  // Measure real rendered overflow once the clamped paragraph lays out —
  // a short description never earns a Read more affordance.
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [listing.description]);

  const scrollToGallery = () =>
    document
      .getElementById('pdp-gallery')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Condition is deliberately absent from the ledger — the evidence block
  // directly above already renders the grade with its definition, so a
  // spec row repeating it is duplication, not signal (mobile omits it
  // from the evidence groups for the same reason).
  const specs = [
    { label: 'Brand', value: listing.brand },
    { label: 'Size', value: listing.size ?? 'One size' },
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

      {/* Condition evidence — grade + what the grade means inline; the
          buyer shouldn't have to open a sheet to learn what "Good"
          means. The photos jump stays generic (no photo is tagged as
          condition evidence) and lands back on the media stage. */}
      <div className="mt-4">
        <p className="flex items-center gap-2 text-body-emphasis font-semibold text-text-primary">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full bg-current ${conditionMeta?.dot ?? 'text-text-muted'}`}
          />
          {listing.condition}
        </p>
        {conditionMeta ? (
          <p className="mt-1 text-caption leading-relaxed text-text-secondary">
            {conditionMeta.definition}
          </p>
        ) : null}
        {listing.images.filter(Boolean).length > 1 ? (
          <button
            type="button"
            onClick={scrollToGallery}
            className="pressable -ml-1 mt-1 inline-flex items-center gap-1.5 rounded-md px-1 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            <Icon name="images" size={14} className="shrink-0" />
            View all photos
          </button>
        ) : null}
      </div>

      {/* The seller's own words, line breaks preserved — collapses to four
          lines behind an explicit toggle once the text truly overflows. */}
      {listing.description ? (
        <div className="mt-4">
          <p
            ref={descRef}
            className={`whitespace-pre-line text-pretty text-body leading-relaxed text-text-primary ${
              expanded ? '' : 'line-clamp-4'
            }`}
          >
            {listing.description}
          </p>
          {overflows ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="pressable -ml-1 mt-1 inline-flex items-center gap-1 rounded-md px-1 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              {expanded ? 'Show less' : 'Read more'}
              <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
            </button>
          ) : null}
        </div>
      ) : null}

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

      {/* Size guide — the same reference sheet the buy panel opens,
          repeated where the size row lives (Vinted's below-fold path). */}
      {sizeGuide ? (
        <button
          type="button"
          onClick={() => setSizeGuideOpen(true)}
          className="pressable -ml-1 mt-2 inline-flex items-center gap-1.5 rounded-md px-1 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          <Icon name="scan" size={14} className="shrink-0" />
          Size guide
        </button>
      ) : null}

      {/* Listed date — the honest posting stamp mobile closes the
          section with. */}
      {listing.createdAt ? (
        <p className="tnum mt-4 text-meta text-text-muted">
          Listed {formatDate(listing.createdAt)}
        </p>
      ) : null}

      <SizeGuideSheet
        open={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        guide={sizeGuide}
        currentSize={listing.size}
      />
    </section>
  );
}
