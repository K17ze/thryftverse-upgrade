/**
 * Conversational Search API — natural-language search service
 *
 * This service provides the data contract and mock implementation for
 * ThryftVerse conversational / natural-language search — a 2026 marketplace
 * differentiator (Mercari × ChatGPT, eBay AI Snap, Tilt Snap AI).
 *
 * Per AGENTS.md §11 (Truthful UI): the mock is flagged via
 * `CONVERSATIONAL_SEARCH_DEMO_MODE` and every entity carries `isDemo: true`
 * so the UI can show an honest "Demo mode" indicator. The mock does NOT claim
 * to use a real LLM / GPT / ChatGPT. Filter extraction uses simple, honest
 * keyword matching (e.g. "under £50" → priceRange.max 50, "vintage" →
 * condition "Very good", "sustainable" → sustainableOnly true). The UI labels
 * the extracted filters as "matched keywords", not "AI inference".
 *
 * The service is mock-ready — the function signatures mirror what a real
 * conversational search backend (LLM + retrieval) would expose. When a real
 * backend is wired, set `CONVERSATIONAL_SEARCH_DEMO_MODE = false` and replace
 * the mock branches with real fetch calls. The UI layer does not need to
 * change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extracted filters from a natural-language query. */
export interface SearchFilters {
  /** Brand names mentioned (e.g. "Nike", "Levi's"). */
  brands?: string[];
  /** Category names mentioned (e.g. "denim", "sneakers", "furniture"). */
  categories?: string[];
  /** Sizes mentioned (e.g. "9", "M", "32"). */
  sizes?: string[];
  /** Condition keywords mapped to ThryftVerse condition values. */
  conditions?: string[];
  /** Price range in GBP. */
  priceRange?: { min?: number; max?: number };
  /** Colours mentioned (e.g. "black", "navy"). */
  colors?: string[];
  /** Style / aesthetic keywords (e.g. "vintage", "minimalist", "mid-century"). */
  styles?: string[];
  /** True when the query asks for sustainable / eco items only. */
  sustainableOnly?: boolean;
  /** Honest flag — true while these filters come from mock keyword matching. */
  isDemo: boolean;
}

/** A single chat message in a conversational search session. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** ISO timestamp. */
  timestamp: string;
  /** Refinement suggestions the assistant offers (natural-language phrases). */
  suggestions?: string[];
  /** Filters extracted from the user query that produced this assistant turn. */
  filterResults?: SearchFilters;
  /** Estimated match count for the extracted filters (mock heuristic). */
  estimatedMatchCount?: number;
  /** Honest flag — true while this message comes from mock logic. */
  isDemo: boolean;
}

/** A conversational search session. */
export interface SearchConversation {
  id: string;
  /** The original opening query. */
  query: string;
  messages: ChatMessage[];
  /** ISO timestamp of session creation. */
  createdAt: string;
  /** Honest flag — true while this conversation comes from mock logic. */
  isDemo: boolean;
}

