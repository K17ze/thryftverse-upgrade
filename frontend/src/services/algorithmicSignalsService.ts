/**
 * Algorithmic Signals Service
 *
 * Core engine for computing, ranking, deduplicating, and boosting dynamic
 * fashion category & style signals derived from the user's personalization
 * algorithm, recommendation vectors, intent profile, and active browsing state.
 *
 * Adheres strictly to AGENTS.md §4 (Anti-AI Design Policy) and §11 (Truthful UI):
 * - Signals reflect real user intent and recommendation vectors, not synthetic placeholders.
 * - Selecting a signal provides closed-loop bidirectional learning by reinforcing
 *   the intent in the user's recommendation profile via the backend mutation API.
 */

import {
  fetchAlgorithmProfile,
  updateTopicWeight,
  type AlgorithmTopic,
  type AlgorithmTransparencyProfile,
} from './algorithmTransparencyApi';
import type { RecommendationItemVM } from '../domain/recommendation';
import type { TaxonomyNode } from '../contracts/taxonomy';

export type SignalKind = 'all' | 'category' | 'style' | 'brand' | 'curated';

export interface DynamicSignalChip {
  id: string;
  label: string;
  filterKey: string;
  kind: SignalKind;
  weight?: 'high' | 'medium' | 'low';
  score: number;
  isPersonalized: boolean;
  topicId?: string;
  iconName?: string;
}

/** Default curated baseline signals used for guests and cold-start profiles. */
export const CURATED_BASELINE_SIGNALS: DynamicSignalChip[] = [
  { id: 'all', label: 'All', filterKey: 'all', kind: 'all', score: 100, isPersonalized: false },
  { id: 'curated-denim', label: 'Denim', filterKey: 'denim', kind: 'curated', score: 75, isPersonalized: false },
  { id: 'curated-sneakers', label: 'Sneakers', filterKey: 'sneakers', kind: 'curated', score: 74, isPersonalized: false },
  { id: 'curated-outerwear', label: 'Outerwear', filterKey: 'outerwear', kind: 'curated', score: 73, isPersonalized: false },
  { id: 'curated-vintage', label: 'Vintage', filterKey: 'vintage', kind: 'curated', score: 72, isPersonalized: false },
  { id: 'curated-minimal', label: 'Minimal', filterKey: 'minimal', kind: 'curated', score: 71, isPersonalized: false },
  { id: 'curated-streetwear', label: 'Streetwear', filterKey: 'streetwear', kind: 'curated', score: 70, isPersonalized: false },
  { id: 'curated-luxury', label: 'Luxury', filterKey: 'luxury', kind: 'curated', score: 69, isPersonalized: false },
];

