'use client';

/**
 * VisualSearchResultsGrid — balanced-column masonry for the visual-search
 * result set. Listing-only (the match caps at 24), so each tile carries a
 * file-to-board affordance — the web equivalent of mobile's long-press →
 * SaveToCollectionModal: a quiet top-corner glyph (same grammar the saved
 * surface's SavedTile uses) that opens SaveToBoardSheet.
 *
 * Columns balance by estimated height (media aspect + a fixed metadata
 * weight) — the product tile reserves its real media ratio, so estimates
 * never drift the layout the way wrapped copy could on a denser grid.
 */

import { memo, useMemo } from 'react';
import type { DiscoveryListingSummary, Listing } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { ProductTile } from '@/components/cards/ProductTile';
import { Icon } from '@/components/ui/Icon';
import { listingHasPriceDrop } from '@/components/closet/closetFilters';
import {
  DEFAULT_LISTING_MEDIA_ASPECT_RATIO,
  resolveListingMediaAspectRatio,
} from '@/lib/utils/media';

/** Metadata block under the media, expressed as a share of column width —
 *  price + brand/title + seller row lands near a quarter of the column. */
const META_WEIGHT = 0.24;

/** Append each listing to the currently shortest column — the same
 *  balanced-column intent MasonryGrid packs toward, reduced to the
 *  listing-only, capped result set this surface renders. */
function distribute(items: Listing[], columns: number): Listing[][] {
  const cols = Array.from({ length: Math.max(1, columns) }, () => ({
    items: [] as Listing[],
    h: 0,
  }));
  for (const item of items) {
    const ratio =
      resolveListingMediaAspectRatio(item) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
    let target = cols[0];
    for (const col of cols) if (col.h < target.h) target = col;
    target.items.push(item);
    target.h += 1 / ratio + META_WEIGHT;
  }
  return cols.map((c) => c.items);
}

/**
 * ResultTile — ProductTile plus the file-to-board corner affordance. The
 * control is a sibling of the tile's stretched link, never nested inside
 * it; same hover-reveal grammar as SavedTile (always visible on touch
 * viewports), and it slides below the price-drop/sustainability badge
 * when one owns the corner.
 */
const ResultTile = memo(function ResultTile({
  item,
  summary,
  onFile,
}: {
  item: Listing;
  summary: DiscoveryListingSummary;
  onFile: (item: Listing) => void;
}) {
  const showSustainability =
    !item.isSold &&
    item.status !== 'paused' &&
    (item.sustainabilityGrade === 'A' || item.sustainabilityGrade === 'B');
  const cornerBusy = listingHasPriceDrop(item) || showSustainability;

  return (
    <div className="group relative">
      <ProductTile item={summary} />
      {item.isSold ? null : (
        <button
          type="button"
          onClick={() => onFile(item)}
          aria-label={`File ${item.title} to a board`}
          title="Save to board"
          className={`pressable absolute left-0 flex h-11 w-11 items-center justify-center transition-opacity [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:opacity-0 ${
            cornerBusy ? 'top-9' : 'top-0'
          }`}
        >
          <Icon
            name="layers"
            size={18}
            className="text-scrim-text-primary drop-scrim"
          />
        </button>
      )}
    </div>
  );
});

interface VisualSearchResultsGridProps {
  results: Listing[];
  columns: number;
  /** File-to-board affordance — opens the board picker for this item. */
  onFileItem: (item: Listing) => void;
}

export function VisualSearchResultsGrid({
  results,
  columns,
  onFileItem,
}: VisualSearchResultsGridProps) {
  const lanes = useMemo(() => distribute(results, columns), [results, columns]);
  const summaries = useMemo(
    () => new Map(results.map((l) => [l.id, mapListingToDiscoverySummary(l)])),
    [results],
  );

  return (
    <div className="flex items-start gap-[max(4px,var(--density-row-gap))]">
      {lanes.map((lane, i) => (
        <div
          key={i}
          className="flex min-w-0 flex-1 flex-col gap-[max(4px,var(--density-row-gap))]"
        >
          {lane.map((item) => (
            <ResultTile
              key={item.id}
              item={item}
              summary={summaries.get(item.id)!}
              onFile={onFileItem}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
