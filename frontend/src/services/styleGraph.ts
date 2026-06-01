/**
 * styleGraph — Fashion compatibility engine & outfit builder logic
 * Deterministic mock service for scoring item pairings and suggesting completions.
 */

import { seededRandom } from '../utils/seededRandom';

export type OutfitSlot = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

export interface StyleItem {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  brand?: string;
  color: string;
  condition?: string;
  imageUri?: string;
  price?: number;
  styleTags?: string[];
}

export interface Outfit {
  id: string;
  name: string;
  items: Record<OutfitSlot, StyleItem | undefined>;
  score: number; // 0-100 compatibility score
  tags: string[];
  createdAt: number;
}

export interface CompatibilityResult {
  score: number; // 0-100
  reasons: string[];
  colorHarmony: number; // 0-100
  formalityMatch: number; // 0-100
  seasonMatch: number; // 0-100
}

const SLOTS: OutfitSlot[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];

const SLOT_BY_CATEGORY: Record<string, OutfitSlot> = {
  't-shirts': 'top',
  'shirts': 'top',
  'sweaters': 'top',
  'hoodies': 'top',
  'jackets': 'outerwear',
  'coats': 'outerwear',
  'blazers': 'outerwear',
  'jeans': 'bottom',
  'trousers': 'bottom',
  'shorts': 'bottom',
  'skirts': 'bottom',
  'sneakers': 'shoes',
  'boots': 'shoes',
  'loafers': 'shoes',
  'heels': 'shoes',
  'hats': 'accessory',
  'bags': 'accessory',
  'jewelry': 'accessory',
  'belts': 'accessory',
  'scarves': 'accessory',
  'watches': 'accessory',
};

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
  'hoodies': 1,
  'sneakers': 1,
  'shorts': 1,
  'jeans': 2,
  'shirts': 3,
  'sweaters': 3,
  'trousers': 3,
  'skirts': 3,
  'boots': 3,
  'loafers': 4,
  'blazers': 4,
  'heels': 4,
  'jackets': 3,
  'coats': 4,
  'bags': 2,
  'jewelry': 3,
  'watches': 4,
  'belts': 3,
  'hats': 1,
  'scarves': 2,
};

const SEASON_TAGS: Record<string, string[]> = {
  't-shirts': ['spring', 'summer'],
  'shorts': ['spring', 'summer'],
  'hoodies': ['autumn', 'winter'],
  'sweaters': ['autumn', 'winter'],
  'coats': ['autumn', 'winter'],
  'jackets': ['spring', 'autumn'],
  'boots': ['autumn', 'winter'],
};

function normalizeColor(color: string): string {
  const c = color.toLowerCase().trim();
  if (COLOR_HARMONY[c]) return c;
  // fuzzy
  if (c.includes('navy')) return 'navy';
  if (c.includes('beige') || c.includes('tan') || c.includes('camel')) return 'beige';
  if (c.includes('grey') || c.includes('gray')) return 'grey';
  if (c.includes('olive') || c.includes('green')) return 'olive';
  if (c.includes('denim') || c.includes('blue')) return 'denim';
  if (c.includes('white') || c.includes('off-white')) return 'white';
  if (c.includes('black')) return 'black';
  if (c.includes('brown')) return 'brown';
  if (c.includes('burgundy') || c.includes('wine')) return 'burgundy';
  if (c.includes('red')) return 'red';
  if (c.includes('cream')) return 'cream';
  if (c.includes('pastel') || c.includes('pink') || c.includes('lilac')) return 'pastel';
  return 'neutral';
}

export function inferSlot(item: StyleItem): OutfitSlot {
  const sub = (item.subcategory || '').toLowerCase();
  if (SLOT_BY_CATEGORY[sub]) return SLOT_BY_CATEGORY[sub];
  const cat = (item.category || '').toLowerCase();
  if (SLOT_BY_CATEGORY[cat]) return SLOT_BY_CATEGORY[cat];
  // heuristic fallback
  if (cat.includes('top') || cat.includes('shirt') || cat.includes('tee')) return 'top';
  if (cat.includes('bottom') || cat.includes('pant') || cat.includes('jean') || cat.includes('short')) return 'bottom';
  if (cat.includes('shoe') || cat.includes('sneaker') || cat.includes('boot')) return 'shoes';
  if (cat.includes('jacket') || cat.includes('coat') || cat.includes('blazer')) return 'outerwear';
  return 'accessory';
}

export function scoreCompatibility(a: StyleItem, b: StyleItem): CompatibilityResult {
  const reasons: string[] = [];

  // Color harmony
  const ca = normalizeColor(a.color);
  const cb = normalizeColor(b.color);
  const harmony = COLOR_HARMONY[ca] || [];
  const colorHarmony = ca === cb ? 60 : harmony.includes(cb) ? 90 : 40;
  if (ca === cb) reasons.push('Monochromatic palette');
  else if (harmony.includes(cb)) reasons.push('Complementary colors');
  else reasons.push('Color contrast');

  // Formality match
  const fa = FORMALITY_LEVEL[(a.subcategory || '').toLowerCase()] ?? 2;
  const fb = FORMALITY_LEVEL[(b.subcategory || '').toLowerCase()] ?? 2;
  const diff = Math.abs(fa - fb);
  const formalityMatch = Math.max(0, 100 - diff * 30);
  if (diff <= 1) reasons.push('Formality aligned');
  else reasons.push('Mixed formality');

  // Season overlap
  const sa = SEASON_TAGS[(a.subcategory || '').toLowerCase()] ?? ['spring', 'summer', 'autumn', 'winter'];
  const sb = SEASON_TAGS[(b.subcategory || '').toLowerCase()] ?? ['spring', 'summer', 'autumn', 'winter'];
  const overlap = sa.filter((s) => sb.includes(s));
  const seasonMatch = overlap.length >= 2 ? 95 : overlap.length === 1 ? 70 : 50;
  if (overlap.length >= 2) reasons.push('Season match');

  // Style tag overlap
  const ta = a.styleTags || [];
  const tb = b.styleTags || [];
  const sharedTags = ta.filter((t) => tb.includes(t));
  if (sharedTags.length > 0) {
    reasons.push(`Shared style: ${sharedTags[0]}`);
  }

  const score = Math.round((colorHarmony + formalityMatch + seasonMatch) / 3);
  return { score, reasons, colorHarmony, formalityMatch, seasonMatch };
}

