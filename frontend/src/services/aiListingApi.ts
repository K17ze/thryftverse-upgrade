/**
 * Listing Intelligence Service — field-level advisory suggestions
 * ----------------------------------------------------------------------------
 * This service produces *advisory* field candidates with evidence and
 * abstention. It never authoritatively sets any field. The caller must
 * present each candidate for explicit seller review (accept / edit / reject).
 *
 * TRUTH PRINCIPLES (AGENTS.md):
 *   - Condition is never inferred. It always abstains and requests seller
 *     attestation. Condition is material to buyer decisions and disputes.
 *   - Category never defaults to a gendered value. When no evidence exists,
 *     the field abstains rather than assuming "Women".
 *   - No aggregate confidence score. Evidence kind and source tell the
 *     story; a signal count dressed as a probability is pseudo-confidence.
 *   - No field is auto-applied. The caller owns the form; this service
 *     only produces candidates.
 *
 * CURRENT IMPLEMENTATION: heuristic. Derives candidates from image filenames
 * and seller hints. No image recognition is performed. Every candidate
 * carries evidence so the seller can judge its reliability.
 *
 * When a real vision/OCR/catalog model is wired in, replace the body of
 * `analyzeListingImages` with a network call — the contract stays the same.
 */

// ---------------------------------------------------------------------------
// Contract — field-level suggestions with evidence
// ---------------------------------------------------------------------------

/** Listing fields that can receive advisory candidates. */
export type ListingField =
  | 'title'
  | 'description'
  | 'category'
  | 'brand'
  | 'condition'
  | 'price'
  | 'tags'
  | 'color'
  | 'material'
  | 'style'
  | 'season';

/** Where a candidate's evidence came from. */
export type EvidenceKind =
  | 'filename'
  | 'seller_hint'
  | 'catalog'
  | 'ocr'
  | 'barcode'
  | 'visual';

/** A single piece of evidence supporting a candidate. */
export interface FieldEvidence {
  kind: EvidenceKind;
  /** Human-readable source description, e.g. "From photo filename". */
  ref: string;
}

/**
 * A single field suggestion. When `abstained` is true, `candidate` is null
 * and `reason` explains what the seller needs to provide.
 */
export interface FieldSuggestion {
  field: ListingField;
  /** The suggested value, or null when abstained. */
  candidate: string | string[] | { min: number; max: number } | null;
  /** Evidence supporting this candidate. Empty when abstained. */
  evidence: FieldEvidence[];
  /** True when the system cannot infer this field and needs seller input. */
  abstained: boolean;
  /** Plain-language explanation of why this was suggested or why it abstained. */
  reason: string;
}

/** Price guidance with provenance — a range, not a single confident number. */
export interface PriceGuidance {
  min: number;
  max: number;
  currency: 'GBP';
  /** What the range is based on, e.g. "Category resale averages". */
  basis: string;
}

/** Result of analyzing listing images. No aggregate confidence score. */
export interface ListingSuggestionResult {
  runId: string;
  fields: FieldSuggestion[];
  priceGuidance?: PriceGuidance;
}

export interface AIListingRequest {
  imageUris: string[];
  categoryHint?: string;
}

// ---------------------------------------------------------------------------
// Heuristic knowledge tables
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

// ---------------------------------------------------------------------------
// Candidate builders — each returns a FieldSuggestion with evidence
// ---------------------------------------------------------------------------

function filenameEvidence(ref: string): FieldEvidence {
  return { kind: 'filename', ref };
}

function sellerHintEvidence(ref: string): FieldEvidence {
  return { kind: 'seller_hint', ref };
}

function buildTitleCandidate(
  brand: string | null,
  category: string | null,
  colors: string[],
  style: string | undefined,
  hasFilenameEvidence: boolean,
): FieldSuggestion {
  const parts: string[] = [];
  if (style) parts.push(style);
  if (brand) parts.push(brand);
  if (colors.length > 0) parts.push(colors.slice(0, 2).join(' & '));
  if (category) parts.push(category.toLowerCase());

  if (parts.length === 0) {
    return {
      field: 'title',
      candidate: null,
      evidence: [],
      abstained: true,
      reason: 'Add a title with the brand, item type, and key details.',
    };
  }

  const evidence: FieldEvidence[] = [];
  if (hasFilenameEvidence) evidence.push(filenameEvidence('From photo filename'));

  return {
    field: 'title',
    candidate: `${parts.join(' ')} item`,
    evidence,
    abstained: false,
    reason: 'Drafted from details found in the photo filename.',
  };
}

