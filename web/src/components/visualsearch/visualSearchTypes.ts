/**
 * Shared types + vocabulary for the web visual search surface.
 * Mirrors frontend/src/components/visualsearch/visualSearchTypes.ts — one
 * source of truth so the page, components and the useVisualSearch hook all
 * agree on the retrieval contract.
 *
 * Fixture-mode honesty: matching here is a deterministic colour-and-keyword
 * heuristic, not AI. The mobile product labels the same approach
 * `heuristic_color_features`; the UI copy says so too.
 */

/** Status machine — mirrors mobile ResultStatus minus offline/partial
 *  (fixture mode has no network leg, so those states can't occur). */
export type VisualSearchStatus =
  | 'idle'
  | 'analyzing'
  | 'populated'
  | 'empty'
  | 'error';

/** Progress steps inside 'analyzing' — real work, honest labels. */
export type AnalysisPhase = 'reading' | 'extracting' | 'matching';

export const ANALYSIS_PHASE_LABEL: Record<AnalysisPhase, string> = {
  reading: 'Reading photo',
  extracting: 'Extracting colour features',
  matching: 'Matching listings',
};

/** Region-of-interest on the query image — normalised [0,1] fractions.
 *  Same contract as mobile's VisualSearchRegion. */
export interface VisualSearchRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum region edge — same 4% contract as the backend/mobile cropper. */
export const MIN_REGION_FRACTION = 0.04;
/** Tap without a drag lands a focus box this size, centred on the tap. */
export const TAP_FOCUS_FRACTION = 0.42;

/** Upload constraints — validated before a blob URL is ever created. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export type VisualSearchErrorKind = 'unsupported' | 'too-large' | 'decode' | 'unreachable';

export const ERROR_COPY: Record<VisualSearchErrorKind, { title: string; body: string }> = {
  unsupported: {
    title: 'Unsupported file',
    body: 'Choose a JPG, PNG, WebP or AVIF photo.',
  },
  'too-large': {
    title: 'Photo too large',
    body: 'Choose a photo under 8 MB.',
  },
  decode: {
    title: "Couldn't read that photo",
    body: 'The file looks corrupted — try a different one.',
  },
  unreachable: {
    title: "Couldn't load that image",
    body: 'The link may be private or blocked — save the photo and upload it instead.',
  },
};

/** One detected attribute = one removable refinement chip. */
export interface DetectedAttribute {
  kind: 'color' | 'category' | 'brand';
  /** Machine value matched against listing fields (lowercase). */
  value: string;
  /** Display label on the chip. */
  label: string;
  /** Where the cue came from — the UI can label the guess honestly. */
  source: 'image' | 'filename' | 'results';
  /** For colour chips: the detected swatch. */
  rgb?: [number, number, number];
}

/** Compact feature vector extracted from the uploaded photo on-device. */
export interface ImageFeatures {
  /** Mean RGB of the dominant colour cluster. */
  rgb: [number, number, number];
  /** Nearest vocabulary colour name. */
  colorName: string;
  /** 0..1 — distance of the detected RGB to the named colour. */
  colorConfidence: number;
  /** Mean luminance (Rec. 601), 0..1. */
  luminance: number;
  /** Stddev of luminance normalised to [0,1]. */
  contrast: number;
  /** Mean saturation (simple max-channel heuristic), 0..1. */
  saturation: number;
  /** width / height of the scored area (region when cropped). */
  aspectRatio: number;
}

/**
 * Colour vocabulary — the fixture catalogue's own colour words with
 * canonical RGB anchors. Matching scores the distance between the photo's
 * dominant colour and each colour a listing actually names in its text.
 * Mirrors the spirit of mobile COLOR_FACETS, extended with the words the
 * catalogue genuinely uses (camel, taupe, indigo, sage…).
 */
export interface VocabColor {
  name: string;
  rgb: [number, number, number];
  aliases: string[];
}

export const COLOR_VOCAB: VocabColor[] = [
  { name: 'Black', rgb: [28, 28, 30], aliases: ['black', 'noir'] },
  { name: 'Charcoal', rgb: [54, 56, 62], aliases: ['charcoal'] },
  { name: 'White', rgb: [238, 238, 233], aliases: ['white', 'cloud white'] },
  { name: 'Cream', rgb: [240, 228, 200], aliases: ['cream', 'ivory', 'ecru', 'oatmeal', 'off-white'] },
  { name: 'Beige', rgb: [208, 188, 158], aliases: ['beige', 'sand', 'stone'] },
  { name: 'Camel', rgb: [188, 148, 96], aliases: ['camel', 'tan', 'saddle'] },
  { name: 'Brown', rgb: [104, 72, 48], aliases: ['brown', 'chocolate', 'espresso', 'taupe'] },
  { name: 'Navy', rgb: [24, 32, 68], aliases: ['navy'] },
  { name: 'Blue', rgb: [64, 96, 160], aliases: ['blue', 'denim', 'indigo', 'cobalt'] },
  { name: 'Red', rgb: [168, 44, 44], aliases: ['red', 'chicago colourway', 'scarlet'] },
  { name: 'Burgundy', rgb: [104, 32, 46], aliases: ['burgundy', 'maroon', 'bordeaux', 'wine'] },
  { name: 'Green', rgb: [76, 108, 72], aliases: ['green', 'forest'] },
  { name: 'Sage', rgb: [142, 152, 126], aliases: ['sage', 'khaki'] },
  { name: 'Olive', rgb: [102, 102, 58], aliases: ['olive'] },
  { name: 'Grey', rgb: [130, 130, 130], aliases: ['grey', 'gray', 'heather'] },
  { name: 'Pink', rgb: [222, 168, 178], aliases: ['pink', 'blush', 'rose'] },
  { name: 'Yellow', rgb: [214, 182, 82], aliases: ['yellow', 'mustard', 'gold'] },
  { name: 'Purple', rgb: [104, 76, 132], aliases: ['purple', 'lilac', 'violet'] },
  { name: 'Orange', rgb: [208, 118, 52], aliases: ['orange', 'rust', 'burnt orange'] },
];

