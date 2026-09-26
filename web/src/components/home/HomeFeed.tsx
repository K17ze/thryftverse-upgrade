'use client';

/**
 * HomeFeed — the authored home canvas. The discovery feed is rendered as
 * sequential MasonryGrid chunks with full-bleed module bands interleaved
 * between them (shelves are siblings of the grid, never inside columns).
 * Density alternates on purpose — a product rail, a denser grid, a quiet
 * editorial/members break, back to the feed (Vinted rhythm; the Looks
 * band ports the mobile HomeLookBreak interruption):
 *
 *   Recently viewed rail (session memory — self-omits for guests/empty)
 *   Fresh drops rail (leads the feed)
 *   chunk 0–8    → Looks to shop rail
 *   chunk 8–16   → Member edits rail (→ /collections)
 *   chunk 16–24  → Featured sellers strip
 *   chunk 24–32  → Galleria editorial banner
 *   chunk 32+    → rest of the feed, honest end marker
 *
 * A module only renders when the feed actually continues past its
 * breakpoint, so filtered/short feeds stay clean.
 */

import { Fragment, useMemo } from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { MasonrySkeleton, Skeleton } from '@/components/ui/Skeleton';
import { RecentlyViewedRail } from './modules/RecentlyViewedRail';
import { FreshDropsRail } from './modules/FreshDropsRail';
import { LooksRail } from './modules/LooksRail';
import { MemberEditsRail } from './modules/MemberEditsRail';
import { FeaturedSellersRail } from './modules/FeaturedSellersRail';
import { GalleriaBanner } from './modules/GalleriaBanner';

interface HomeFeedProps {
  units: DiscoveryFeedUnit[];
  columns: number;
  isLoading?: boolean;
  /** Caller-owned empty state (e.g. the Following tab's recovery CTA). */
  empty?: {
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
}

/** Module bands keyed by the feed position (unit count) they follow. */
const MODULE_BANDS: { after: number; Module: React.ComponentType }[] = [
  { after: 8, Module: LooksRail },
  { after: 16, Module: MemberEditsRail },
  { after: 24, Module: FeaturedSellersRail },
  { after: 32, Module: GalleriaBanner },
];

/**
 * Loading state mirrors the module layout it replaces — a rail skeleton
 * (header line + shelf of tiles) over the masonry skeleton — so the
 * first paint already reads as the composed surface, not a spinner.
 */
function HomeFeedSkeleton({ columns }: { columns: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading feed">
      <section className="py-5 sm:py-6">
        <div className="mb-3 flex items-baseline justify-between px-4 sm:px-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex gap-3 overflow-hidden px-4 sm:px-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-[180px] shrink-0 sm:w-[220px]">
              <Skeleton className="aspect-[4/5] w-full rounded-lg" />
              <Skeleton className="mt-2 h-3.5 w-4/5" />
              <Skeleton className="mt-1.5 h-3.5 w-2/5" />
            </div>
          ))}
        </div>
      </section>
      <MasonrySkeleton columns={columns} />
    </div>
  );
}

export function HomeFeed({ units, columns, isLoading, empty }: HomeFeedProps) {
  // Split the feed at the module breakpoints → chunks interleaved with bands.
  const chunks = useMemo(() => {
    const bounds = [0, ...MODULE_BANDS.map((m) => m.after), units.length];
    const out: DiscoveryFeedUnit[][] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      out.push(units.slice(bounds[i], bounds[i + 1]));
    }
    return out;
  }, [units]);

  if (isLoading) {
    return <HomeFeedSkeleton columns={columns} />;
  }

  if (units.length === 0) {
    // Session memory survives an empty/filtered feed — the rail still
    // renders above the empty state when it has entries.
    return (
      <div className="flex flex-col">
        <RecentlyViewedRail />
        <MasonryGrid
          units={[]}
          columns={columns}
          emptyTitle={empty?.title}
          emptySubtitle={empty?.subtitle}
          emptyActionLabel={empty?.actionLabel}
          onEmptyAction={empty?.onAction}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <RecentlyViewedRail />
      <FreshDropsRail />
      {chunks.map((chunk, i) => {
        const band = i < MODULE_BANDS.length ? MODULE_BANDS[i] : null;
        const showBand = band !== null && units.length > band.after;
        if (chunk.length === 0 && !showBand) return null;
        return (
          <Fragment key={i}>
            {chunk.length > 0 ? <MasonryGrid units={chunk} columns={columns} /> : null}
            {showBand ? <band.Module /> : null}
          </Fragment>
        );
      })}
      {/* Honest finite-feed marker — port of the mobile list footer. */}
      <div className="flex flex-col items-center gap-2.5 px-4 py-10 sm:px-6">
        <span className="h-px w-10 bg-border-subtle" aria-hidden />
        <p className="text-meta text-text-muted">You&apos;ve reached the end</p>
      </div>
    </div>
  );
}
