'use client';

/**
 * FeedExplanationSheet — "Why am I seeing this?" (web port of the mobile
 * FeedExplanationSheet).
 *
 * Truthful-by-construction: when the item came from the server-ranked
 * serve, the reasons are the serve's own component scores / reason codes
 * and the confidence label derives from the item's utility score. On the
 * baseline or fixture feed there is no ranking decision to cite — the
 * sheet says so and lists only the local signals that genuinely applied
 * (a saved brand, a followed seller), never invented reasons.
 *
 * Actions (mobile parity): "See more like this", "Show less like this",
 * "Remove this topic", "Not interested". The two topic-level tunes write
 * durable intent-ledger mutations, so the caller only supplies them when
 * a signed-in live session can persist them — in fixture/guest mode the
 * buttons simply don't render rather than pretending a durable control.
 */

import { useMemo } from 'react';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';
import { listingById } from '@/lib/data/fixtures';
import { getListingCoverUri } from '@/lib/utils/media';
import type { FeedSource, ServeItemMeta } from '@/lib/hooks/feed-queries';
import type { ServeMode } from '@/lib/api/services/recommendations';

interface FeedExplanationSheetProps {
  open: boolean;
  onClose: () => void;
  listing: DiscoveryListingSummary | null;
  /** Serve metadata when the item came from /recommendations. */
  meta?: ServeItemMeta | null;
  feedSource: FeedSource;
  serveMode?: ServeMode | string | null;
  onShowLess: (listing: DiscoveryListingSummary) => void;
  onNotInterested: (listing: DiscoveryListingSummary) => void;
  /** "See more like this" — durable facet boost (intent `more`). Only
   *  provided when the write can persist; undefined means don't render. */
  onSeeMore?: (listing: DiscoveryListingSummary) => void;
  /** "Remove this topic" — durable facet exclusion (intent `remove`).
   *  Same gating as onSeeMore. */
  onRemoveTopic?: (listing: DiscoveryListingSummary) => void;
}

interface ExplanationReason {
  topic: string;
  /** 'Explicit' | 'Implicit' | 'Inferred' — signal provenance. */
  source: string;
  /** Relative weight contribution (0–1) for the bar visual. */
  weight: number;
}

type ConfidenceLabel = 'Strong match' | 'Moderate match' | 'Exploratory';

const CONFIDENCE_BAR: Record<ConfidenceLabel, number> = {
  'Strong match': 0.85,
  'Moderate match': 0.55,
  Exploratory: 0.25,
};

const CONFIDENCE_ICON: Record<ConfidenceLabel, 'check' | 'remove' | 'search'> = {
  'Strong match': 'check',
  'Moderate match': 'remove',
  Exploratory: 'search',
};

/** Component-score → reason copy (mirrors ml-service RANKING_FEATURES /
 *  `_reason_codes`; mobile algorithmTransparencyApi table). */
const COMPONENT_REASON: Record<string, { label: string; source: string }> = {
  affinity: { label: 'Matches your recent activity', source: 'Implicit' },
  sequence: { label: 'Matches your latest interest', source: 'Implicit' },
  price_alignment: { label: 'Within your preferred price range', source: 'Inferred' },
  quality: { label: 'Listing quality', source: 'Inferred' },
  popularity: { label: 'Market interest', source: 'Inferred' },
  freshness: { label: 'Recently listed', source: 'Inferred' },
  seller_trust: { label: 'From a trusted seller', source: 'Inferred' },
  response_velocity: { label: 'Seller responds quickly', source: 'Inferred' },
};

const REASON_CODE_LABEL: Record<string, string> = {
  matches_recent_activity: 'Matches your recent activity',
  matches_latest_interest: 'Matches your latest interest',
  within_preferred_price_range: 'Within your preferred price range',
  listing_quality: 'Listing quality',
  market_interest: 'Market interest',
  recent_listing: 'Recently listed',
  seller_trust: 'From a trusted seller',
  // Not a ranking reason — the code marks a degraded serve where the
  // decision service was unreachable and the fallback heuristic ordered
  // the feed. Say what actually happened, don't dress it as a match signal.
  decision_service_unavailable: 'Standard catalogue order — personalisation unavailable',
};

