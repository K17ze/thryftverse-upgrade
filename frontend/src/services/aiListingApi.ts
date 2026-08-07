/**
 * AI Listing Suggestion Service
 * ----------------------------------------------------------------------------
 * Inspired by Tilt "Snap" (AI listings from video in <1s) and Facebook
 * Marketplace "Seller" app (Meta AI fills title/description/price/category from
 * photos). This module is the contract + heuristic implementation for
 * ThryftVerse's AI-assisted listing creation.
 *
 * TRUTHFUL UI (AGENTS.md §11):
 *   The current implementation is a *heuristic/mock* service. It derives
 *   plausible suggestions from image filenames/metadata — it does NOT perform
 *   real image recognition. The confidence score is intentionally low (0.3–0.5)
 *   to honestly communicate uncertainty. Every surface that consumes these
 *   suggestions must label them "AI suggestions — please review".
 *
 * When a real vision model is wired in, replace the body of
 * `analyzeListingImages` with a network call — the contract stays the same.
 */

export interface AIListingSuggestion {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory: string;
  suggestedSubcategory?: string;
  suggestedBrand?: string;
  suggestedCondition: string;
  suggestedPriceRange: { min: number; max: number };
  suggestedPrice: number;
  suggestedTags: string[];
  /** 0–1. Mock/heuristic confidence — intentionally low (0.3–0.5). */
  confidenceScore: number;
  detectedAttributes: {
    color: string[];
    material?: string;
    style?: string;
    season?: string;
  };
}

export interface AIListingRequest {
  imageUris: string[];
  categoryHint?: string;
}

// ---------------------------------------------------------------------------
// Heuristic knowledge tables (shared shape with useListingAutofill, expanded)
// ---------------------------------------------------------------------------

const BRAND_CATEGORY_MAP: Record<string, string> = {
  nike: 'Sportswear',
  adidas: 'Sportswear',
  puma: 'Sportswear',
  reebok: 'Sportswear',
  newbalance: 'Sportswear',
  asics: 'Sportswear',
  gucci: 'Luxury',
  prada: 'Luxury',
  louisvuitton: 'Luxury',
  burberry: 'Luxury',
  balenciaga: 'Luxury',
  givenchy: 'Luxury',
  valentino: 'Luxury',
  sainlaurent: 'Luxury',
  zara: 'Women',
  hm: 'Women',
  uniqlo: 'Women',
  mango: 'Women',
  asos: 'Women',
  topshop: 'Women',
  levi: 'Men',
  wrangler: 'Men',
  carhartt: 'Men',
  patagonia: 'Men',
  northface: 'Men',
  supreme: 'Men',
  stussy: 'Men',
  palace: 'Men',
};

const BRAND_ALIASES: Record<string, string> = {
  nb: 'New Balance',
  lv: 'Louis Vuitton',
  ysl: 'Saint Laurent',
  tnf: 'North Face',
};

const KNOWN_BRANDS = [
  'Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Prada', 'Uniqlo',
  "Levi's", 'ASOS', 'Puma', 'Reebok', 'New Balance', 'Asics',
  'Louis Vuitton', 'Burberry', 'Balenciaga', 'Givenchy', 'Valentino',
  'Saint Laurent', 'Carhartt', 'Patagonia', 'North Face', 'Supreme',
  'Stussy', 'Palace', 'Mango', 'Topshop', 'Wrangler',
];

const CATEGORY_KEYWORDS: Record<string, string> = {
  dress: 'Women',
  skirt: 'Women',
  blouse: 'Women',
  heel: 'Women',
  handbag: 'Women',
  purse: 'Women',
  sneaker: 'Sportswear',
  trainer: 'Sportswear',
  boot: 'Sportswear',
  jersey: 'Sportswear',
  hoodie: 'Men',
  jacket: 'Men',
  jeans: 'Men',
  denim: 'Men',
  tee: 'Men',
  shirt: 'Men',
  watch: 'Accessories',
  bag: 'Accessories',
  belt: 'Accessories',
  hat: 'Accessories',
  cap: 'Accessories',
  sunglasses: 'Accessories',
  vintage: 'Vintage',
  retro: 'Vintage',
};