function buildDescriptionCandidate(
  brand: string | null,
  category: string | null,
  colors: string[],
  material: string | undefined,
  style: string | undefined,
  season: string | undefined,
  hasFilenameEvidence: boolean,
): FieldSuggestion {
  const subject = [brand, category ? category.toLowerCase() : null]
    .filter(Boolean)
    .join(' ');

  if (!subject && colors.length === 0 && !material) {
    return {
      field: 'description',
      candidate: null,
      evidence: [],
      abstained: true,
      reason: 'Describe the item condition, fit, material, and any flaws.',
    };
  }

  const lines: string[] = [];
  lines.push(
    subject
      ? `${subject.charAt(0).toUpperCase()}${subject.slice(1)}.`
      : 'Item for sale.',
  );
  const attrFragments: string[] = [];
  if (colors.length > 0) attrFragments.push(`Colour: ${colors.join(', ')}`);
  if (material) attrFragments.push(`Material: ${material}`);
  if (style) attrFragments.push(`Style: ${style}`);
  if (season) attrFragments.push(`Season: ${season}`);
  if (attrFragments.length > 0) lines.push(attrFragments.join(' · '));

  const evidence: FieldEvidence[] = [];
  if (hasFilenameEvidence) evidence.push(filenameEvidence('From photo filename'));

  return {
    field: 'description',
    candidate: lines.join('\n'),
    evidence,
    abstained: false,
    reason: 'Drafted from details found in the photo filename. Add condition and measurements.',
  };
}

function buildCategoryCandidate(
  categoryHint: string | undefined,
  categoryFromFilename: string | null,
  categoryFromBrand: string | null,
): FieldSuggestion {
  // Prefer seller hint, then filename, then brand. Never default to a
  // gendered category — abstain when no evidence exists.
  if (categoryHint) {
    return {
      field: 'category',
      candidate: categoryHint,
      evidence: [sellerHintEvidence('Seller-provided category hint')],
      abstained: false,
      reason: 'From your category selection.',
    };
  }
  if (categoryFromFilename) {
    return {
      field: 'category',
      candidate: categoryFromFilename,
      evidence: [filenameEvidence('Keyword in photo filename')],
      abstained: false,
      reason: 'Matched a category keyword in the photo filename.',
    };
  }
  if (categoryFromBrand) {
    return {
      field: 'category',
      candidate: categoryFromBrand,
      evidence: [filenameEvidence('Brand-to-category mapping')],
      abstained: false,
      reason: 'Inferred from the detected brand.',
    };
  }
  return {
    field: 'category',
    candidate: null,
    evidence: [],
    abstained: true,
    reason: 'Select a category so buyers can find your item.',
  };
}

function buildBrandCandidate(brand: string | null): FieldSuggestion {
  if (!brand) {
    return {
      field: 'brand',
      candidate: null,
      evidence: [],
      abstained: true,
      reason: 'Add the brand if known. Leave blank for unbranded items.',
    };
  }
  return {
    field: 'brand',
    candidate: brand,
    evidence: [filenameEvidence('Brand name in photo filename')],
    abstained: false,
    reason: 'Found a known brand name in the photo filename.',
  };
}

function buildConditionCandidate(): FieldSuggestion {
  // Condition is NEVER inferred. It always abstains and requires seller
  // attestation. This is a P0 truth principle — condition is material to
  // buyer decisions, returns, and disputes.
  return {
    field: 'condition',
    candidate: null,
    evidence: [],
    abstained: true,
    reason: 'Condition must be confirmed by you. Select the condition that matches your item.',
  };
}