/** A suggested starting query shown on the empty / first-viewport state. */
export interface SearchSuggestion {
  id: string;
  label: string;
  query: string;
  category: 'sustainable' | 'vintage' | 'designer' | 'furniture' | 'value';
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" badge.
// When a real backend is wired, set this to false (or remove the mock branch).
// ---------------------------------------------------------------------------

export const CONVERSATIONAL_SEARCH_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Mock data — suggested starting queries
// ---------------------------------------------------------------------------

const MOCK_SUGGESTIONS: SearchSuggestion[] = [
  {
    id: 'sugg-1',
    label: 'Vintage denim under £50',
    query: 'Vintage denim under £50',
    category: 'vintage',
  },
  {
    id: 'sugg-2',
    label: 'Sustainable sneakers size 9',
    query: 'Sustainable sneakers size 9',
    category: 'sustainable',
  },
  {
    id: 'sugg-3',
    label: 'Designer bags for winter',
    query: 'Designer bags for winter',
    category: 'designer',
  },
  {
    id: 'sugg-4',
    label: 'Mid-century furniture',
    query: 'Mid-century furniture',
    category: 'furniture',
  },
  {
    id: 'sugg-5',
    label: 'Black leather jacket under £80',
    query: 'Black leather jacket under £80',
    category: 'value',
  },
  {
    id: 'sugg-6',
    label: 'Minimalist wool knitwear',
    query: 'Minimalist wool knitwear',
    category: 'designer',
  },
];

// ---------------------------------------------------------------------------
// Keyword dictionaries for honest mock filter extraction
// ---------------------------------------------------------------------------

const BRAND_KEYWORDS: string[] = [
  'nike', 'adidas', 'levi', "levi's", 'levis', 'carhartt', 'patagonia',
  'zara', 'hm', 'h&m', 'gucci', 'prada', 'burberry', 'ralph lauren',
  'new balance', 'converse', 'vans', 'supreme', 'stone island', 'the north face',
];

const CATEGORY_KEYWORDS: string[] = [
  'denim', 'jeans', 'sneakers', 'shoes', 'boots', 'jacket', 'coat',
  'dress', 'skirt', 'knitwear', 'jumper', 'sweater', 'shirt', 't-shirt',
  'tshirt', 'bag', 'handbag', 'watch', 'furniture', 'chair', 'table',
  'lamp', 'art', 'print', 'jewellery', 'jewelry', 'ring', 'necklace',
];

const COLOR_KEYWORDS: string[] = [
  'black', 'white', 'navy', 'blue', 'red', 'green', 'brown', 'beige',
  'grey', 'gray', 'cream', 'olive', 'burgundy', 'pink', 'yellow', 'orange',
];

const STYLE_KEYWORDS: string[] = [
  'vintage', 'retro', 'minimalist', 'minimal', 'streetwear', 'y2k',
  'mid-century', 'modernist', 'scandinavian', 'bohemian', 'boho',
  'classic', 'contemporary', 'heritage', 'workwear',
];

const SUSTAINABLE_KEYWORDS: string[] = [
  'sustainable', 'eco', 'ethical', 'recycled', 'organic', 'secondhand',
  'pre-loved', 'green',
];

const CONDITION_MAP: { keywords: string[]; condition: string }[] = [
  { keywords: ['new with tags', 'nwt', 'brand new'], condition: 'New with tags' },
  { keywords: ['very good', 'excellent', 'like new'], condition: 'Very good' },
  { keywords: ['good condition', 'used', 'worn'], condition: 'Good' },
  { keywords: ['vintage', 'worn in', 'loved'], condition: 'Very good' },
  { keywords: ['satisfactory', 'fair condition', 'well worn'], condition: 'Satisfactory' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Honest keyword-based filter extraction.
 *
 * This is NOT AI. It is deterministic keyword matching against small
 * dictionaries. The UI labels the output as "matched keywords" so the user
 * is never misled into thinking a language model inferred their intent.
 */
export function extractFilters(query: string): SearchFilters {
  const text = query.toLowerCase().trim();

  const brands: string[] = [];
  const categories: string[] = [];
  const colors: string[] = [];
  const styles: string[] = [];
  const conditions: string[] = [];
  const sizes: string[] = [];

  // Brands — match multi-word brands first to avoid partial collisions.
  const sortedBrands = [...BRAND_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const brand of sortedBrands) {
    if (text.includes(brand)) {
      const display = brand.charAt(0).toUpperCase() + brand.slice(1);
      if (!brands.some((b) => b.toLowerCase() === brand)) {
        brands.push(display);
      }
    }
  }

  for (const category of CATEGORY_KEYWORDS) {
    if (text.includes(category)) {
      if (!categories.some((c) => c.toLowerCase() === category)) {
        categories.push(category.charAt(0).toUpperCase() + category.slice(1));
      }
    }
  }

  for (const color of COLOR_KEYWORDS) {
    if (text.includes(color)) {
      if (!colors.some((c) => c.toLowerCase() === color)) {
        colors.push(color.charAt(0).toUpperCase() + color.slice(1));
      }
    }
  }

  for (const style of STYLE_KEYWORDS) {
    if (text.includes(style)) {
      if (!styles.some((s) => s.toLowerCase() === style)) {
        styles.push(style.charAt(0).toUpperCase() + style.slice(1));
      }
    }
  }

  // Conditions
  for (const { keywords, condition } of CONDITION_MAP) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        if (!conditions.includes(condition)) {
          conditions.push(condition);
        }
        break;
      }
    }
  }

  // Sustainable flag
  const sustainableOnly = SUSTAINABLE_KEYWORDS.some((keyword) => text.includes(keyword));

