// ─────────────────────────────────────────────────────────────────────────────
// Retrieval metadata — honest capability disclosure for search responses.
//
// Every search endpoint returns a `retrievalMeta` object describing which
// retrieval method actually produced the results, whether a higher-capability
// method was attempted but fell back, and whether a vector embedder is
// configured. This lets clients (and operators) distinguish a true hybrid
// search from a silent lexical fallback, and prevents the API from implying
// semantic/AI capabilities that were not used.
//
// Guiding rule: never claim a method that was not used. If semantic search
// was attempted but the embedder was unconfigured, the response says
// `method: 'lexical'` with a `fallbackReason` — it does not say 'semantic'.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The retrieval method that actually produced the results.
 *
 * - `lexical`                  — keyword / full-text matching (no vectors).
 * - `hybrid`                   — combined keyword + vector search (Meilisearch
 *                                hybrid with a configured embedder).
 * - `semantic`                 — pure vector / embedding similarity.
 * - `heuristic_color_features` — deterministic colour-and-layout image
 *                                heuristic (visual search). NOT AI/ML.
 * - `filter_only`              — structured SQL filters only, no text or
 *                                vector relevance (visual search fallback).
 * - `keyword_parser`           — natural-language query parsed into
 *                                structured filters via keyword rules
 *                                (conversational search). NOT AI/ML.
 */
export type RetrievalMethod =
  | 'lexical'
  | 'hybrid'
  | 'semantic'
  | 'heuristic_color_features'
  | 'filter_only'
  | 'keyword_parser';

/**
 * Reasons a higher-capability retrieval method was attempted but could not
 * be used, so a lower-capability method produced the results instead.
 */
export type RetrievalFallbackReason =
  | 'embedder_unconfigured'
  | 'hybrid_search_failed'
  | 'no_image_supplied'
  | 'image_decode_failed'
  | 'fts_no_matches_ilike_fallback';

/**
 * Capability metadata attached to every search response. Present on all
 * search endpoints so the retrieval contract is honest end-to-end.
 */
export interface RetrievalMeta {
  /** The retrieval method that actually produced the results. */
  method: RetrievalMethod;
  /**
   * Present only when a higher-capability method was attempted but failed,
   * and a lower-capability method was used instead. Absent when the
   * intended method succeeded with no fallback.
   */
  fallbackReason?: RetrievalFallbackReason;
  /**
   * Whether a vector embedder is configured for the search backend. False
   * for the in-memory adapter, the Elasticsearch placeholder, and any
   * Meilisearch instance with no code-level evidence of a configured
   * embedder. True only when a hybrid/semantic search actually succeeded.
   */
  embedderConfigured: boolean;
  /**
   * Search backend identifier + version, when known. Lets operators
   * correlate capability with a deployed engine version.
   */
  searchEngineVersion?: string;
}