function humaniseKey(key: string): string {
  const words = key.split('_').filter(Boolean);
  if (words.length === 0) return key;
  return words[0].charAt(0).toUpperCase() + words.join(' ').slice(1);
}

function confidenceFromScore(score: number): ConfidenceLabel {
  if (score >= 0.7) return 'Strong match';
  if (score >= 0.4) return 'Moderate match';
  return 'Exploratory';
}

/** Reasons from a real serve — component scores first, reason codes as
 *  fallback (same precedence as the mobile sheet). */
function reasonsFromMeta(meta: ServeItemMeta): ExplanationReason[] {
  const fromScores = Object.entries(meta.componentScores)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => ({
      topic: COMPONENT_REASON[key]?.label ?? humaniseKey(key),
      source: COMPONENT_REASON[key]?.source ?? 'Inferred',
      weight: Math.min(1, Math.max(0, value)),
    }));
  if (fromScores.length > 0) return fromScores;
  return meta.reasonCodes.slice(0, 3).map((code, index) => ({
    topic: REASON_CODE_LABEL[code] ?? humaniseKey(code),
    source: 'Inferred',
    weight: Math.max(0.2, 0.7 - index * 0.2),
  }));
}

const SERVE_MODE_NOTE: Partial<Record<ServeMode, string>> = {
  cold_start: 'We’re still learning your taste — early recommendations lean on what’s popular.',
  non_profiled: 'Personalisation is off for your account — this is the standard feed.',
  degraded_baseline: 'Recommendations are running in a reduced mode right now.',
};

