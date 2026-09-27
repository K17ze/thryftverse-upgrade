/**
 * StyleGraph — web port of frontend/src/services/styleGraph.ts, retargeted
 * at the Listing contract. Same deterministic heuristic scoring: color
 * harmony + formality proximity + season overlap, slot rules reused from
 * outfitItems.inferListingSlot. Web listings carry no `color` field, so
 * color normalizes from title + subcategory keywords — same fuzzy grammar
 * as mobile normalizeColor.
 */

import type { Listing } from '@/lib/contracts/domain';
import type { OutfitSlot } from '@/lib/store/outfits';
import { OUTFIT_SLOTS } from '@/lib/store/outfits';
import { inferListingSlot } from './outfitItems';

export interface CompatibilityResult {
  score: number;
  reasons: string[];
  colorHarmony: number;
  formalityMatch: number;
  seasonMatch: number;
}

export interface CompletionSuggestion {
  slot: OutfitSlot;
  item: Listing;
  scoreImprovement: number;
}

// ---------------------------------------------------------------------------
// Rule tables — verbatim port of the mobile tables (web subcategory names
// are the same vocabulary: 'T-shirts', 'Hoodies', 'Boots', …).
// ---------------------------------------------------------------------------

const COLOR_HARMONY: Record<string, string[]> = {
  black: ['white', 'grey', 'beige', 'navy', 'red', 'olive'],
  white: ['black', 'navy', 'denim', 'beige', 'grey', 'pastel'],
  navy: ['white', 'beige', 'cream', 'tan', 'burgundy', 'olive'],
  beige: ['navy', 'black', 'white', 'brown', 'olive', 'denim'],
  grey: ['black', 'white', 'navy', 'pink', 'burgundy', 'pastel'],
  olive: ['black', 'white', 'beige', 'denim', 'cream', 'tan'],
  denim: ['white', 'black', 'beige', 'grey', 'tan', 'olive'],
  red: ['black', 'white', 'navy', 'beige', 'denim'],
  brown: ['beige', 'cream', 'white', 'denim', 'tan'],
  burgundy: ['grey', 'black', 'white', 'navy', 'beige'],
  pastel: ['white', 'grey', 'navy', 'beige', 'denim'],
  cream: ['navy', 'brown', 'beige', 'olive', 'denim'],
};

const FORMALITY_LEVEL: Record<string, number> = {
  't-shirts': 1,
  hoodies: 1,
  sneakers: 1,
  'high tops': 1,
  'low tops': 1,
  shorts: 1,
  hats: 1,
  jeans: 2,
  bags: 2,
  totes: 2,
  'shoulder bags': 2,
  scarves: 2,
  shirts: 3,
  sweaters: 3,
  knitwear: 3,
  trousers: 3,
  skirts: 3,
  boots: 3,
  jackets: 3,
  'denim jackets': 3,
  'leather jackets': 3,
  jewelry: 3,
  belts: 3,
  loafers: 4,
  blazers: 4,
  heels: 4,
  coats: 4,
  watches: 4,
  dresses: 3,
};

const SEASON_TAGS: Record<string, string[]> = {
  't-shirts': ['spring', 'summer'],
  shorts: ['spring', 'summer'],
  dresses: ['spring', 'summer'],
  skirts: ['spring', 'summer'],
  sandals: ['spring', 'summer'],
  hoodies: ['autumn', 'winter'],
  sweaters: ['autumn', 'winter'],
  knitwear: ['autumn', 'winter'],
  coats: ['autumn', 'winter'],
  jackets: ['spring', 'autumn'],
  'denim jackets': ['spring', 'autumn'],
  'leather jackets': ['autumn', 'winter'],
  boots: ['autumn', 'winter'],
};

const ALL_SEASONS = ['spring', 'summer', 'autumn', 'winter'];

/** Port of mobile normalizeColor — applied to `title + subcategory` text
 *  since web listings don't carry a discrete color field. */
function normalizeColor(text: string): string {
  const c = text.toLowerCase();
  if (c.includes('navy')) return 'navy';
  if (c.includes('beige') || c.includes('tan') || c.includes('camel')) return 'beige';
  if (c.includes('grey') || c.includes('gray') || c.includes('charcoal')) return 'grey';
  if (c.includes('olive') || c.includes('khaki') || c.includes('green')) return 'olive';
  if (c.includes('denim') || c.includes('indigo') || c.includes('blue')) return 'denim';
  if (c.includes('white') || c.includes('off-white') || c.includes('ecru')) return 'white';
  if (c.includes('black') || c.includes('noir')) return 'black';
  if (c.includes('brown') || c.includes('chocolate')) return 'brown';
  if (c.includes('burgundy') || c.includes('wine')) return 'burgundy';
  if (c.includes('red')) return 'red';
  if (c.includes('cream')) return 'cream';
  if (c.includes('pastel') || c.includes('pink') || c.includes('lilac') || c.includes('blush')) {
    return 'pastel';
  }
  return 'neutral';
}

