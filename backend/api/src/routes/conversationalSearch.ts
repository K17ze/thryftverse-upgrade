import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createSearchAdapter, type SearchQuery } from '../lib/searchAdapter.js';
import type { RetrievalMeta } from '../lib/retrievalMeta.js';

type ConversationalSearchRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
};

const conversationalSearchSchema = z.object({
  query: z.string().trim().min(1).max(300),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

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

interface ParsedFilters {
  brands?: string[];
  categories?: string[];
  sizes?: string[];
  conditions?: string[];
  priceRange?: { min?: number; max?: number };
  colors?: string[];
  styles?: string[];
  sustainableOnly?: boolean;
}

function extractFilters(query: string): ParsedFilters {
  const text = query.toLowerCase().trim();

  const brands: string[] = [];
  const categories: string[] = [];
  const colors: string[] = [];
  const styles: string[] = [];
  const conditions: string[] = [];
  const sizes: string[] = [];

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

  const sustainableOnly = SUSTAINABLE_KEYWORDS.some((keyword) => text.includes(keyword));

  const priceRange: { min?: number; max?: number } = {};
  const maxMatch = text.match(/(?:under|below|less than|max(?:imum)?)\s*[£$]?\s*(\d+)/);
  const minMatch = text.match(/(?:over|above|more than|min(?:imum)?)\s*[£$]?\s*(\d+)/);
  if (maxMatch) priceRange.max = Number(maxMatch[1]);
  if (minMatch) priceRange.min = Number(minMatch[1]);

  const sizeMatch = query.match(/(?:size|uk|us)\s*([0-9]{1,2}|xs|s|m|l|xl|xxl)\b/i);
  if (sizeMatch) {
    sizes.push(sizeMatch[1].toUpperCase());
  }
  const bareSize = query.match(/\bsize\s+([a-zA-Z]{1,3})\b/i);
  if (bareSize && !sizes.some((s) => s.toLowerCase() === bareSize[1].toLowerCase())) {
    sizes.push(bareSize[1].toUpperCase());
  }

  const filters: ParsedFilters = {};
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

function buildSearchQueryText(parsed: ParsedFilters, originalQuery: string): string {
  const tokens: string[] = [];
  if (parsed.brands) tokens.push(...parsed.brands);
  if (parsed.categories) tokens.push(...parsed.categories);
  if (parsed.colors) tokens.push(...parsed.colors);
  if (parsed.styles) tokens.push(...parsed.styles);
  if (tokens.length === 0) return originalQuery;
  return tokens.join(' ');
}

function buildSearchFilters(parsed: ParsedFilters): SearchQuery['filters'] {
  const filters: SearchQuery['filters'] = {};
  if (parsed.categories?.length) filters.category = parsed.categories[0];
  if (parsed.conditions?.length) filters.condition = parsed.conditions[0];
  if (parsed.sizes?.length) filters.size = parsed.sizes[0];
  if (parsed.priceRange?.min !== undefined) filters.minPrice = parsed.priceRange.min;
  if (parsed.priceRange?.max !== undefined) filters.maxPrice = parsed.priceRange.max;
  return filters;
}

export function registerConversationalSearchRoutes({
  app,
  db: _db,
  readDb: _readDb,
}: ConversationalSearchRouteDependencies): void {
  app.post('/search/conversational', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = conversationalSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid conversational search request',
        details: parsed.error.flatten(),
      };
    }

    const { query, limit } = parsed.data;
    const parsedFilters = extractFilters(query);

    const searchQuery: SearchQuery = {
      query: buildSearchQueryText(parsedFilters, query),
      filters: buildSearchFilters(parsedFilters),
      limit,
    };

    try {
      const adapter = createSearchAdapter();
      const results = await adapter.search(searchQuery);
      const info = adapter.retrievalInfo();
      // Honest capability marker: this route parses natural language into
      // structured filters via keyword rules — it is NOT an AI/ML model.
      // The structured retrievalMeta.method is 'keyword_parser' so the API
      // contract is honest even if the product label stays "conversational".
      const retrievalMeta: RetrievalMeta = {
        method: 'keyword_parser',
        embedderConfigured: info.embedderConfigured,
        searchEngineVersion: info.searchEngineVersion,
      };
      return {
        ok: true,
        query,
        method: 'heuristic keyword matching, not AI',
        retrievalMeta,
        parsedFilters,
        total: results.length,
        items: results.map((result) => ({
          score: result.score,
          ...result.document,
        })),
      };
    } catch (error) {
      request.log.error({ err: error, query }, 'Conversational search failed');
      reply.code(500);
      return {
        ok: false,
        error: 'Conversational search failed',
        method: 'heuristic keyword matching, not AI',
        parsedFilters,
      };
    }
  });
}