export function FeedExplanationSheet({
  open,
  onClose,
  listing,
  meta,
  feedSource,
  serveMode,
  onShowLess,
  onNotInterested,
  onSeeMore,
  onRemoveTopic,
}: FeedExplanationSheetProps) {
  const hydrated = useHydrated();
  const wishlist = useStore((s) => s.wishlist);
  const followingIds = useFollows((s) => s.followingIds);
  const viewedIds = useRecentlyViewed((s) => s.listingIds);

  const reasons = useMemo<ExplanationReason[]>(() => {
    if (!listing) return [];
    if (meta) return reasonsFromMeta(meta);

    // No serve attribution — only local signals that genuinely feed the
    // ranker (rankFeedUnits): saves → brand/category, follows → seller,
    // PDP views → category/subcategory. Each reason names the concrete
    // thing behind it — "because you saved X", "you follow @y",
    // "you viewed similar Z" — never a generic "relevance" label.
    const local: ExplanationReason[] = [];
    if (hydrated) {
      const brandKey = listing.brand?.toLowerCase();
      const categoryKey = listing.category.toLowerCase();
      const subcategoryKey = listing.subcategory?.toLowerCase();

      // Saved items → the specific piece that shares the brand/category.
      let savedBrandTitle: string | null = null;
      let savedCategoryTitle: string | null = null;
      for (const id of wishlist) {
        const liked = listingById(id);
        if (!liked) continue;
        if (!savedBrandTitle && brandKey && liked.brand?.toLowerCase() === brandKey) {
          savedBrandTitle = liked.title;
        }
        if (!savedCategoryTitle && liked.category.toLowerCase() === categoryKey) {
          savedCategoryTitle = liked.title;
        }
      }
      if (savedBrandTitle) {
        local.push({
          topic: `You saved “${savedBrandTitle}”`,
          source: 'Implicit',
          weight: 0.7,
        });
      } else if (savedCategoryTitle) {
        local.push({
          topic: `You saved similar ${categoryKey} items`,
          source: 'Implicit',
          weight: 0.55,
        });
      }

      // Followed seller — named, not "a member".
      if (followingIds.includes(listing.sellerId)) {
        const username = listing.seller?.username;
        local.push({
          topic: username ? `You follow @${username}` : 'From a member you follow',
          source: 'Explicit',
          weight: 0.8,
        });
      }

      // Viewed items — the weaker implicit tier the ranker actually uses.
      let viewedSubcategory = false;
      let viewedCategory = false;
      for (const id of viewedIds) {
        const viewed = listingById(id);
        if (!viewed) continue;
        if (subcategoryKey && viewed.subcategory?.toLowerCase() === subcategoryKey) {
          viewedSubcategory = true;
        }
        if (viewed.category.toLowerCase() === categoryKey) viewedCategory = true;
      }
      if (viewedSubcategory) {
        local.push({
          topic: `You viewed similar ${listing.subcategory} pieces`,
          source: 'Implicit',
          weight: 0.5,
        });
      } else if (viewedCategory) {
        local.push({
          topic: `You viewed ${categoryKey} pieces recently`,
          source: 'Implicit',
          weight: 0.35,
        });
      }
    }
    local.sort((a, b) => b.weight - a.weight);
    if (local.length > 0) return local.slice(0, 3);
    return [
      {
        topic: feedSource === 'fixture' ? 'Part of the sample catalogue' : 'Recently listed',
        source: 'Inferred',
        weight: 0.3,
      },
    ];
  }, [listing, meta, hydrated, wishlist, followingIds, viewedIds, feedSource]);

  if (!listing) return null;

  const honestyNote =
    feedSource === 'fixture'
      ? 'Preview build — this feed is a sample catalogue. The order is editorial plus your saves and follows on this device, not a live personalised serve.'
      : feedSource === 'feed'
        ? 'This is the standard feed — sign in for recommendations ranked around your taste.'
        : (serveMode ? SERVE_MODE_NOTE[serveMode as ServeMode] : undefined) ??
          'Ranked for you from your recent activity.';

  const confidence = meta ? confidenceFromScore(meta.score) : null;
  const cover = getListingCoverUri(listing.images);

  return (
    <Sheet open={open} onClose={onClose} title="Why you’re seeing this" maxWidth={440}>
      <div className="flex flex-col gap-5 px-5 py-5">
        {/* Item identity */}
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
            <AppImage src={cover} alt="" aspectRatio={1} className="h-full w-full" sizes="64px" />
          </div>
          <div className="min-w-0">
            <p className="clamp-2 text-body-emphasis font-semibold text-text-primary">
              {listing.title}
            </p>
            <p className="mt-0.5 text-meta text-text-muted">Appeared in your feed</p>
          </div>
        </div>

        {/* Confidence — only when a real serve score backs it. */}
        {confidence ? (
          <div className="rounded-lg border border-border p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Icon name={CONFIDENCE_ICON[confidence]} size={17} className="text-text-primary" />
              <span className="text-body-emphasis font-semibold text-text-primary">
                {confidence}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-text-primary"
                style={{ width: `${Math.round(CONFIDENCE_BAR[confidence] * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Reasons */}
        <div>
          <p className="mb-1.5 text-label uppercase tracking-wide text-text-muted">Reasons</p>
          <div className="border-t border-border-subtle">
            {reasons.map((reason, i) => (
              <div
                key={`${reason.topic}-${i}`}
                className="border-b border-border-subtle py-3"
              >
                <p className="text-body text-text-primary">{reason.topic}</p>
                <p className="mt-0.5 text-meta text-text-muted">{reason.source} signal</p>
                <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-text-primary"
                    style={{ width: `${Math.round(reason.weight * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mechanism note — the honest disclosure of what ordered the feed. */}
        <p className="text-meta leading-relaxed text-text-muted">{honestyNote}</p>

        {/* Adjustments — mobile grammar: a positive tune, a negative tune,
            then the destructive rows (item hide, topic removal). Topic
            controls render only when the durable write exists. */}
        <div className="flex flex-col gap-2">
          {onSeeMore ? (
            <Button
              variant="primary"
              size="md"
              icon="plus"
              fullWidth
              onClick={() => onSeeMore(listing)}
            >
              See more like this
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="md"
            icon="remove"
            fullWidth
            onClick={() => onShowLess(listing)}
          >
            Show less like this
          </Button>
          <Button
            variant="quiet"
            size="md"
            icon="eyeOff"
            fullWidth
            className="text-danger-text"
            onClick={() => onNotInterested(listing)}
          >
            Not interested
          </Button>
          {onRemoveTopic ? (
            <Button
              variant="quiet"
              size="md"
              icon="trash"
              fullWidth
              className="text-danger-text"
              onClick={() => onRemoveTopic(listing)}
            >
              Remove this topic
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
