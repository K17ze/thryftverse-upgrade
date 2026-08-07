/**
 * Sustainability Score — heuristic, client-side estimate for ThryftVerse listings.
 *
 * TRUTHFUL LABELING (AGENTS.md §11): Every value this module produces is an
 * *estimate*, not a precise scientific measurement. CO2 and water figures are
 * industry-average approximations scaled by category, and the grade is a
 * heuristic composite of listing attributes. All copy surfaced to the user
 * must say "Estimated impact" — never "measured" or "verified".
 *
 * The score is computed purely from listing data already on the client
 * (condition, category, brand, seller location, co-own eligibility). No
 * backend call is required.
 *
 * Sources for the averages used:
 *  - New garment average: ~8 kg CO2e and ~2,900 L water (industry literature,
 *    e.g. WRAP UK / ThredUp resale reports).
 *  - Resale is estimated to displace ~60% of that new-production footprint.
 */

export interface SustainabilityFactor {
  label: string;
  value: string;
  positive: boolean;
}

export interface SustainabilityScore {
  grade: 'A' | 'B' | 'C' | 'D';
  score: number; // 0-100
  factors: SustainabilityFactor[];
  /** Estimated CO2 saved vs buying new, in kilograms. */
  co2SavedKg: number;
  /** Estimated water saved vs buying new, in liters. */
  waterSavedL: number;
  summary: string;
}

/**
 * Input shape — deliberately a narrow structural view so the utility can accept
 * a `Listing`, `DisplayReadyListing`, or any partial record without coupling to
 * a single data contract.
 */
export interface SustainabilityInput {
  condition?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  /** Seller location string (free text, e.g. "London, UK"). */
  sellerLocation?: string | null;
  /** Buyer location string used for the local-seller heuristic. */
  buyerLocation?: string | null;
  /** Whether the item supports fractional / co-ownership. */
  coOwnEligible?: boolean;
}

// ── Brand list ──────────────────────────────────────────────────────────────
// A small, deliberately curated set of brands with public sustainability
// commitments. Kept short so the heuristic stays truthful and maintainable.
const SUSTAINABLE_BRANDS: ReadonlySet<string> = new Set(
  [
    'patagonia',
    'eileen fisher',
    'reformation',
    'everlane',
    'kotn',
    'tentree',
    'allbirds',
    'veja',
    'stella mccartney',
    'ganni',
    "levi's",
    'levis',
    'outerknown',
    'people tree',
    'thought',
    'mud jeans',
    'girlfriend collective',
    'pangaia',
    'christy dawn',
    'mara hoffman',
  ].map((b) => b.toLowerCase()),
);

// ── Category keyword buckets ────────────────────────────────────────────────
// Matched against the combined category + subcategory text (lowercased).
const HIGH_IMPACT_CATEGORIES = [
  'dress', 'dresses', 'jean', 'jeans', 'jacket', 'jackets',
  'coat', 'coats', 'outerwear', 'blazer', 'blazers', 'suit', 'suits',
  'knitwear', 'jumper', 'jumpers', 'sweater', 'sweaters',
];
const MID_IMPACT_CATEGORIES = [
  'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots',
  'accessor', 'accessories', 'bag', 'bags', 'jewel', 'jewellery',
  'jewelry', 'hat', 'hats', 'belt', 'belts', 'scarf', 'scarves',
  'watch', 'watches', 'sunglass',
];
const LOW_IMPACT_CATEGORIES = [
  'home', 'electronics', 'tech', 'device', 'furniture', 'kitchen',
  'decor', 'appliance',
];

// ── Category weight factor for CO2 / water scaling ──────────────────────────
// Clothing is the baseline (1.0). Home/electronics carry a heavier new-production
// footprint so resale displaces more in absolute terms.
type CategoryTier = 'high' | 'mid' | 'low' | 'unknown';
const CATEGORY_WEIGHT: Record<CategoryTier, number> = {
  high: 1.0,
  mid: 0.7,
  low: 1.4,
  unknown: 1.0,
};

// ── New-production footprint averages ───────────────────────────────────────
const NEW_CO2_KG = 8; // kg CO2e for an average new garment
const NEW_WATER_L = 2900; // liters of water for an average new garment
const RESALE_SAVINGS_RATIO = 0.6; // resale displaces ~60% of new footprint