export function scoreOutfit(items: Record<OutfitSlot, StyleItem | undefined>): CompatibilityResult {
  const present = SLOTS.map((s) => items[s]).filter(Boolean) as StyleItem[];
  if (present.length < 2) {
    return { score: 0, reasons: ['Add more items to score'], colorHarmony: 0, formalityMatch: 0, seasonMatch: 0 };
  }

  let totalScore = 0;
  let totalColor = 0;
  let totalFormality = 0;
  let totalSeason = 0;
  let pairCount = 0;
  const allReasons = new Set<string>();

  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const result = scoreCompatibility(present[i], present[j]);
      totalScore += result.score;
      totalColor += result.colorHarmony;
      totalFormality += result.formalityMatch;
      totalSeason += result.seasonMatch;
      pairCount++;
      result.reasons.forEach((r) => allReasons.add(r));
    }
  }

  // Completeness bonus
  const filledSlots = SLOTS.filter((s) => items[s]).length;
  const completenessBonus = filledSlots === SLOTS.length ? 10 : filledSlots >= 3 ? 5 : 0;

  return {
    score: Math.min(100, Math.round(totalScore / pairCount + completenessBonus)),
    reasons: Array.from(allReasons).slice(0, 3),
    colorHarmony: Math.round(totalColor / pairCount),
    formalityMatch: Math.round(totalFormality / pairCount),
    seasonMatch: Math.round(totalSeason / pairCount),
  };
}

export function suggestCompletion(
  currentItems: Record<OutfitSlot, StyleItem | undefined>,
  availableItems: StyleItem[]
): { slot: OutfitSlot; item: StyleItem; scoreImprovement: number } | null {
  const emptySlots = SLOTS.filter((s) => !currentItems[s]);
  if (emptySlots.length === 0) return null;

  let best: { slot: OutfitSlot; item: StyleItem; scoreImprovement: number } | null = null;

  for (const slot of emptySlots) {
    const candidates = availableItems.filter((it) => inferSlot(it) === slot);
    for (const candidate of candidates) {
      const next = { ...currentItems, [slot]: candidate };
      const currentScore = scoreOutfit(currentItems).score;
      const nextScore = scoreOutfit(next).score;
      const improvement = nextScore - currentScore;
      if (!best || improvement > best.scoreImprovement) {
        best = { slot, item: candidate, scoreImprovement: improvement };
      }
    }
  }

  return best;
}

export function generateOutfitName(items: Record<OutfitSlot, StyleItem | undefined>): string {
  const present = SLOTS.map((s) => items[s]).filter(Boolean) as StyleItem[];
  if (present.length === 0) return 'Untitled Outfit';

  const top = items.top;
  const bottom = items.bottom;
  const shoes = items.shoes;

  const formalitySum = present.reduce((sum, it) => sum + (FORMALITY_LEVEL[(it.subcategory || '').toLowerCase()] ?? 2), 0);
  const avgFormality = formalitySum / present.length;

  if (avgFormality >= 4) return `${top?.brand ?? 'Elegant'} Evening Look`;
  if (avgFormality <= 1.5) return `${top?.brand ?? 'Casual'} Street Fit`;
  if ((top?.styleTags || []).some((t) => t.toLowerCase().includes('vintage')) || (bottom?.styleTags || []).some((t) => t.toLowerCase().includes('vintage'))) {
    return 'Vintage Curated Outfit';
  }
  if (shoes && shoes.subcategory?.toLowerCase().includes('sneaker')) {
    return `${top?.brand ?? 'Sporty'} Casual Set`;
  }
  return `${top?.brand ?? bottom?.brand ?? 'Curated'} Everyday Outfit`;
}

export function createOutfit(items: Record<OutfitSlot, StyleItem | undefined>): Outfit {
  const scoreResult = scoreOutfit(items);
  return {
    id: `outfit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: generateOutfitName(items),
    items,
    score: scoreResult.score,
    tags: scoreResult.reasons,
    createdAt: Date.now(),
  };
}

export function getSlotLabel(slot: OutfitSlot): string {
  const labels: Record<OutfitSlot, string> = {
    top: 'Top',
    bottom: 'Bottom',
    shoes: 'Shoes',
    outerwear: 'Outerwear',
    accessory: 'Accessory',
  };
  return labels[slot];
}

export function getSlotIcon(slot: OutfitSlot): string {
  const icons: Record<OutfitSlot, string> = {
    top: 'shirt-outline',
    bottom: 'resize-outline',
    shoes: 'footsteps-outline',
    outerwear: 'jacket-outline',
    accessory: 'glasses-outline',
  };
  return icons[slot];
}