function buildPriceGuidance(
  category: string | null,
  brand: string | null,
): PriceGuidance | undefined {
  if (!category && !brand) return undefined;

  const isLuxury = brand
    ? BRAND_CATEGORY_MAP[brand.toLowerCase().replace(/[^a-z]/g, '')] === 'Luxury'
    : false;

  if (isLuxury || category === 'Luxury') {
    return {
      min: 100,
      max: 300,
      currency: 'GBP',
      basis: 'Luxury resale averages — varies heavily by brand and condition',
    };
  }
  if (category === 'Sportswear') {
    return {
      min: 20,
      max: 80,
      currency: 'GBP',
      basis: 'Sportswear resale averages',
    };
  }
  if (category === 'Vintage') {
    return {
      min: 15,
      max: 60,
      currency: 'GBP',
      basis: 'Vintage resale averages',
    };
  }
  if (category === 'Accessories') {
    return {
      min: 10,
      max: 70,
      currency: 'GBP',
      basis: 'Accessories resale averages',
    };
  }
  return {
    min: 8,
    max: 45,
    currency: 'GBP',
    basis: 'General resale averages',
  };
}

function buildTagsCandidate(
  brand: string | null,
  category: string | null,
  colors: string[],
  style: string | undefined,
  season: string | undefined,
  hasFilenameEvidence: boolean,
): FieldSuggestion {
  const tags = new Set<string>();
  if (brand) tags.add(brand.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (category) tags.add(category.toLowerCase());
  colors.forEach((c) => tags.add(c.toLowerCase()));
  if (style) tags.add(style.toLowerCase());
  if (season) tags.add(season.toLowerCase());

  if (tags.size === 0) {
    return {
      field: 'tags',
      candidate: null,
      evidence: [],
      abstained: true,
      reason: 'Add tags to help buyers find your item.',
    };
  }

  const evidence: FieldEvidence[] = [];
  if (hasFilenameEvidence) evidence.push(filenameEvidence('From photo filename'));

  return {
    field: 'tags',
    candidate: Array.from(tags).slice(0, 8),
    evidence,
    abstained: false,
    reason: 'Suggested from detected details.',
  };
}

function buildAttributeCandidate(
  field: ListingField,
  value: string | undefined,
  label: string,
): FieldSuggestion {
  if (!value) {
    return {
      field,
      candidate: null,
      evidence: [],
      abstained: true,
      reason: `Add ${label} if relevant.`,
    };
  }
  return {
    field,
    candidate: value,
    evidence: [filenameEvidence(`Keyword in photo filename`)],
    abstained: false,
    reason: `Found "${value}" in the photo filename.`,
  };
}

function buildColorCandidate(colors: string[]): FieldSuggestion {
  if (colors.length === 0) {
    return {
      field: 'color',
      candidate: null,
      evidence: [],
      abstained: true,
      reason: 'Add the item colour if not obvious from photos.',
    };
  }
  return {
    field: 'color',
    candidate: colors,
    evidence: [filenameEvidence('Colour keywords in photo filename')],
    abstained: false,
    reason: 'Found colour keywords in the photo filename.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze listing images and return field-level advisory candidates.
 *
 * BACKEND INTEGRATION (August 2026):
 *   The backend now exposes POST /listing-intelligence/run which performs
 *   the same field-level heuristic analysis server-side, persists the run
 *   for audit, and returns candidates with evidence and abstention.
 *
 *   This function first attempts the backend call. If the backend is
 *   unreachable or returns an error, it falls back to the local heuristic
 *   so the seller is never blocked. The `runId` from the backend is a
 *   durable audit reference; the local fallback generates an ephemeral ID.
 *
 * Condition is always abstained — it requires seller attestation.
 * Category never defaults to a gendered value — it abstains when unknown.
 * No aggregate confidence score is produced.
 */
export async function analyzeListingImages(
  request: AIListingRequest,
): Promise<ListingSuggestionResult> {
  if (!request.imageUris || request.imageUris.length === 0) {
    throw new Error('At least one image is required for analysis.');
  }

  // Attempt the backend listing intelligence endpoint first.
  try {
    const backendResult = await analyzeListingImagesBackend(request);
    return backendResult;
  } catch {
    // Fall through to local heuristic. The backend may be unreachable or
    // the endpoint may not be deployed yet. The seller is never blocked.
  }

  return analyzeListingImagesHeuristic(request);
}

/**
 * Call the backend listing intelligence endpoint.
 */
async function analyzeListingImagesBackend(
  request: AIListingRequest,
): Promise<ListingSuggestionResult> {
  const { fetchJson } = await import('../lib/apiClient');
  const firstFilename = extractFilename(request.imageUris[0]);

  const body = await fetchJson<{
    ok: boolean;
    run: {
      id: string;
      listingId: string | null;
      candidates: Array<{
        field: string;
        value: string;
        evidence: { source: string; detail: string };
        abstained: boolean;
      }>;
      version: string;
      createdAt: string;
    };
    error?: string;
  }>('/listing-intelligence/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photos: request.imageUris.slice(0, 20).map((uri, idx) => ({
        id: `photo_${idx}`,
        url: uri,
      })),
      filename: firstFilename || undefined,
      categoryHint: request.categoryHint,
    }),
  });

  if (!body.ok || !body.run) {
    throw new Error(body.error ?? 'Backend listing intelligence call failed');
  }

  // Map the backend candidate format to the frontend FieldSuggestion format.
  const fields: FieldSuggestion[] = body.run.candidates.map((c) => {
    const field = c.field as ListingField;
    const evidenceKind = c.evidence.source as EvidenceKind;
    return {
      field,
      candidate: c.abstained ? null : c.value,
      evidence: c.abstained ? [] : [{ kind: evidenceKind, ref: c.evidence.detail }],
      abstained: c.abstained,
      reason: c.abstained
        ? `No evidence found — please provide ${field}.`
        : c.evidence.detail,
    };
  });

  // The backend does not produce price guidance (it requires market data
  // not available in the heuristic endpoint). Compute it locally.
  const brand = fields.find((f) => f.field === 'brand' && !f.abstained)?.candidate as string | null;
  const category = fields.find((f) => f.field === 'category' && !f.abstained)?.candidate as string | null;
  const priceGuidance = buildPriceGuidance(category, brand);

  return {
    runId: body.run.id,
    fields,
    priceGuidance,
  };
}