/**
 * Manual refinement facets — the member-supplied filters the mobile
 * visual-search panel offers (G11/F08). These lists are the shared
 * vocabulary contract with the backend (COLOR_FACET_VALUES /
 * STYLE_FACET_VALUES in routes/visualSearch.ts) — subset of COLOR_VOCAB
 * for colour, the backend's own style words for style. Mirrors
 * frontend/src/components/visualsearch/visualSearchTypes.ts.
 */
export const COLOR_FACETS = [
  'Black',
  'White',
  'Blue',
  'Red',
  'Green',
  'Brown',
  'Grey',
  'Pink',
  'Beige',
  'Navy',
] as const;

export const STYLE_FACETS = [
  'Vintage',
  'Minimal',
  'Streetwear',
  'Y2K',
  'Formal',
  'Casual',
  'Sportswear',
  'Luxury',
] as const;

/**
 * Member-added filters — the manual refinement surface beside the
 * detected-attribute chips. Single-value facets (mobile parity: one
 * category/colour/style at a time) plus free-text query/brand and a
 * price range. Every set value is a hard filter on the result set —
 * fixture mode applies them inside matchListings before the result cap;
 * live mode sends them on POST /visual-search and post-filters the serve
 * with the same predicate.
 */
export interface VisualSearchManualFilters {
  /** Free-text description — substring over title/description/brand/category. */
  query: string;
  /** Category value — same predicate as the detected category chip. */
  category: string | null;
  /** Brand fragment — substring match, same rule as the browse facet. */
  brand: string;
  priceMin: number | null;
  priceMax: number | null;
  /** COLOR_FACETS/COLOR_VOCAB name — strict "the listing names this colour". */
  color: string | null;
  /** STYLE_FACETS word — substring over the listing's own text. */
  style: string | null;
}

export const EMPTY_MANUAL_FILTERS: VisualSearchManualFilters = {
  query: '',
  category: null,
  brand: '',
  priceMin: null,
  priceMax: null,
  color: null,
  style: null,
};

export function manualFiltersActive(f: VisualSearchManualFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.category !== null ||
    f.brand.trim() !== '' ||
    f.priceMin !== null ||
    f.priceMax !== null ||
    f.color !== null ||
    f.style !== null
  );
}

/**
 * Filename → category/subcategory cues. A photo can't reveal a category by
 * colour heuristic, but the filename often does — and it is honest signal
 * the user supplied. Values match against listing.category exactly or
 * listing.subcategory/title as a substring.
 */
export const FILENAME_CATEGORY_CUES: [RegExp, string, string][] = [
  // [token regex, match value, chip label]
  [/sneakers?|trainers?|jordans?|sambas?|kicks|shoes?/i, 'sneakers', 'Sneakers'],
  [/boots?/i, 'boots', 'Boots'],
  [/bags?|totes?|purses?|handbags?|clutch/i, 'bags', 'Bags'],
  [/dress|gown|skirt|heels?/i, 'women', 'Womenswear'],
  [/watches?/i, 'watches', 'Watches'],
  [/sunglasses?|glasses/i, 'sunglasses', 'Sunglasses'],
  [/scar(f|ves)/i, 'scarves', 'Scarves'],
  [/jackets?/i, 'jacket', 'Jackets'],
  [/coats?/i, 'coat', 'Coats'],
  [/blazers?/i, 'blazer', 'Blazers'],
  [/hoodies?|sweatshirts?/i, 'hoodies', 'Hoodies'],
  [/jeans?/i, 'jeans', 'Jeans'],
  [/denim/i, 'denim', 'Denim'],
  [/shirts?/i, 'shirts', 'Shirts'],
  [/tees?|t-?shirts?/i, 't-shirts', 'T-shirts'],
  [/knit|sweaters?|jumpers?|cardigans?/i, 'knitwear', 'Knitwear'],
  [/trousers?|pants?|cargos?/i, 'trousers', 'Trousers'],
];