function lower(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function classifyCategory(category: string, subcategory?: string | null): CategoryTier {
  const haystack = `${category} ${subcategory ?? ''}`.toLowerCase();
  if (HIGH_IMPACT_CATEGORIES.some((kw) => haystack.includes(kw))) return 'high';
  if (MID_IMPACT_CATEGORIES.some((kw) => haystack.includes(kw))) return 'mid';
  if (LOW_IMPACT_CATEGORIES.some((kw) => haystack.includes(kw))) return 'low';
  return 'unknown';
}

function conditionPoints(condition: string): { points: number; label: string } {
  const c = condition.toLowerCase();
  // Extending the life of an item is the point of resale — even lower
  // conditions score well because keeping it in circulation beats landfill.
  if (c.includes('new with tags') || c.includes('new-with-tags')) {
    return { points: 20, label: 'New with tags' };
  }
  if (c.includes('new without tags') || c.includes('new-without-tags') || c.includes('new other')) {
    return { points: 20, label: 'New without tags' };
  }
  if (c.includes('very good') || c.includes('very-good')) {
    return { points: 25, label: 'Very good' };
  }
  if (c.includes('good')) {
    return { points: 20, label: 'Good' };
  }
  if (c.includes('satisfactory') || c.includes('fair')) {
    return { points: 15, label: 'Fair' };
  }
  if (c.includes('poor') || c.includes('worn')) {
    return { points: 10, label: 'Poor' };
  }
  return { points: 15, label: condition };
}

function categoryPoints(tier: CategoryTier): { points: number; label: string } {
  switch (tier) {
    case 'high':
      return { points: 20, label: 'High-impact category' };
    case 'mid':
      return { points: 15, label: 'Mid-impact category' };
    case 'low':
      return { points: 10, label: 'Lower-impact category' };
    default:
      return { points: 10, label: 'General category' };
  }
}

function extractCountry(location: string): string | null {
  const trimmed = location.trim();
  if (!trimmed) return null;
  // "City, Country" → take the last comma segment.
  const commaIdx = trimmed.lastIndexOf(',');
  if (commaIdx >= 0) {
    const country = trimmed.slice(commaIdx + 1).trim();
    return country || null;
  }
  // No comma — treat the whole token as the country/region.
  return trimmed;
}

function isLocalSeller(sellerLocation: string | null, buyerLocation: string | null): boolean {
  if (!sellerLocation || !buyerLocation) return false;
  const sellerCountry = extractCountry(sellerLocation);
  const buyerCountry = extractCountry(buyerLocation);
  if (!sellerCountry || !buyerCountry) return false;
  return sellerCountry.toLowerCase() === buyerCountry.toLowerCase();
}

function isSustainableBrand(brand: string | null): boolean {
  if (!brand) return false;
  return SUSTAINABLE_BRANDS.has(brand.trim().toLowerCase());
}

function gradeForScore(score: number): SustainabilityScore['grade'] {
  if (score >= 60) return 'A';
  if (score >= 40) return 'B';
  if (score >= 20) return 'C';
  return 'D';
}

/**
 * Compute a heuristic sustainability score for a listing.
 *
 * Returns a `SustainabilityScore` with a 0–100 composite, an A–D grade, a
 * transparent factor breakdown, and estimated CO2 / water savings. All figures
 * are estimates derived from listing attributes and industry averages.
 */
export function computeSustainabilityScore(
  input: SustainabilityInput,
): SustainabilityScore {
  const condition = lower(input.condition);
  const category = lower(input.category);
  const subcategory = lower(input.subcategory);
  const brand = input.brand ?? null;

  const factors: SustainabilityFactor[] = [];
  let score = 0;

  // Condition
  if (condition) {
    const { points, label } = conditionPoints(condition);
    score += points;
    factors.push({
      label: 'Condition',
      value: label,
      positive: true,
    });
  }

  // Category
  const tier = classifyCategory(category, subcategory);
  const { points: catPoints, label: catLabel } = categoryPoints(tier);
  score += catPoints;
  factors.push({
    label: 'Category impact',
    value: catLabel,
    positive: true,
  });

  // Local seller
  const local = isLocalSeller(input.sellerLocation ?? null, input.buyerLocation ?? null);
  if (local) {
    score += 15;
    factors.push({
      label: 'Local seller',
      value: 'Reduced shipping emissions',
      positive: true,
    });
  }

  // Co-Own eligible
  if (input.coOwnEligible) {
    score += 10;
    factors.push({
      label: 'Co-Own eligible',
      value: 'Shared consumption',
      positive: true,
    });
  }

  // Sustainable brand
  if (isSustainableBrand(brand)) {
    score += 15;
    factors.push({
      label: 'Sustainable brand',
      value: brand as string,
      positive: true,
    });
  }

  // Cap at 100 — the composite can exceed it when every factor aligns.
  const clampedScore = Math.min(100, Math.max(0, score));
  const grade = gradeForScore(clampedScore);

  // CO2 / water estimates — scaled by category weight factor.
  const weight = CATEGORY_WEIGHT[tier];
  const co2SavedKg = Math.round((NEW_CO2_KG * RESALE_SAVINGS_RATIO * weight) * 10) / 10;
  const waterSavedL = Math.round(NEW_WATER_L * RESALE_SAVINGS_RATIO * weight);

  const summary = `Buying this pre-owned item saves ~${co2SavedKg} kg CO2 and ~${waterSavedL.toLocaleString('en-GB')} liters of water vs buying new.`;

  return {
    grade,
    score: clampedScore,
    factors,
    co2SavedKg,
    waterSavedL,
    summary,
  };
}

/**
 * Convenience predicate for the "Sustainable" browse filter — true when the
 * computed grade is A or B. Kept here so the filter and the card chip agree.
 */
export function isSustainableGrade(input: SustainabilityInput): boolean {
  const { grade } = computeSustainabilityScore(input);
  return grade === 'A' || grade === 'B';
}
