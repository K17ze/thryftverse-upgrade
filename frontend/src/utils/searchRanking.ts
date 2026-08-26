import type { ListingCondition } from '../services/listingsApi';
import { CONDITION_NAMES } from '../contracts/taxonomy';

// Canonical listing conditions. Backend search rows may carry a free-form
// condition string; only accept it when it matches a known condition so we
// never fabricate a commerce fact (audit P0.4).

export function normalizeSearchCondition(value: string | null | undefined): ListingCondition | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const match = CONDITION_NAMES.find(
    (c) => c.toLowerCase() === value.toLowerCase(),
  ) as ListingCondition | undefined;
  return match ?? null;
}

export function buildAffinitySet(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (value == null) return;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([value]) => value),
  );
}

export function getRecencyBoost(createdAt?: string) {
  if (!createdAt) return 0;
  const createdTs = Date.parse(createdAt);
  if (Number.isNaN(createdTs)) return 0;
  const ageHours = (Date.now() - createdTs) / (1000 * 60 * 60);
  return Math.max(0, 16 - ageHours / 8);
}

/**
 * Derives broadened search suggestions from a multi-word query.
 * For "vintage denim jacket" → ["denim", "vintage"].
 * For a single word, falls back to trending category labels so the user
 * always has a meaningful next step.
 */
export function getBroadenedSuggestions(rawQuery: string, topLevelCategoryIds: string[]): string[] {
  const tokens = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    // Offer the individual tokens (shorter / broader) as suggestions
    return tokens.slice(0, 2);
  }
  // Single token — surface a couple of trending categories as alternatives
  return topLevelCategoryIds.slice(0, 2);
}
