// ─────────────────────────────────────────────────────────────────────────────
// Search Index — In-memory inverted index with TF-IDF ranking and filter support.
//
// Design goals (per 2026 search performance research):
//   • Dedicated search index for fast text matching (table stakes)
//   • Tokenize, lowercase, basic stemming for fuzzy matching
//   • Prefix matching for autocomplete
//   • Ranking factors: TF-IDF, recency, price relevance, seller rating, popularity
//   • Combinable filter bitmaps with fast intersection
//   • Incremental update on listing create/update/delete
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export interface IndexedListing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  priceGbp: number;
  imageUrl: string | null;
  createdAt: string;
  sellerRating: number | null;
  viewCount: number;
  saleCount: number;
  sellerUsername: string | null;
}

export interface SearchFilters {
  category?: string;
  condition?: string;
  size?: string;
  priceMin?: number;
  priceMax?: number;
  location?: string;
}

export type SortOption = 'relevance' | 'recent' | 'price_asc' | 'price_desc';

export interface SearchResult {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  createdAt: string;
  rank: number;
  seller: {
    id: string;
    username: string | null;
    avatar: null;
    rating: number | null;
    reviewCount: null;
    location: null;
  } | null;
}

export interface AutocompleteEntry {
  text: string;
  type: 'query' | 'brand' | 'category';
  score: number;
}

// ── Tokenization & Stemming ───────────────────────────────────────────────────

/** Basic English suffix-stemming rules (Porter-lite). */
const STEM_SUFFIXES = [
  'ing', 'edly', 'edly', 'ed', 'ly', 'es', 's',
];