const colorOf = (l: Listing) => normalizeColor(`${l.title} ${l.subcategory ?? ''}`);
const subcatOf = (l: Listing) => (l.subcategory ?? '').toLowerCase();

export function scoreCompatibility(a: Listing, b: Listing): CompatibilityResult {
  const reasons: string[] = [];

  const ca = colorOf(a);
  const cb = colorOf(b);
  const harmony = COLOR_HARMONY[ca] ?? [];
  const colorHarmony = ca === cb ? 60 : harmony.includes(cb) ? 90 : 40;
  if (ca === cb) reasons.push('Monochromatic palette');
  else if (harmony.includes(cb)) reasons.push('Complementary colors');
  else reasons.push('Color contrast');

  const fa = FORMALITY_LEVEL[subcatOf(a)] ?? 2;
  const fb = FORMALITY_LEVEL[subcatOf(b)] ?? 2;
  const diff = Math.abs(fa - fb);
  const formalityMatch = Math.max(0, 100 - diff * 30);
  reasons.push(diff <= 1 ? 'Formality aligned' : 'Mixed formality');

  const sa = SEASON_TAGS[subcatOf(a)] ?? ALL_SEASONS;
  const sb = SEASON_TAGS[subcatOf(b)] ?? ALL_SEASONS;
  const overlap = sa.filter((s) => sb.includes(s));
  const seasonMatch = overlap.length >= 2 ? 95 : overlap.length === 1 ? 70 : 50;
  if (overlap.length >= 2) reasons.push('Season match');

  const score = Math.round((colorHarmony + formalityMatch + seasonMatch) / 3);
  return { score, reasons, colorHarmony, formalityMatch, seasonMatch };
}

export function scoreOutfit(
  items: Partial<Record<OutfitSlot, Listing | undefined>>,
): CompatibilityResult {
  const present = OUTFIT_SLOTS.map((s) => items[s]).filter(
    (l): l is Listing => Boolean(l),
  );
  if (present.length < 2) {
    return {
      score: 0,
      reasons: ['Add more items to score'],
      colorHarmony: 0,
      formalityMatch: 0,
      seasonMatch: 0,
    };
  }

  let totalScore = 0;
  let totalColor = 0;
  let totalFormality = 0;
  let totalSeason = 0;
  let pairCount = 0;
  const allReasons = new Set<string>();

  for (let i = 0; i < present.length; i += 1) {
    for (let j = i + 1; j < present.length; j += 1) {
      const result = scoreCompatibility(present[i], present[j]);
      totalScore += result.score;
      totalColor += result.colorHarmony;
      totalFormality += result.formalityMatch;
      totalSeason += result.seasonMatch;
      pairCount += 1;
      result.reasons.forEach((r) => allReasons.add(r));
    }
  }

  const filledSlots = OUTFIT_SLOTS.filter((s) => items[s]).length;
  const completenessBonus =
    filledSlots === OUTFIT_SLOTS.length ? 10 : filledSlots >= 3 ? 5 : 0;

  return {
    score: Math.min(100, Math.round(totalScore / pairCount + completenessBonus)),
    reasons: Array.from(allReasons).slice(0, 3),
    colorHarmony: Math.round(totalColor / pairCount),
    formalityMatch: Math.round(totalFormality / pairCount),
    seasonMatch: Math.round(totalSeason / pairCount),
  };
}

/**
 * suggestCompletion — verbatim port of mobile suggestCompletion: for each
 * empty slot, score every candidate's marginal outfit-score improvement
 * and return the best pairing. Category complement comes free via the
 * empty-slot filter — suggestions always fill a missing garment class.
 */
export function suggestCompletion(
  currentItems: Partial<Record<OutfitSlot, Listing | undefined>>,
  availableItems: Listing[],
): CompletionSuggestion | null {
  const emptySlots = OUTFIT_SLOTS.filter((s) => !currentItems[s]);
  if (emptySlots.length === 0) return null;

  const currentScore = scoreOutfit(currentItems).score;
  let best: CompletionSuggestion | null = null;

  for (const slot of emptySlots) {
    for (const candidate of availableItems) {
      if (inferListingSlot(candidate) !== slot) continue;
      const nextScore = scoreOutfit({ ...currentItems, [slot]: candidate }).score;
      const improvement = nextScore - currentScore;
      if (!best || improvement > best.scoreImprovement) {
        best = { slot, item: candidate, scoreImprovement: improvement };
      }
    }
  }

  return best;
}
