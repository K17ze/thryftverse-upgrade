'use client';

/**
 * HomeFeed — the authored home canvas. The discovery feed is rendered as
 * sequential MasonryGrid chunks with full-bleed module bands interleaved
 * between them (shelves are siblings of the grid, never inside columns).
 * The page leads with a single shelf — the "Start here" entry band
 * (app/page.tsx) — so the first viewport reads chrome → one dominant
 * media rail → grid; every other rail lives inside the feed rhythm.
 * Density alternates on purpose — a product rail, session memory, a
 * denser grid, a quiet editorial/members break, back to the feed
 * (Vinted rhythm; the Looks band ports the mobile HomeLookBreak
 * interruption):
 *
 *   chunk 0–8    → Recently viewed rail (session memory — self-omits
 *                  for guests/empty; still leads the error/empty states)
 *   chunk 8–16   → Fresh drops rail
 *   chunk 16–24  → Looks to shop rail
 *   chunk 24–32  → Member edits rail (→ /collections)
 *   chunk 32–40  → Featured sellers strip
 *   chunk 40–48  → Galleria editorial banner
 *   chunk 48+    → rest of the feed, honest end marker
 *
 * A module only renders when the feed actually continues past its
 * breakpoint, so filtered/short feeds stay clean.
 *
 * Refresh grammar (mobile FRESH-02 parity): a failed refresh on a
 * populated feed keeps the last-good units and renders an inline retry
 * banner — never an error panel replacing content. Pagination uses an
 * IntersectionObserver sentinel: more units append while the server has
 * a nextCursor; the honest end marker only shows when it doesn't.
 */