  // Price range — "under £50", "under 50", "below £30", "less than £100"
  const maxMatch = text.match(/(?:under|below|less than|max(?:imum)?)\s*[£$]?\s*(\d+)/);
  const minMatch = text.match(/(?:over|above|more than|min(?:imum)?)\s*[£$]?\s*(\d+)/);
  const priceRange: { min?: number; max?: number } = {};
  if (maxMatch) {
    priceRange.max = Number(maxMatch[1]);
  }
  if (minMatch) {
    priceRange.min = Number(minMatch[1]);
  }

  // Sizes — "size 9", "size M", "size 32", "a 9", "uk 9"
  const sizeMatch = query.match(/(?:size|uk|us)\s*([0-9]{1,2}|xs|s|m|l|xl|xxl)\b/i);
  if (sizeMatch) {
    sizes.push(sizeMatch[1].toUpperCase());
  }
  // Bare single-letter sizes after "size"
  const bareSize = query.match(/\bsize\s+([a-zA-Z]{1,3})\b/i);
  if (bareSize && !sizes.some((s) => s.toLowerCase() === bareSize[1].toLowerCase())) {
    sizes.push(bareSize[1].toUpperCase());
  }

  const filters: SearchFilters = { isDemo: true };
  if (brands.length) filters.brands = brands;
  if (categories.length) filters.categories = categories;
  if (sizes.length) filters.sizes = sizes;
  if (conditions.length) filters.conditions = conditions;
  if (priceRange.min !== undefined || priceRange.max !== undefined) filters.priceRange = priceRange;
  if (colors.length) filters.colors = colors;
  if (styles.length) filters.styles = styles;
  if (sustainableOnly) filters.sustainableOnly = true;
  return filters;
}

/**
 * Build an honest, human-readable summary of the matched keywords so the
 * assistant message can show what was extracted without claiming AI inference.
 */
export function summariseFilters(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.brands?.length) parts.push(`Brand: ${filters.brands.join(', ')}`);
  if (filters.categories?.length) parts.push(`Category: ${filters.categories.join(', ')}`);
  if (filters.sizes?.length) parts.push(`Size: ${filters.sizes.join(', ')}`);
  if (filters.conditions?.length) parts.push(`Condition: ${filters.conditions.join(', ')}`);
  if (filters.colors?.length) parts.push(`Colour: ${filters.colors.join(', ')}`);
  if (filters.styles?.length) parts.push(`Style: ${filters.styles.join(', ')}`);
  if (filters.priceRange) {
    const { min, max } = filters.priceRange;
    if (min !== undefined && max !== undefined) parts.push(`Price: £${min}–£${max}`);
    else if (max !== undefined) parts.push(`Price: under £${max}`);
    else if (min !== undefined) parts.push(`Price: over £${min}`);
  }
  if (filters.sustainableOnly) parts.push('Sustainable only');
  return parts.length ? parts.join('  ·  ') : 'No specific keywords matched';
}

/**
 * Mock heuristic for an estimated match count. This is a deterministic
 * function of how many filters were extracted — it is NOT a real catalogue
 * query. The UI presents it honestly alongside the demo indicator.
 */
function estimateMatchCount(filters: SearchFilters): number {
  let base = 120;
  if (filters.brands?.length) base -= 18 * filters.brands.length;
  if (filters.categories?.length) base -= 14 * filters.categories.length;
  if (filters.sizes?.length) base -= 22 * filters.sizes.length;
  if (filters.conditions?.length) base -= 10 * filters.conditions.length;
  if (filters.colors?.length) base -= 8 * filters.colors.length;
  if (filters.styles?.length) base -= 12 * filters.styles.length;
  if (filters.priceRange?.max !== undefined) base -= 16;
  if (filters.priceRange?.min !== undefined) base -= 8;
  if (filters.sustainableOnly) base -= 20;
  return Math.max(3, base);
}

function buildRefinementSuggestions(filters: SearchFilters): string[] {
  const suggestions: string[] = [];
  if (filters.priceRange?.max === undefined) {
    suggestions.push('under £30');
    suggestions.push('under £50');
  } else {
    suggestions.push('over £100');
  }
  if (!filters.sustainableOnly) suggestions.push('sustainable only');
  if (filters.categories?.length && !filters.colors?.length) {
    suggestions.push('in black');
  }
  if (!filters.sizes?.length && (filters.categories?.some((c) => c.toLowerCase() === 'sneakers' || c.toLowerCase() === 'shoes' || c.toLowerCase() === 'boots'))) {
    suggestions.push('size 9');
  }
  return suggestions.slice(0, 4);
}