const COLOR_KEYWORDS: Record<string, string> = {
  black: 'black',
  white: 'white',
  red: 'red',
  blue: 'blue',
  navy: 'navy',
  green: 'green',
  olive: 'olive',
  grey: 'grey',
  gray: 'grey',
  brown: 'brown',
  beige: 'beige',
  cream: 'cream',
  pink: 'pink',
  yellow: 'yellow',
  orange: 'orange',
  purple: 'purple',
  burgundy: 'burgundy',
  maroon: 'burgundy',
  khaki: 'khaki',
  tan: 'tan',
};

const MATERIAL_KEYWORDS: Record<string, string> = {
  cotton: 'Cotton',
  denim: 'Denim',
  wool: 'Wool',
  silk: 'Silk',
  linen: 'Linen',
  leather: 'Leather',
  polyester: 'Polyester',
  cashmere: 'Cashmere',
  suede: 'Suede',
};

const STYLE_KEYWORDS: Record<string, string> = {
  vintage: 'Vintage',
  retro: 'Retro',
  minimalist: 'Minimalist',
  streetwear: 'Streetwear',
  classic: 'Classic',
  boho: 'Bohemian',
  formal: 'Formal',
  casual: 'Casual',
  oversized: 'Oversized',
};

const SEASON_KEYWORDS: Record<string, string> = {
  summer: 'Summer',
  winter: 'Winter',
  spring: 'Spring',
  autumn: 'Autumn',
  fall: 'Autumn',
};

const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];

// ---------------------------------------------------------------------------
// Filename extraction helpers
// ---------------------------------------------------------------------------

function extractFilename(uri: string): string {
  return uri.split('/').pop() || uri.split('\\').pop() || uri || '';
}

function extractBrandFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [alias, fullName] of Object.entries(BRAND_ALIASES)) {
    if (lower.includes(alias)) return fullName;
  }
  for (const brand of KNOWN_BRANDS) {
    const normalized = brand.toLowerCase().replace(/[^a-z]/g, '');
    if (lower.includes(normalized)) return brand;
  }
  return null;
}

function extractCategoryFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return category;
  }
  return null;
}

function extractColorsFromFilename(filename: string): string[] {
  const lower = filename.toLowerCase();
  const found: string[] = [];
  for (const [keyword, color] of Object.entries(COLOR_KEYWORDS)) {
    if (lower.includes(keyword) && !found.includes(color)) found.push(color);
  }
  return found;
}

function extractFirstMatch(
  filename: string,
  table: Record<string, string>,
): string | undefined {
  const lower = filename.toLowerCase();
  for (const [keyword, value] of Object.entries(table)) {
    if (lower.includes(keyword)) return value;
  }
  return undefined;
}

function titleCaseCategory(category: string): string {
  return category;
}

function buildSuggestedTitle(
  brand: string | null,
  category: string | null,
  colors: string[],
  style: string | undefined,
): string {
  const parts: string[] = [];
  if (style) parts.push(style);
  if (brand) parts.push(brand);
  if (colors.length > 0) {
    parts.push(colors.slice(0, 2).join(' & '));
  }
  if (category) {
    const catLower = category.toLowerCase();
    parts.push(catLower);
  }
  if (parts.length === 0) return 'Untitled item';
  // e.g. "Vintage Nike black & white sportswear item"
  return `${parts.join(' ')} item`;
}

function buildSuggestedDescription(
  brand: string | null,
  category: string | null,
  colors: string[],
  material: string | undefined,
  style: string | undefined,
  season: string | undefined,
  condition: string,
): string {
  const lines: string[] = [];
  const subject = [brand, category ? category.toLowerCase() : null]
    .filter(Boolean)
    .join(' ');
  lines.push(
    subject
      ? `${subject.charAt(0).toUpperCase()}${subject.slice(1)} in ${condition.toLowerCase()} condition.`
      : `Item in ${condition.toLowerCase()} condition.`,
  );
  const attrFragments: string[] = [];
  if (colors.length > 0) attrFragments.push(`Colour: ${colors.join(', ')}`);
  if (material) attrFragments.push(`Material: ${material}`);
  if (style) attrFragments.push(`Style: ${style}`);
  if (season) attrFragments.push(`Season: ${season}`);
  if (attrFragments.length > 0) lines.push(attrFragments.join(' · '));
  lines.push('Please review all details before publishing — AI suggestions may be inaccurate.');
  return lines.join('\n');
}