/**
 * Local heuristic fallback — derives candidates from image filenames
 * and seller hints. Used when the backend is unreachable.
 */
async function analyzeListingImagesHeuristic(
  request: AIListingRequest,
): Promise<ListingSuggestionResult> {
  // Simulated analysis latency so loading states render naturally.
  await new Promise((resolve) => setTimeout(resolve, 900));

  const firstFilename = extractFilename(request.imageUris[0]);
  const allFilenames = request.imageUris.map(extractFilename).join(' ');

  const brand = extractBrandFromFilename(firstFilename);
  const categoryFromFilename = extractCategoryFromFilename(firstFilename);
  const categoryFromBrand = brand
    ? BRAND_CATEGORY_MAP[brand.toLowerCase().replace(/[^a-z]/g, '')] ?? null
    : null;

  const colors = extractColorsFromFilename(allFilenames);
  const material = extractFirstMatch(allFilenames, MATERIAL_KEYWORDS);
  const style = extractFirstMatch(allFilenames, STYLE_KEYWORDS);
  const season = extractFirstMatch(allFilenames, SEASON_KEYWORDS);

  const hasFilenameEvidence =
    Boolean(brand) ||
    Boolean(categoryFromFilename) ||
    colors.length > 0 ||
    Boolean(material) ||
    Boolean(style) ||
    Boolean(season);

  // Resolve the best category for price guidance (without defaulting the
  // category field itself to a gendered value).
  const resolvedCategory =
    request.categoryHint || categoryFromFilename || categoryFromBrand || null;

  const fields: FieldSuggestion[] = [
    buildTitleCandidate(brand, resolvedCategory, colors, style, hasFilenameEvidence),
    buildDescriptionCandidate(brand, resolvedCategory, colors, material, style, season, hasFilenameEvidence),
    buildCategoryCandidate(request.categoryHint, categoryFromFilename, categoryFromBrand),
    buildBrandCandidate(brand),
    buildConditionCandidate(),
    buildTagsCandidate(brand, resolvedCategory, colors, style, season, hasFilenameEvidence),
    buildColorCandidate(colors),
    buildAttributeCandidate('material', material, 'material'),
    buildAttributeCandidate('style', style, 'style'),
    buildAttributeCandidate('season', season, 'season'),
  ];

  const priceGuidance = buildPriceGuidance(resolvedCategory, brand);

  return {
    runId: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fields,
    priceGuidance,
  };
}