import { Fragment, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
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
  /** Fetch failure — renders a real error state with retry, never the
   *  empty copy (an error is not "nothing here"). */
  isError?: boolean;
  onRetry?: () => void;
  /** A refresh on a populated feed failed — the last-good units stay on
   *  screen and this inline retry banner renders above them. */
  refreshError?: boolean;
  onRefreshRetry?: () => void;
  /** Pagination — sentinel fires onLoadMore while the server has a
   *  nextCursor; absent/false renders the honest end marker. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /** A page-append failed — inline retry at the tail, content untouched. */
  loadMoreError?: boolean;
  onLoadMore?: () => void;
  /** Caller-owned empty state (e.g. the Following tab's recovery CTA). */
  empty?: {
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  /** Desktop demotion slot — on ≥lg the story rail stops leading the
   *  page and renders as the break after the first masonry chunk
   *  (mobile keeps it above the feed; see app/page.tsx). Rendered in
   *  every state branch so loading/error/empty don't drop the rail. */
  storyRail?: ReactNode;
}

/** Module bands keyed by the feed position (unit count) they follow.
 *  Bands that read the units (FreshDrops) take them as a prop; the rest
 *  own their data and ignore it. */
const MODULE_BANDS: {
  after: number;
  Module: React.ComponentType<{ units: DiscoveryFeedUnit[] }>;
}[] = [
  { after: 8, Module: RecentlyViewedRail },
  { after: 16, Module: FreshDropsRail },
  { after: 24, Module: LooksRail },
  { after: 32, Module: MemberEditsRail },
  { after: 40, Module: FeaturedSellersRail },
  { after: 48, Module: GalleriaBanner },
];

/**
 * Loading state mirrors the composition it replaces — the lead shelf is
 * real content (EntryBand resolves from its own source), so the feed's
 * first element is the grid: masonry skeleton only, no phantom shelf —
 * the first paint already reads as the composed surface, not a spinner.
 */
function HomeFeedSkeleton({ columns }: { columns: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading feed">
      <MasonrySkeleton columns={columns} />
    </div>
  );
}

export function HomeFeed({
  units,
  columns,
  isLoading,
  isError,
  onRetry,
  refreshError,
  onRefreshRetry,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  empty,
  storyRail,
}: HomeFeedProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll — the sentinel sits ahead of the end marker so the
  // next page starts arriving before the marker reaches the viewport.
  // A failed append pauses auto-loading (manual retry only) — otherwise
  // the sentinel would re-fire on every intersection while it sits in view.
  useEffect(() => {
    if (!hasMore || !onLoadMore || loadMoreError) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, loadMoreError]);

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
    return (
      <div className="flex flex-col">
        {storyRail}
        <HomeFeedSkeleton columns={columns} />
      </div>
    );
  }

  if (isError) {
    // Session memory survives a failed fetch — the rail still renders
    // above the error state, same as the empty branch.
    return (
      <div className="flex flex-col">
        <RecentlyViewedRail />
        {storyRail}
        <EmptyState
          icon="warning"
          title="Couldn’t load the feed"
          subtitle="Check your connection and try again."
          actionLabel={onRetry ? 'Try again' : undefined}
          onAction={onRetry}
          compact
        />
      </div>
    );
  }

  if (units.length === 0) {
    // Session memory survives an empty/filtered feed — the rail still
    // renders above the empty state when it has entries.
    return (
      <div className="flex flex-col">
        {refreshError ? (
          <RefreshErrorBanner onRetry={onRefreshRetry} />
        ) : null}
        <RecentlyViewedRail />
        {storyRail}
        <div className="px-2.5 sm:px-4 lg:px-2">
          <MasonryGrid
            units={[]}
            columns={columns}
            emptyTitle={empty?.title}
            emptySubtitle={empty?.subtitle}
            emptyActionLabel={empty?.actionLabel}
            onEmptyAction={empty?.onAction}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {refreshError ? (
        <RefreshErrorBanner onRetry={onRefreshRetry} />
      ) : null}
      {chunks.map((chunk, i) => {
        const band = i < MODULE_BANDS.length ? MODULE_BANDS[i] : null;
        const showBand = band !== null && units.length > band.after;
        if (chunk.length === 0 && !showBand) return null;
        return (
          <Fragment key={i}>
            {chunk.length > 0 ? (
              // Priority budget: exactly one preloaded image per page —
              // the first cell of the first chunk's grid. Later chunks
              // (and every module rail) leave the budget untouched.
              <div className="px-2.5 sm:px-4 lg:px-2">
                <MasonryGrid units={chunk} columns={columns} prioritizeFirst={i === 0} />
              </div>
            ) : null}
            {/* ≥lg: the demoted story rail is the break after the first
                chunk — mid-feed rhythm instead of leading chrome. */}
            {i === 0 && chunk.length > 0 ? storyRail : null}
            {showBand ? (
              // Offscreen module bands skip layout/paint; `auto` swaps
              // the estimate for the real height after first render.
              <div
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 360px',
                }}
              >
                <band.Module units={units} />
              </div>
            ) : null}
          </Fragment>
        );
      })}

      {/* Tail: sentinel while more pages exist, honest end marker at the
          terminus, inline retry if a page-append failed. */}
      {hasMore ? (
        <>
          <div ref={sentinelRef} className="h-px" aria-hidden />
          <div className="flex flex-col items-center gap-2 px-4 py-8">
            {loadMoreError ? (
              <>
                <p className="text-meta text-text-muted">Couldn’t load more</p>
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="pressable -my-1 min-h-11 rounded-full px-4 text-body font-semibold text-brand"
                >
                  Try again
                </button>
              </>
            ) : isLoadingMore ? (
              <>
                <Icon name="refresh" size={18} className="animate-spin text-text-muted" />
                <p className="sr-only" role="status">
                  Loading more items
                </p>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2.5 px-4 py-10 sm:px-6">
          <span className="h-px w-10 bg-border-subtle" aria-hidden />
          <p className="text-meta text-text-muted">You&apos;ve reached the end</p>
        </div>
      )}
    </div>
  );
}

/** Last-good refresh failure — a quiet inline note, not an error panel. */
function RefreshErrorBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="status"
      className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 sm:mx-6"
    >
      <Icon name="warning" size={16} className="shrink-0 text-text-muted" />
      <p className="min-w-0 flex-1 text-meta text-text-secondary">
        Couldn’t refresh — showing what was already here
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="pressable -my-1 min-h-9 shrink-0 rounded-full px-3 text-caption font-semibold text-brand"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
