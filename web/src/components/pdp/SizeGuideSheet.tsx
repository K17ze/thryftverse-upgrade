'use client';

/**
 * SizeGuideSheet — reference measurement table in a Sheet, opened from the
 * buy panel facts area. Ported from the mobile SizeGuideSheet: flat table
 * with hairline separators, tabular numerals, the listing's own size row
 * highlighted, measure tip and honesty footer. Only size-relevant
 * categories (clothing / shoes) resolve a guide — the trigger hides
 * entirely for bags, accessories and other unsized categories.
 */

import type { Listing, SizeGuide } from '@/lib/contracts/domain';
import { SIZE_GUIDES } from '@/lib/data/fixtures';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';

/** Web subcategory → guide key. Clothing and shoes only — the rest of the
 *  catalogue shows no size-guide affordance (requirement: size-relevant
 *  categories only). */
const SIZE_GUIDE_BY_SUBCATEGORY: Record<string, string> = {
  knitwear: 'tops',
  shirts: 'tops',
  't-shirts': 'tops',
  hoodies: 'tops',
  sweatshirts: 'tops',
  blazers: 'tops',
  polos: 'tops',
  jeans: 'bottoms',
  trousers: 'bottoms',
  skirts: 'bottoms',
  shorts: 'bottoms',
  leggings: 'bottoms',
  dresses: 'dresses',
  jumpsuits: 'dresses',
  jackets: 'outerwear',
  'leather jackets': 'outerwear',
  'denim jackets': 'outerwear',
  coats: 'outerwear',
  'high tops': 'shoes',
  'low tops': 'shoes',
  boots: 'shoes',
  trainers: 'shoes',
  heels: 'shoes',
  sandals: 'shoes',
  loafers: 'shoes',
};

/** Resolve the reference guide for a listing, or null when the category
 *  isn't size-relevant. */
export function resolveSizeGuide(listing: Listing): SizeGuide | null {
  const sub = listing.subcategory?.toLowerCase().trim();
  const cat = listing.category?.toLowerCase().trim();
  const key =
    (sub ? SIZE_GUIDE_BY_SUBCATEGORY[sub] : undefined) ??
    (cat === 'sneakers' || cat === 'shoes' ? 'shoes' : undefined);
  if (!key) return null;
  return SIZE_GUIDES.find((g) => g.key === key) ?? null;
}

/** Listing sizes can carry a UK prefix ("UK 9") while the shoe table rows
 *  are bare UK numbers — normalise before matching the buyer's row. */
const normaliseSize = (s: string) => s.toLowerCase().replace(/^uk\s+/, '').trim();

interface SizeGuideSheetProps {
  open: boolean;
  onClose: () => void;
  guide: SizeGuide | null;
  currentSize?: string | null;
}

export function SizeGuideSheet({ open, onClose, guide, currentSize }: SizeGuideSheetProps) {
  const current = currentSize ? normaliseSize(currentSize) : null;

  return (
    <Sheet open={open} onClose={onClose} title="Size guide">
      <div className="px-5 pb-6">
        {guide ? (
          <>
            <p className="pb-3 text-meta text-text-secondary">{guide.title}</p>

            {/* Measurement table — flat, hairline separators, tnum */}
            <div role="table" aria-label={guide.title}>
              <div
                role="row"
                className="flex border-b border-border-subtle bg-surface px-2 py-2.5"
              >
                {guide.columns.map((col, i) => (
                  <span
                    key={col}
                    role="columnheader"
                    className={`text-meta uppercase tracking-wide text-text-muted ${
                      i === 0 ? 'flex-[0.7]' : 'flex-1'
                    }`}
                  >
                    {col}
                  </span>
                ))}
              </div>
              {guide.rows.map((row, i) => {
                const isCurrent = current != null && normaliseSize(row.size) === current;
                return (
                  <div
                    key={row.size}
                    role="row"
                    className={`flex items-center border-b border-border-subtle px-2 py-3 last:border-0 ${
                      isCurrent ? 'bg-brand-subtle' : i % 2 === 1 ? 'bg-surface-alt' : ''
                    }`}
                  >
                    <span
                      role="rowheader"
                      className={`flex-[0.7] text-body font-semibold ${
                        isCurrent ? 'text-brand' : 'text-text-primary'
                      }`}
                    >
                      {isCurrent ? `${row.size} · You` : row.size}
                    </span>
                    {guide.columns.slice(1).map((col) => {
                      // Column → measurement key candidates: 'US (M)' needs
                      // 'usm' (stripped), 'Foot (cm)' needs 'foot' (first word).
                      const lower = col.toLowerCase();
                      const candidates = [
                        lower.split(' ')[0],
                        lower.replace(/[^a-z]/g, ''),
                        lower,
                      ];
                      const value =
                        candidates
                          .map((k) => row.measurements[k])
                          .find((v) => v != null) ?? '—';
                      return (
                        <span
                          key={col}
                          role="cell"
                          className={`tnum flex-1 text-body ${
                            isCurrent ? 'font-semibold text-brand' : 'text-text-primary'
                          }`}
                        >
                          {value}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* How-to-measure tip */}
            <div className="mt-2 flex items-start gap-2 border-t border-border-subtle px-2 pt-4">
              <Icon name="scan" size={16} className="mt-0.5 shrink-0 text-brand" />
              <p className="flex-1 text-meta leading-relaxed text-text-secondary">
                Lay the garment flat and measure armpit-to-armpit for chest,
                shoulder seam to hem for length.
              </p>
            </div>

            {/* Honesty footer — reference chart, not a listing measurement */}
            <div className="flex items-start gap-2 pt-4">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-text-muted" />
              <p className="flex-1 text-meta leading-relaxed text-text-muted">
                Standard retail references. Always check the item description for
                specific measurements.
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-2 py-8 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-text-muted">
              <Icon name="scan" size={26} />
            </span>
            <p className="text-body-emphasis font-semibold text-text-primary">
              No size guide available
            </p>
            <p className="mt-1 max-w-xs text-meta leading-relaxed text-text-muted">
              Size guides are available for tops, bottoms, dresses, shoes and
              outerwear.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