function buildAssistantContent(filters: SearchFilters, matchCount: number): string {
  const summary = summariseFilters(filters);
  if (summary === 'No specific keywords matched') {
    return "I couldn't pick out specific keywords from that. Try describing the item, brand, size, or price range — for example \"vintage Levi's denim under £50\".";
  }
  return `I matched these keywords:\n${summary}\n\nBased on those, I found around ${matchCount} items. Tap "View results" to see them, or refine below.`;
}

// ---------------------------------------------------------------------------
// In-memory conversation store (mock only)
// ---------------------------------------------------------------------------

const MOCK_CONVERSATIONS = new Map<string, SearchConversation>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch suggested starting queries for the empty / first-viewport state.
 */
export async function fetchSuggestions(): Promise<SearchSuggestion[]> {
  await delay(180);
  return [...MOCK_SUGGESTIONS];
}

/**
 * Start a new conversational search session.
 * Returns the created conversation with the user's first message and the
 * assistant's response (extracted filters + suggestions).
 */
export async function startConversation(query: string): Promise<SearchConversation> {
  await delay(520); // simulate processing latency for honest loading state

  const conversationId = generateId('conv');
  const userMessage: ChatMessage = {
    id: generateId('msg'),
    role: 'user',
    content: query,
    timestamp: nowIso(),
    isDemo: true,
  };

  const filters = extractFilters(query);
  const matchCount = estimateMatchCount(filters);
  const assistantMessage: ChatMessage = {
    id: generateId('msg'),
    role: 'assistant',
    content: buildAssistantContent(filters, matchCount),
    timestamp: nowIso(),
    suggestions: buildRefinementSuggestions(filters),
    filterResults: filters,
    estimatedMatchCount: matchCount,
    isDemo: true,
  };

  const conversation: SearchConversation = {
    id: conversationId,
    query,
    messages: [userMessage, assistantMessage],
    createdAt: nowIso(),
    isDemo: true,
  };

  MOCK_CONVERSATIONS.set(conversationId, conversation);
  return conversation;
}

/**
 * Continue an existing conversation with a follow-up message.
 * The follow-up is merged with the prior filters so refinements like
 * "actually, make it under £30" update the price range rather than replacing
 * the whole query.
 */
export async function continueConversation(
  conversationId: string,
  query: string,
): Promise<ChatMessage> {
  await delay(520);

  const conversation = MOCK_CONVERSATIONS.get(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const userMessage: ChatMessage = {
    id: generateId('msg'),
    role: 'user',
    content: query,
    timestamp: nowIso(),
    isDemo: true,
  };
  conversation.messages.push(userMessage);

  // Merge: take the last assistant filters and apply the new extraction on top.
  const lastAssistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.filterResults);
  const priorFilters = lastAssistant?.filterResults;
  const newFilters = extractFilters(query);

  const merged: SearchFilters = { isDemo: true };
  merged.brands = dedupe([...(priorFilters?.brands ?? []), ...(newFilters.brands ?? [])]);
  merged.categories = dedupe([...(priorFilters?.categories ?? []), ...(newFilters.categories ?? [])]);
  merged.sizes = dedupe([...(priorFilters?.sizes ?? []), ...(newFilters.sizes ?? [])]);
  merged.conditions = dedupe([...(priorFilters?.conditions ?? []), ...(newFilters.conditions ?? [])]);
  merged.colors = dedupe([...(priorFilters?.colors ?? []), ...(newFilters.colors ?? [])]);
  merged.styles = dedupe([...(priorFilters?.styles ?? []), ...(newFilters.styles ?? [])]);

  // Price range: a new "under £X" overrides the prior max; same for min.
  const priceRange: { min?: number; max?: number } = {
    ...(priorFilters?.priceRange ?? {}),
    ...(newFilters.priceRange ?? {}),
  };
  if (priceRange.min !== undefined || priceRange.max !== undefined) {
    merged.priceRange = priceRange;
  }

  merged.sustainableOnly = newFilters.sustainableOnly ?? priorFilters?.sustainableOnly ?? false;

  const matchCount = estimateMatchCount(merged);
  const assistantMessage: ChatMessage = {
    id: generateId('msg'),
    role: 'assistant',
    content: buildAssistantContent(merged, matchCount),
    timestamp: nowIso(),
    suggestions: buildRefinementSuggestions(merged),
    filterResults: merged,
    estimatedMatchCount: matchCount,
    isDemo: true,
  };
  conversation.messages.push(assistantMessage);

  return assistantMessage;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}