function stem(word: string): string {
  let result = word;
  for (const suffix of STEM_SUFFIXES) {
    if (result.length > suffix.length + 2 && result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  // Restore trailing 'e' for words like "shoe" → "sho" → "shoe"
  if (result.length > 2 && !result.endsWith('e') && word.endsWith('e')) {
    // Only restore if the stem is very short (likely over-stemmed)
    if (result.length <= 3) {
      result = result + 'e';
    }
  }
  return result;
}

/**
 * Tokenize text into normalized, lowercased, stemmed terms.
 * Non-alphanumeric characters act as delimiters.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
    .map(stem);
}

/**
 * Tokenize without stemming — used for prefix matching where
 * the raw token is needed for autocomplete.
 */
export function tokenizeRaw(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 1);
}

// ── Inverted Index ────────────────────────────────────────────────────────────

interface Posting {
  listingId: string;
  /** Term frequency in this document. */
  tf: number;
  /** Fields where the term appeared (for field-weighted scoring). */
  fields: Set<string>;
}

interface IndexEntry {
  /** Postings list — maps listingId to posting info. */
  postings: Map<string, Posting>;
  /** Document frequency (number of listings containing this term). */
  df: number;
}

interface ListingIndexData {
  listing: IndexedListing;
  /** Token -> term frequency for this document. */
  termFrequencies: Map<string, number>;
  /** Total token count (for TF normalization). */
  totalTokens: number;
  /** Prefix tokens for autocomplete. */
  prefixTokens: string[];
}

// ── Search Index Class ────────────────────────────────────────────────────────

export class SearchIndex {
  private index = new Map<string, IndexEntry>();
  private listings = new Map<string, ListingIndexData>();
  private totalDocuments = 0;

  // Filter bitmaps for fast intersection
  private categoryBitmap = new Map<string, Set<string>>();
  private conditionBitmap = new Map<string, Set<string>>();
  private sizeBitmap = new Map<string, Set<string>>();

  // Autocomplete prefix trie (simplified: Map of prefix -> terms)
  private prefixMap = new Map<string, Set<string>>();
  private brandSet = new Set<string>();
  private categorySet = new Set<string>();

  // Field weights for scoring
  private static readonly FIELD_WEIGHTS: Record<string, number> = {
    title: 3.0,
    brand: 2.5,
    category: 2.0,
    description: 1.0,
    size: 1.5,
    condition: 1.5,
  };

  /** Number of indexed listings. */
  get size(): number {
    return this.totalDocuments;
  }

  /**
   * Add or replace a listing in the index. If the listing already
   * exists, it is removed first and re-indexed (incremental update).
   */
  addListing(listing: IndexedListing): void {
    // Remove existing entry if present (handles updates)
    if (this.listings.has(listing.id)) {
      this.removeListing(listing.id);
    }

    // Build text from all searchable fields
    const fieldTexts: Record<string, string> = {
      title: listing.title,
      description: listing.description,
      brand: listing.brand ?? '',
      category: listing.category ?? '',
      size: listing.size ?? '',
      condition: listing.condition ?? '',
    };

    const termFrequencies = new Map<string, number>();
    const allPrefixTokens = new Set<string>();
    let totalTokens = 0;

    for (const [fieldName, text] of Object.entries(fieldTexts)) {
      if (!text) continue;

      const tokens = tokenize(text);
      totalTokens += tokens.length;

      // Track prefix tokens for autocomplete
      for (const rawToken of tokenizeRaw(text)) {
        allPrefixTokens.add(rawToken);
      }

      for (const token of tokens) {
        const current = termFrequencies.get(token) ?? 0;
        termFrequencies.set(token, current + 1);

        // Update inverted index
        let entry = this.index.get(token);
        if (!entry) {
          entry = { postings: new Map(), df: 0 };
          this.index.set(token, entry);
        }

        let posting = entry.postings.get(listing.id);
        if (!posting) {
          posting = { listingId: listing.id, tf: 0, fields: new Set() };
          entry.postings.set(listing.id, posting);
          entry.df += 1;
        }
        posting.tf += 1;
        posting.fields.add(fieldName);
      }
    }

    // Store listing data
    this.listings.set(listing.id, {
      listing,
      termFrequencies,
      totalTokens,
      prefixTokens: Array.from(allPrefixTokens),
    });
    this.totalDocuments += 1;

    // Update filter bitmaps
    if (listing.category) {
      let bitmap = this.categoryBitmap.get(listing.category);
      if (!bitmap) {
        bitmap = new Set();
        this.categoryBitmap.set(listing.category, bitmap);
      }
      bitmap.add(listing.id);
      this.categorySet.add(listing.category.toLowerCase());
    }
    if (listing.condition) {
      let bitmap = this.conditionBitmap.get(listing.condition);
      if (!bitmap) {
        bitmap = new Set();
        this.conditionBitmap.set(listing.condition, bitmap);
      }
      bitmap.add(listing.id);
    }
    if (listing.size) {
      let bitmap = this.sizeBitmap.get(listing.size);
      if (!bitmap) {
        bitmap = new Set();
        this.sizeBitmap.set(listing.size, bitmap);
      }
      bitmap.add(listing.id);
    }
    if (listing.brand) {
      this.brandSet.add(listing.brand.toLowerCase());
    }

    // Update prefix map for autocomplete
    for (const token of allPrefixTokens) {
      for (let len = 1; len <= token.length; len++) {
        const prefix = token.slice(0, len);
        let terms = this.prefixMap.get(prefix);
        if (!terms) {
          terms = new Set();
          this.prefixMap.set(prefix, terms);
        }
        terms.add(token);
      }
    }
  }

  /**
   * Remove a listing from the index. Cleans up all postings,
   * filter bitmaps, and prefix entries.
   */
  removeListing(listingId: string): void {
    const data = this.listings.get(listingId);
    if (!data) return;

    // Remove from inverted index
    for (const [token] of data.termFrequencies) {
      const entry = this.index.get(token);
      if (entry) {
        entry.postings.delete(listingId);
        entry.df -= 1;
        if (entry.df <= 0) {
          this.index.delete(token);
        }
      }
    }

    // Remove from filter bitmaps
    const listing = data.listing;
    if (listing.category) {
      this.categoryBitmap.get(listing.category)?.delete(listingId);
    }
    if (listing.condition) {
      this.conditionBitmap.get(listing.condition)?.delete(listingId);
    }
    if (listing.size) {
      this.sizeBitmap.get(listing.size)?.delete(listingId);
    }

    // Remove from prefix map
    for (const token of data.prefixTokens) {
      for (let len = 1; len <= token.length; len++) {
        const prefix = token.slice(0, len);
        const terms = this.prefixMap.get(prefix);
        if (terms) {
          terms.delete(token);
          if (terms.size === 0) {
            this.prefixMap.delete(prefix);
          }
        }
      }
    }

    this.listings.delete(listingId);
    this.totalDocuments -= 1;
  }

  /**
   * Rebuild the entire index from scratch. Clears all existing data
   * and re-indexes all provided listings.
   */
  rebuild(listings: IndexedListing[]): void {
    this.clear();
    for (const listing of listings) {
      this.addListing(listing);
    }
  }

  /** Clear all index data. */
  clear(): void {
    this.index.clear();
    this.listings.clear();
    this.categoryBitmap.clear();
    this.conditionBitmap.clear();
    this.sizeBitmap.clear();
    this.prefixMap.clear();
    this.brandSet.clear();
    this.categorySet.clear();
    this.totalDocuments = 0;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  /**
   * Search the index for listings matching the query text, with
   * optional filters and sorting. Returns ranked results.
   */
  search(
    query: string,
    options?: {
      filters?: SearchFilters;
      sort?: SortOption;
      limit?: number;
      offset?: number;
    },
  ): SearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const limit = options?.limit ?? 24;
    const offset = options?.offset ?? 0;
    const sort = options?.sort ?? 'relevance';

    // Get candidate set from inverted index
    const candidateScores = new Map<string, number>();

    for (const token of queryTokens) {
      const entry = this.index.get(token);
      if (!entry) continue;

      // IDF: log(1 + N / df)
      const idf = Math.log(1 + this.totalDocuments / entry.df);

      for (const [listingId, posting] of entry.postings) {
        const data = this.listings.get(listingId);
        if (!data) continue;

        // TF: normalized term frequency
        const tf = data.totalTokens > 0
          ? posting.tf / data.totalTokens
          : posting.tf;

        // Field weight: average weight of fields where term appeared
        let fieldWeight = 1.0;
        for (const field of posting.fields) {
          fieldWeight = Math.max(
            fieldWeight,
            SearchIndex.FIELD_WEIGHTS[field] ?? 1.0,
          );
        }

        // TF-IDF score with field weighting
        const score = tf * idf * fieldWeight;
        candidateScores.set(
          listingId,
          (candidateScores.get(listingId) ?? 0) + score,
        );
      }
    }

    // Also check prefix matches for short queries (autocomplete-like)
    if (queryTokens.length === 1 && queryTokens[0].length >= 2) {
      const rawToken = queryTokens[0];
      for (const [token, entry] of this.index) {
        if (token.startsWith(rawToken) && token !== rawToken) {
          const idf = Math.log(1 + this.totalDocuments / entry.df);
          for (const [listingId, posting] of entry.postings) {
            const data = this.listings.get(listingId);
            if (!data) continue;
            const tf = data.totalTokens > 0
              ? posting.tf / data.totalTokens
              : posting.tf;
            // Prefix matches get a discount
            const prefixScore = tf * idf * 0.5;
            candidateScores.set(
              listingId,
              (candidateScores.get(listingId) ?? 0) + prefixScore,
            );
          }
        }
      }
    }

    if (candidateScores.size === 0) return [];

    // Apply filters via bitmap intersection
    let candidateIds = new Set(candidateScores.keys());
    candidateIds = this.applyFilters(candidateIds, options?.filters);

    if (candidateIds.size === 0) return [];

    // Compute final ranking with boost factors
    const ranked = Array.from(candidateIds)
      .map((listingId) => {
        const data = this.listings.get(listingId);
        if (!data) return null;

        const textScore = candidateScores.get(listingId) ?? 0;
        const finalScore = this.computeFinalScore(textScore, data.listing);

        return {
          listingId,
          score: finalScore,
          data,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Sort
    this.applySort(ranked, sort);

    // Paginate and format results
    const paginated = ranked.slice(offset, offset + limit);

    return paginated.map(({ data }) => this.toSearchResult(data.listing, data));
  }

  /**
   * Get autocomplete suggestions for a prefix.
   * Returns matching terms, brands, and categories.
   */
  autocomplete(prefix: string, limit: number = 8): AutocompleteEntry[] {
    const normalized = prefix.trim().toLowerCase();
    if (normalized.length < 1) return [];

    const suggestions: AutocompleteEntry[] = [];
    const seen = new Set<string>();

    // Prefix matches from the index
    const terms = this.prefixMap.get(normalized);
    if (terms) {
      for (const term of terms) {
        if (seen.has(term)) continue;
        seen.add(term);

        // Score by document frequency
        const entry = this.index.get(stem(term)) ?? this.index.get(term);
        const df = entry?.df ?? 1;
        suggestions.push({
          text: term,
          type: 'query',
          score: df,
        });
      }
    }

    // Brand matches
    for (const brand of this.brandSet) {
      if (brand.startsWith(normalized) && !seen.has(brand)) {
        seen.add(brand);
        suggestions.push({
          text: brand,
          type: 'brand',
          score: 10, // Brands get a fixed boost
        });
      }
    }

    // Category matches
    for (const category of this.categorySet) {
      if (category.startsWith(normalized) && !seen.has(category)) {
        seen.add(category);
        suggestions.push({
          text: category,
          type: 'category',
          score: 8, // Categories get a slightly lower boost
        });
      }
    }

    // Sort by score descending, then alphabetically
    suggestions.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));

    return suggestions.slice(0, limit);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private applyFilters(
    candidateIds: Set<string>,
    filters?: SearchFilters,
  ): Set<string> {
    if (!filters) return candidateIds;

    let result = candidateIds;

    if (filters.category) {
      const bitmap = this.categoryBitmap.get(filters.category);
      if (!bitmap) return new Set();
      result = this.intersect(result, bitmap);
    }

    if (filters.condition) {
      const bitmap = this.conditionBitmap.get(filters.condition);
      if (!bitmap) return new Set();
      result = this.intersect(result, bitmap);
    }

    if (filters.size) {
      const bitmap = this.sizeBitmap.get(filters.size);
      if (!bitmap) return new Set();
      result = this.intersect(result, bitmap);
    }

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      result = new Set(
        Array.from(result).filter((listingId) => {
          const data = this.listings.get(listingId);
          if (!data) return false;
          const price = data.listing.priceGbp;
          if (filters.priceMin !== undefined && price < filters.priceMin) {
            return false;
          }
          if (filters.priceMax !== undefined && price > filters.priceMax) {
            return false;
          }
          return true;
        }),
      );
    }

    if (filters.location) {
      // Location filter would require geo data; for now, filter by
      // seller username containing the location string as a proxy.
      // This is a placeholder for future geo-search integration.
      result = new Set(
        Array.from(result).filter((listingId) => {
          const data = this.listings.get(listingId);
          if (!data) return false;
          return data.listing.sellerUsername?.toLowerCase().includes(
            filters.location!.toLowerCase(),
          ) ?? false;
        }),
      );
    }

    return result;
  }

  private intersect(a: Set<string>, b: Set<string>): Set<string> {
    // Always iterate the smaller set for efficiency
    const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
    const result = new Set<string>();
    for (const item of smaller) {
      if (larger.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Compute the final ranking score by combining text relevance (TF-IDF)
   * with boost factors: recency, price relevance, seller rating, and
   * view/sale popularity.
   */
  private computeFinalScore(textScore: number, listing: IndexedListing): number {
    // Recency boost: exponential decay over 30 days
    const ageMs = Date.now() - Date.parse(listing.createdAt);
    const ageDays = Math.max(0, ageMs / 86_400_000);
    const recencyBoost = Math.exp(-ageDays / 30);

    // Price relevance: listings closer to the median price get a
    // small boost. We use a simple normalization: lower prices get
    // slightly higher scores (value perception).
    const priceRelevance = listing.priceGbp > 0
      ? 1 / (1 + Math.log10(listing.priceGbp))
      : 0.5;

    // Seller rating boost: normalized 0-1
    const sellerRatingBoost = listing.sellerRating != null
      ? Math.min(1, Math.max(0, listing.sellerRating / 5))
      : 0.5;

    // Popularity boost: log-scaled view + sale counts
    const popularityBoost = Math.log1p(listing.viewCount + listing.saleCount * 3)
      / Math.log1p(100);

    // Weighted combination
    const finalScore =
      0.40 * this.normalizeTfIdf(textScore) +
      0.25 * recencyBoost +
      0.10 * priceRelevance +
      0.15 * sellerRatingBoost +
      0.10 * Math.min(1, popularityBoost);

    return finalScore;
  }

  /**
   * Normalize TF-IDF scores to 0-1 range using a sigmoid.
   * This prevents text relevance from dominating when raw scores
   * vary widely across different query lengths.
   */
  private normalizeTfIdf(rawScore: number): number {
    if (rawScore <= 0) return 0;
    return rawScore / (1 + rawScore);
  }

  private applySort<T extends { score: number; data: ListingIndexData }>(
    entries: T[],
    sort: SortOption,
  ): void {
    switch (sort) {
      case 'recent':
        entries.sort(
          (a, b) =>
            Date.parse(b.data.listing.createdAt) -
              Date.parse(a.data.listing.createdAt) ||
            b.data.listing.id.localeCompare(a.data.listing.id),
        );
        break;
      case 'price_asc':
        entries.sort(
          (a, b) =>
            a.data.listing.priceGbp - b.data.listing.priceGbp ||
            b.data.listing.id.localeCompare(a.data.listing.id),
        );
        break;
      case 'price_desc':
        entries.sort(
          (a, b) =>
            b.data.listing.priceGbp - a.data.listing.priceGbp ||
            b.data.listing.id.localeCompare(a.data.listing.id),
        );
        break;
      case 'relevance':
      default:
        entries.sort(
          (a, b) => b.score - a.score || b.data.listing.id.localeCompare(a.data.listing.id),
        );
        break;
    }
  }

  private toSearchResult(
    listing: IndexedListing,
    data: ListingIndexData,
  ): SearchResult {
    return {
      id: listing.id,
      sellerId: listing.sellerId,
      title: listing.title,
      description: listing.description,
      priceGbp: listing.priceGbp,
      imageUrl: listing.imageUrl,
      createdAt: listing.createdAt,
      rank: data.termFrequencies.size > 0 ? 1 : 0,
      seller: listing.sellerUsername
        ? {
            id: listing.sellerId,
            username: listing.sellerUsername,
            avatar: null,
            rating: listing.sellerRating,
            reviewCount: null,
            location: null,
          }
        : null,
    };
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

/**
 * Global search index instance. Shared across all requests in the
 * process. Rebuilt incrementally on listing mutations.
 */
export const searchIndex = new SearchIndex();