function estimatePriceRange(
  category: string | null,
  brand: string | null,
): { min: number; max: number; price: number } {
  // Very rough resale heuristic — clearly mock.
  const isLuxury = brand ? BRAND_CATEGORY_MAP[brand.toLowerCase().replace(/[^a-z]/g, '')] === 'Luxury' : false;
  if (isLuxury) {
    const price = 180;
    return { min: 120, max: 350, price };
  }
  if (category === 'Luxury') {
    return { min: 100, max: 300, price: 150 };
  }
  if (category === 'Sportswear') {
    return { min: 20, max: 80, price: 40 };
  }
  if (category === 'Vintage') {
    return { min: 15, max: 60, price: 30 };
  }
  if (category === 'Accessories') {
    return { min: 10, max: 70, price: 25 };
  }
  // Women / Men / default
  return { min: 8, max: 45, price: 18 };
}

function buildSuggestedTags(
  brand: string | null,
  category: string | null,
  colors: string[],
  style: string | undefined,
  season: string | undefined,
): string[] {
  const tags = new Set<string>();
  if (brand) tags.add(brand.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (category) tags.add(category.toLowerCase());
  colors.forEach((c) => tags.add(c.toLowerCase()));
  if (style) tags.add(style.toLowerCase());
  if (season) tags.add(season.toLowerCase());
  tags.add('resale');
  tags.add('thryftverse');
  return Array.from(tags).slice(0, 8);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze listing images and return AI-suggested listing fields.
 *
 * CURRENT IMPLEMENTATION: heuristic/mock. Derives suggestions from image
 * filenames/metadata. No image recognition is performed. Confidence is
 * intentionally low (0.3–0.5) to honestly reflect this.
 *
 * Simulates a brief network/analysis delay so loading states render naturally.
 */
export async function analyzeListingImages(
  request: AIListingRequest,
): Promise<AIListingSuggestion> {
  if (!request.imageUris || request.imageUris.length === 0) {
    throw new Error('At least one image is required for AI analysis.');
  }

  // Simulated analysis latency (so the scanning animation is meaningful).
  await new Promise((resolve) => setTimeout(resolve, 900));

  const firstFilename = extractFilename(request.imageUris[0]);
  const allFilenames = request.imageUris.map(extractFilename).join(' ');

  const brand = extractBrandFromFilename(firstFilename);
  const categoryFromFilename = extractCategoryFromFilename(firstFilename);
  const categoryFromBrand = brand
    ? BRAND_CATEGORY_MAP[brand.toLowerCase().replace(/[^a-z]/g, '')] ?? null
    : null;
  const category =
    request.categoryHint ||
    categoryFromFilename ||
    categoryFromBrand ||
    'Women';

  const colors = extractColorsFromFilename(allFilenames);
  const material = extractFirstMatch(allFilenames, MATERIAL_KEYWORDS);
  const style = extractFirstMatch(allFilenames, STYLE_KEYWORDS);
  const season = extractFirstMatch(allFilenames, SEASON_KEYWORDS);

  // Condition cannot be inferred from a photo filename — default to a
  // conservative, commonly-safe resale condition. Marked as a suggestion.
  const condition = 'Very good';

  const priceBand = estimatePriceRange(category, brand);

  const title = buildSuggestedTitle(brand, category, colors, style);
  const description = buildSuggestedDescription(
    brand,
    category,
    colors,
    material,
    style,
    season,
    condition,
  );
  const tags = buildSuggestedTags(brand, category, colors, style, season);

  // Confidence: how many heuristic signals fired, scaled into 0.3–0.5.
  const signals = [brand, categoryFromFilename, colors.length > 0, material, style, season].filter(
    Boolean,
  ).length;
  const confidence = Math.min(0.5, 0.3 + signals * 0.035);

  return {
    suggestedTitle: title,
    suggestedDescription: description,
    suggestedCategory: titleCaseCategory(category),
    suggestedSubcategory: undefined,
    suggestedBrand: brand ?? undefined,
    suggestedCondition: condition,
    suggestedPriceRange: { min: priceBand.min, max: priceBand.max },
    suggestedPrice: priceBand.price,
    suggestedTags: tags,
    confidenceScore: Number(confidence.toFixed(2)),
    detectedAttributes: {
      color: colors,
      material,
      style,
      season,
    },
  };
}
