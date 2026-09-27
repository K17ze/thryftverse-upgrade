/**
 * Home signal rail — port of the mobile dynamic signal chips
 * (algorithmicSignalsService / CURATED_BASELINE_SIGNALS). One rail mixing
 * departments, style signals and brands — the same "quick signal"
 * mechanic. The baseline is derived from fixture aggregates (category
 * counts, like-weighted subcategory/brand activity), not hand-authored,
 * and matching runs across title, brand, category and subcategory with
 * word boundaries, so 'men' can never hit 'women' and a derived chip can
 * never open an empty feed.
 *
 * deriveHomeSignals (mobile useDynamicAlgorithmSignals parity): chips are
 * derived from real signals when they exist — the ranked serve's
 * brand/category facets weighted by item score, the user's intent-ledger
 * topics, and wishlist brand/category affinity — with the curated baseline
 * filling the tail only where it matches feed content. A chip with no
 * real signal behind it is never offered.
 */

import type { DiscoveryFeedUnit, DiscoveryListingSummary } from '@/lib/contracts/domain';
import { listingById, LISTINGS } from '@/lib/data/fixtures';
import type { ServeItemMeta } from '@/lib/hooks/feed-queries';

export interface HomeSignal {
  label: string;
  /** Lowercase match key — 'all' passes everything. */
  key: string;
  /** True when the chip is backed by a real user/serve signal — intent
   *  topic, liked item, or a facet the ranked serve surfaced — rather than
   *  the curated baseline. */
  personalized?: boolean;
}

/**
 * Baseline chip rail — derived from fixture activity, not a hand-authored
 * list (mobile CURATED_BASELINE_SIGNALS parity, but service-backed):
 *  - Departments: top-level categories ranked by live listing count.
 *  - Style signals: subcategories ranked by like-weighted activity —
 *    "trending" here means the pieces members actually engaged with.
 *  - Brands: ranked by like total, the deep-cut signals the mobile rail
 *    learns dynamically.
 * A department/subcategory/brand with no fixture activity simply never
 * appears — no chip can promise a feed the catalogue can't fill.
 */
const BASELINE_SIGNALS: HomeSignal[] = (() => {
  const categoryCount = new Map<string, number>();
  const subcategoryLikes = new Map<string, { label: string; likes: number }>();
  const brandLikes = new Map<string, { label: string; likes: number }>();
  for (const l of LISTINGS) {
    categoryCount.set(l.category, (categoryCount.get(l.category) ?? 0) + 1);
    if (l.subcategory) {
      const key = l.subcategory.toLowerCase();
      const cur = subcategoryLikes.get(key) ?? { label: titleCaseLabel(l.subcategory), likes: 0 };
      cur.likes += l.likes;
      subcategoryLikes.set(key, cur);
    }
    if (l.brand) {
      const key = l.brand.toLowerCase();
      const cur = brandLikes.get(key) ?? { label: l.brand, likes: 0 };
      cur.likes += l.likes;
      brandLikes.set(key, cur);
    }
  }

  const seen = new Set<string>(['all']);
  const push = (out: HomeSignal[], key: string, label: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label });
  };

  const out: HomeSignal[] = [];
  // Departments — busiest first.
  for (const [slug] of [...categoryCount.entries()].sort((a, b) => b[1] - a[1])) {
    push(out, slug, titleCaseLabel(slug));
  }
  // Style signals — the four subcategories with the most engagement.
  for (const [key, v] of [...subcategoryLikes.entries()]
    .sort((a, b) => b[1].likes - a[1].likes)
    .slice(0, 4)) {
    push(out, key, v.label);
  }
  // Brands — the four with the most engagement.
  for (const [key, v] of [...brandLikes.entries()]
    .sort((a, b) => b[1].likes - a[1].likes)
    .slice(0, 4)) {
    push(out, key, v.label);
  }
  return out;
})();

const wordBoundary = (key: string) =>
  new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

/** Mirrors mobile matchesSignal — word-boundary match on identity fields. */
export function matchesHomeSignal(
  listing: DiscoveryListingSummary,
  key: string,
): boolean {
  if (key === 'all') return true;
  const re = wordBoundary(key.toLowerCase());
  return (
    re.test(listing.category) ||
    (listing.subcategory != null && re.test(listing.subcategory)) ||
    re.test(listing.title) ||
    (listing.brand != null && re.test(listing.brand))
  );
}

// ---------------------------------------------------------------------------
// Dynamic derivation
// ---------------------------------------------------------------------------

const MAX_PERSONALIZED = 6;
const MAX_TOTAL = 11;

function titleCaseLabel(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface SignalInput {
  /** Feed units currently on the surface (unfiltered). */
  units: DiscoveryFeedUnit[];
  /** Wishlist listing ids — resolve to brand/category affinity. */
  likedIds: readonly string[];
  /** Intent-ledger topics (live mode only; null when unavailable). */
  intentTopics?: readonly { label: string; influenceBand: string }[] | null;
  /** listingId → serve meta for server-ranked items. */
  metaByListing?: Record<string, ServeItemMeta>;
}

/**
 * Derive the chip rail from real signals, strongest first:
 *  1. Brand/category facets of server-ranked items, weighted by serve score
 *  2. 'more' intent-ledger topics (the user's stated taste)
 *  3. Wishlist brand/category affinity
 *  4. Curated baseline — only entries that match the current feed, so a
 *     chip can never open an empty feed.
 */
export function deriveHomeSignals({
  units,
  likedIds,
  intentTopics,
  metaByListing,
}: SignalInput): HomeSignal[] {
  const listings = units
    .filter((u): u is DiscoveryFeedUnit & { type: 'listing' } => u.type === 'listing')
    .map((u) => u.listing);

  const ranked = new Map<string, { label: string; weight: number }>();
  const bump = (key: string, label: string, weight: number) => {
    const normalized = key.trim().toLowerCase();
    if (!normalized) return;
    const existing = ranked.get(normalized);
    if (existing) {
      existing.weight += weight;
    } else {
      ranked.set(normalized, { label: titleCaseLabel(label), weight });
    }
  };

  // 1. Serve facets — what the ranker actually surfaced, weighted by score.
  if (metaByListing) {
    for (const listing of listings) {
      const meta = metaByListing[listing.id];
      if (!meta || meta.score <= 0) continue;
      if (listing.brand) bump(listing.brand, listing.brand, meta.score);
      bump(listing.category, listing.category, meta.score * 0.7);
    }
  }

  // 2. Intent topics the user asked for more of.
  for (const topic of intentTopics ?? []) {
    if (topic.influenceBand === 'more' || topic.influenceBand === 'usual') {
      bump(topic.label, topic.label, topic.influenceBand === 'more' ? 1.5 : 0.6);
    }
  }

  // 3. Wishlist affinity — the local taste loop.
  for (const id of likedIds) {
    const liked = listingById(id);
    if (!liked) continue;
    if (liked.brand) bump(liked.brand, liked.brand, 2);
    bump(liked.category, liked.category, 1);
  }

  const personalized = [...ranked.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, MAX_PERSONALIZED)
    .map(([key, v]): HomeSignal => ({ key, label: v.label, personalized: true }));

  const seen = new Set(personalized.map((s) => s.key));
  const curated = BASELINE_SIGNALS.filter(
    (s) =>
      s.key !== 'all' &&
      !seen.has(s.key) &&
      listings.some((l) => matchesHomeSignal(l, s.key)),
  );

  return [
    { label: 'All', key: 'all' },
    ...personalized,
    ...curated.slice(0, Math.max(0, MAX_TOTAL - 1 - personalized.length)),
  ];
}
