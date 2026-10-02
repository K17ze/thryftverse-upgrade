import type { Listing } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import type { ParsedIntent } from './convSearchTypes';
import { ITEM_TERMS, LISTING_COLOURS, normalize } from './convSearchVocab';

// ---------------------------------------------------------------------------
// Matching — deterministic filter of the fixture catalogue
// ---------------------------------------------------------------------------

export function searchableText(l: Listing): string {
  return normalize(`${l.title} ${l.brand ?? ''} ${l.category} ${l.subcategory ?? ''} ${l.description}`);
}

/** Term match — category/subcategory/title with plural tolerance, mirroring
 *  the visual engine's categoryMatches. */
export function itemTermMatches(l: Listing, matchValues: string[]): boolean {
  const hay = normalize(`${l.category} ${l.subcategory ?? ''} ${l.title}`);
  return matchValues.some((v) => {
    if (hay.includes(v)) return true;
    if (!v.endsWith('s') && hay.includes(`${v}s`)) return true;
    return false;
  });
}

export function styleMatches(l: Listing, style: string): boolean {
  const s = style.toLowerCase();
  return searchableText(l).includes(s);
}

/**
 * Filter LISTINGS by the parsed intent. Field semantics:
 *  - brands / slugs / itemTerms / conditions / price / sizes: hard filters
 *    (sizes are OR'd — "size 7 or 9" reads naturally in a thread)
 *  - colours: hard only when the listing names a colour — listings that name
 *    none can't be disproved (same rule as visual search)
 *  - styles / sustainable / residual keywords: text + grade filters
 *  Results rank by likes — deterministic popularity order.
 */
export function matchIntent(intent: ParsedIntent): Listing[] {
  const out = LISTINGS.filter((l) => {
    if (
      intent.categorySlugs.length > 0 &&
      !intent.categorySlugs.includes(l.category.toLowerCase())
    ) {
      return false;
    }
    if (
      intent.brands.length > 0 &&
      !(l.brand && intent.brands.some((b) => l.brand!.toLowerCase() === b.toLowerCase()))
    ) {
      return false;
    }
    if (intent.itemTerms.length > 0) {
      const termDefs = intent.itemTerms.map((label) =>
        ITEM_TERMS.find((t) => t.label === label),
      );
      if (!termDefs.every((def) => def && itemTermMatches(l, def.match))) return false;
    }
    if (intent.conditions.length > 0 && !intent.conditions.includes(l.condition)) {
      return false;
    }
    if (intent.priceMin != null && l.price < intent.priceMin) return false;
    if (intent.priceMax != null && l.price > intent.priceMax) return false;
    if (
      intent.sizes.length > 0 &&
      !(l.size && intent.sizes.some((s) => l.size!.toLowerCase().includes(s.toLowerCase())))
    ) {
      return false;
    }
    if (intent.sustainable && !(l.sustainabilityGrade === 'A' || l.sustainabilityGrade === 'B')) {
      return false;
    }
    if (intent.styles.length > 0 && !intent.styles.every((s) => styleMatches(l, s))) {
      return false;
    }
    if (intent.colours.length > 0) {
      const named = LISTING_COLOURS.get(l.id) ?? [];
      if (named.length > 0 && !intent.colours.some((c) => named.includes(c))) return false;
    }
    if (intent.keywords.length > 0) {
      const hay = searchableText(l);
      if (!intent.keywords.every((k) => hay.includes(k))) return false;
    }
    return true;
  });

  return out.sort((a, b) => b.likes - a.likes);
}