/** Clean title-case formatting for display labels. */
function formatSignalLabel(raw: string): string {
  if (!raw) return '';
  return raw
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Normalize keys for matching against item brand, category, subcategory, or tags. */
export function normalizeFilterKey(key: string): string {
  return key.trim().toLowerCase();
}

/** Check whether a listing matches an active signal chip. */
export function matchesSignal(item: any, signal: DynamicSignalChip | string): boolean {
  const filterKey = typeof signal === 'string' ? normalizeFilterKey(signal) : normalizeFilterKey(signal.filterKey);
  if (!filterKey || filterKey === 'all') return true;

  const brand = (item.brand || item.identity?.secondary || '').toLowerCase();
  const title = (item.title || item.identity?.primary || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  const subcategory = (item.subcategory || '').toLowerCase();
  const tags = Array.isArray(item.tags) ? item.tags.map((t: string) => t.toLowerCase()).join(' ') : '';
  const description = (item.description || '').toLowerCase();

  return (
    title.includes(filterKey) ||
    brand.includes(filterKey) ||
    category.includes(filterKey) ||
    subcategory.includes(filterKey) ||
    tags.includes(filterKey) ||
    description.includes(filterKey)
  );
}

export interface DeriveSignalsParams {
  profile?: AlgorithmTransparencyProfile | null;
  recommendationItems?: RecommendationItemVM[];
  taxonomyCategories?: TaxonomyNode[];
  recentSearches?: string[];
  wishlistBrands?: string[];
  surface?: 'home' | 'discover' | 'search' | 'discovery' | 'browse';
}

/**
 * Derive ranked, deduplicated dynamic signals by fusing user algorithm topics,
 * active recommendation reason codes, recent searches, and taxonomy categories.
 */
export function deriveDynamicSignals({
  profile,
  recommendationItems = [],
  taxonomyCategories = [],
  recentSearches = [],
  wishlistBrands = [],
  surface = 'home',
}: DeriveSignalsParams): DynamicSignalChip[] {
  const signalMap = new Map<string, DynamicSignalChip>();

  // Always include "All" at index 0
  signalMap.set('all', {
    id: 'all',
    label: 'All',
    filterKey: 'all',
    kind: 'all',
    score: 100,
    isPersonalized: false,
  });

  // 1. Process explicit & inferred topics from Algorithm Transparency Profile
  if (profile?.topics && profile.topics.length > 0) {
    for (const topic of profile.topics) {
      const normKey = normalizeFilterKey(topic.label);
      if (!normKey || normKey === 'all') continue;

      let score = 70;
      if (topic.weight === 'high') score = 95;
      else if (topic.weight === 'medium') score = 82;
      else if (topic.weight === 'low') score = 65;

      let kind: SignalKind = 'style';
      if (topic.category.toLowerCase().includes('brand')) kind = 'brand';
      else if (topic.category.toLowerCase().includes('category')) kind = 'category';

      signalMap.set(normKey, {
        id: topic.id || `topic-${normKey}`,
        label: formatSignalLabel(topic.label),
        filterKey: normKey,
        kind,
        weight: topic.weight,
        score,
        isPersonalized: true,
        topicId: topic.id,
      });
    }
  }

  // 2. Process active recommendation feed items (forYouFeed)
  if (recommendationItems.length > 0) {
    const categoryFrequency = new Map<string, number>();
    const brandFrequency = new Map<string, number>();

    recommendationItems.slice(0, 15).forEach((item) => {
      const cat = item.listing.category?.trim();
      const brand = item.listing.brand?.trim();

      if (cat) {
        categoryFrequency.set(cat, (categoryFrequency.get(cat) ?? 0) + (item.score || 1));
      }
      if (brand) {
        brandFrequency.set(brand, (brandFrequency.get(brand) ?? 0) + (item.score || 1));
      }
    });

    categoryFrequency.forEach((freqScore, cat) => {
      const normKey = normalizeFilterKey(cat);
      if (!normKey || normKey === 'all') return;
      const existing = signalMap.get(normKey);
      const computedScore = Math.min(90, 75 + Math.round(freqScore * 2));

      if (!existing || computedScore > existing.score) {
        signalMap.set(normKey, {
          id: existing?.id || `rec-cat-${normKey}`,
          label: formatSignalLabel(cat),
          filterKey: normKey,
          kind: 'category',
          weight: computedScore >= 85 ? 'high' : 'medium',
          score: computedScore,
          isPersonalized: true,
          topicId: existing?.topicId,
        });
      }
    });

    brandFrequency.forEach((freqScore, brand) => {
      const normKey = normalizeFilterKey(brand);
      if (!normKey || normKey === 'all') return;
      const existing = signalMap.get(normKey);
      const computedScore = Math.min(88, 72 + Math.round(freqScore * 2));

      if (!existing || computedScore > existing.score) {
        signalMap.set(normKey, {
          id: existing?.id || `rec-brand-${normKey}`,
          label: formatSignalLabel(brand),
          filterKey: normKey,
          kind: 'brand',
          weight: computedScore >= 85 ? 'high' : 'medium',
          score: computedScore,
          isPersonalized: true,
          topicId: existing?.topicId,
        });
      }
    });
  }

  // 3. User implicit wishlist brand affinities
  wishlistBrands.slice(0, 3).forEach((brand) => {
    const normKey = normalizeFilterKey(brand);
    if (!normKey || normKey === 'all') return;
    if (!signalMap.has(normKey)) {
      signalMap.set(normKey, {
        id: `wishlist-brand-${normKey}`,
        label: formatSignalLabel(brand),
        filterKey: normKey,
        kind: 'brand',
        weight: 'medium',
        score: 78,
        isPersonalized: true,
      });
    }
  });

  // 4. Incorporate recent searches
  recentSearches.slice(0, 2).forEach((term) => {
    const normKey = normalizeFilterKey(term);
    if (!normKey || normKey === 'all') return;
    if (!signalMap.has(normKey)) {
      signalMap.set(normKey, {
        id: `recent-${normKey}`,
        label: formatSignalLabel(term),
        filterKey: normKey,
        kind: 'style',
        weight: 'medium',
        score: 76,
        isPersonalized: true,
      });
    }
  });

  // 5. Fill with curated baseline signals to ensure complete density
  for (const baseline of CURATED_BASELINE_SIGNALS) {
    if (baseline.filterKey === 'all') continue;
    if (!signalMap.has(baseline.filterKey)) {
      signalMap.set(baseline.filterKey, baseline);
    }
  }

  // 6. If surface is 'discover', ensure taxonomy root categories are aligned with user's rank
  if (surface === 'discover' && taxonomyCategories.length > 0) {
    const rootCats = taxonomyCategories.filter((cat) => cat.parentId === null);
    for (const cat of rootCats) {
      const normKey = normalizeFilterKey(cat.name);
      if (!signalMap.has(normKey)) {
        signalMap.set(normKey, {
          id: cat.id,
          label: cat.name,
          filterKey: cat.id,
          kind: 'category',
          score: 65 - cat.sortOrder,
          isPersonalized: false,
        });
      }
    }
  }

  // Rank: "All" first, then by score descending
  const allChip = signalMap.get('all')!;
  signalMap.delete('all');

  const sortedChips = Array.from(signalMap.values()).sort((a, b) => b.score - a.score);

  // Surface budget: limit to top 10 most relevant chips
  return [allChip, ...sortedChips.slice(0, 9)];
}

/**
 * Boost a signal chip in the user's algorithm, completing the closed-loop
 * personalization cycle when a user interacts with a filter chip.
 */
export async function boostAlgorithmicSignal(
  userId: string | null,
  chip: DynamicSignalChip,
): Promise<void> {
  if (!userId || chip.filterKey === 'all') return;

  try {
    const targetTopicId = chip.topicId || `topic-${chip.filterKey}`;
    await updateTopicWeight(targetTopicId, 'high');
  } catch {
    // Graceful: failure to boost does not interrupt the user's filtering action
  }
}
