import type { ListingCondition } from '@/lib/contracts/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured intent extracted from one or more chat messages. */
export interface ParsedIntent {
  /** Canonical fixture brand names (e.g. "Levi's", "New Balance"). */
  brands: string[];
  /** Item/category terms — the object of the search (e.g. "denim jacket"). */
  itemTerms: string[];
  /** Top-level category slugs — women, men, sneakers, bags, accessories. */
  categorySlugs: string[];
  /** Size tokens as written in listings — "9", "M", "W32". */
  sizes: string[];
  conditions: ListingCondition[];
  priceMin: number | null;
  priceMax: number | null;
  /** Canonical colour names from COLOR_VOCAB. */
  colours: string[];
  /** Style words — vintage, streetwear, oversized… */
  styles: string[];
  sustainable: boolean;
  /** Leftover meaningful words — matched against listing text. */
  keywords: string[];
}

export interface ConstraintChip {
  /** `${kind}:${value}` — stable id for removal. */
  id: string;
  kind:
    | 'brand'
    | 'category'
    | 'item'
    | 'size'
    | 'condition'
    | 'price'
    | 'colour'
    | 'style'
    | 'sustainable'
    | 'keyword';
  /** The value to strip from the intent on removal. */
  value: string;
  label: string;
}

export const EMPTY_INTENT: ParsedIntent = {
  brands: [],
  itemTerms: [],
  categorySlugs: [],
  sizes: [],
  conditions: [],
  priceMin: null,
  priceMax: null,
  colours: [],
  styles: [],
  sustainable: false,
  keywords: [],
};

/** Fresh intent — never share EMPTY_INTENT's arrays (spreads reuse them). */
export function newIntent(): ParsedIntent {
  return {
    ...EMPTY_INTENT,
    keywords: [],
    brands: [],
    itemTerms: [],
    categorySlugs: [],
    sizes: [],
    conditions: [],
    colours: [],
    styles: [],
  };
}

export function constraintCount(intent: ParsedIntent): number {
  return (
    intent.brands.length +
    intent.itemTerms.length +
    intent.categorySlugs.length +
    intent.sizes.length +
    intent.conditions.length +
    (intent.priceMin != null || intent.priceMax != null ? 1 : 0) +
    intent.colours.length +
    intent.styles.length +
    (intent.sustainable ? 1 : 0) +
    intent.keywords.length
  );
}

/** Wire shape of POST /search/conversational's `parsedFilters` — camelCase
 *  and `colors` (not `colours`). Same keyword-rule contract as the local
 *  parser; the UI labels both identically ("matched keywords"). */
export interface ApiParsedFilters {
  brands?: string[];
  categories?: string[];
  sizes?: string[];
  conditions?: string[];
  priceRange?: { min?: number; max?: number };
  colors?: string[];
  styles?: string[];
  sustainableOnly?: boolean;
}

export type AnswerConfidence = 'high' | 'medium' | 'low' | 'exploratory';

export interface AnswerTrust {
  confidence: AnswerConfidence;
  /** Source citation — names the real matched keywords, never invented. */
  source: string;
  /** Progressive-disclosure reasoning — the honest mechanics of the match. */
  expanded: string;
}

/** Starter prompts — natural-language forms of the trending terms; every
 *  one is verified to match the fixture catalogue. */
export const STARTER_PROMPTS: string[] = [
  "Vintage Levi's jeans under £50",
  'Adidas Samba size 7',
  'Black cat-eye sunglasses',
  'Wool coat in camel',
  'Carhartt trousers under £50',
  'Mohair cardigan',
];
