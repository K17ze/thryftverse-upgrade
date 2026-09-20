/**
 * Search API — scoped + fused search contract (GET /search?scope=…)
 *
 * Backend contract (audit R98 — seller/board search fusion):
 *   scope=items   — legacy adapter-backed listing search (default, unchanged)
 *   scope=people  — postgres users search (search_visibility='visible' only)
 *   scope=boards  — postgres public-moodboard search (ILIKE title/description)
 *   scope=all     — all three scopes fused into one ranked `results` list
 *                   via reciprocal rank fusion on the server
 *
 * The people/boards scopes are always postgres lexical — moodboards and
 * users are not indexed in Meilisearch (only the listings index exists).
 * Scoped responses keep the universal `items` array; the fused `all`
 * response returns `results` (heterogeneous hits with a `type`
 * discriminator) plus per-scope `counts`.
 *
 * Errors return `{ items: [], error }` / `{ results: [], error }` — the
 * caller renders an honest error+retry state, never a silent empty list.
 */

import { fetchJson } from '../lib/apiClient';
import { friendlyBackendError } from './listingMapper';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Scopes accepted by GET /search. */
export type SearchScope = 'items' | 'people' | 'boards' | 'all';

/** Discriminator carried by every fused hit. */
export type SearchHitType = 'item' | 'person' | 'board';

/** Retrieval capability metadata — which method/backend actually served. */
export interface SearchRetrievalMeta {
  method?: string;
  fallbackReason?: string;
  embedderConfigured?: boolean;
  searchEngineVersion?: string;
  backend?: string;
  degraded?: boolean;
}

/** Serve mode reported by the backend (personalized / degraded / cold start). */
export type SearchServeMode = 'personalized' | 'degraded_lexical' | 'cold_start';

// ── Scoped hit payloads (flat `items` elements) ──

/** A listing hit — the SearchAdapter document plus `type`/`score`. */
export interface ItemSearchHit {
  type: 'item';
  id: string;
  score: number;
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  brand?: string;
  sizes?: string[];
  price?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
}

/** A public moodboard hit — carries the fields a board tile needs. */
export interface BoardSearchHit {
  type: 'board';
  id: string;
  title: string;
  description: string;
  /** Board cover — falls back to the board's first item media server-side. */
  coverImage: string;
  /** Curator display name (falls back to username, then creator id). */
  curator: string;
  /** Curator handle — null when the creator row can't be resolved. */
  curatorUsername: string | null;
  curatorAvatar: string | null;
  creatorId: string;
  /** Live count of non-deleted items on the board. */
  itemCount: number;
  theme: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  /** Scope-native relevance score (0.4–1.0 CASE tier). */
  score: number;
}

/** A person hit — mirrors the /users/search payload plus `type`/`score`. */
export interface PersonSearchHit {
  type: 'person';
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isFollowing: boolean;
  /** Scope-native relevance score (0.35–1.0 CASE tier). */
  score: number;
}

// ── Fused hits (scope=all `results` elements) ──

/** `data` payload of a fused item hit — index document + resolved card fields. */
export interface ItemSearchHitData extends Omit<ItemSearchHit, 'type' | 'score'> {
  /** Primary image resolved from the listings row (index docs carry none). */
  imageUrl: string | null;
  sellerUsername: string | null;
}

/** `data` payload of a fused person hit. */
export type PersonSearchHitData = Omit<PersonSearchHit, 'type' | 'score'>;

/** `data` payload of a fused board hit. */
export type BoardSearchHitData = Omit<BoardSearchHit, 'type' | 'score'>;

/**
 * One entry in the fused `results` list. `score` is the server's
 * reciprocal-rank-fusion ordering key; `rawScore` preserves the scope's own
 * relevance signal. `id` is prefixed (`board:mbd_1`); the raw entity id is
 * on `data.id`.
 */
export type FusedSearchHit =
  | { id: string; type: 'item'; score: number; rawScore: number; data: ItemSearchHitData }
  | { id: string; type: 'person'; score: number; rawScore: number; data: PersonSearchHitData }
  | { id: string; type: 'board'; score: number; rawScore: number; data: BoardSearchHitData };

// ── Response envelopes ──

/** Response of a single-scope search (scope=boards|people|items). */
export interface ScopedSearchResult<THit> {
  items: THit[];
  total: number;
  retrievalMeta?: SearchRetrievalMeta;
  serveMode?: SearchServeMode;
  error?: string;
}

/** Response of the fused scope=all search. */
export interface FusedSearchResult {
  results: FusedSearchHit[];
  /** Per-scope hit counts inside the returned window. */
  counts: { items: number; people: number; boards: number };
  total: number;
  retrievalMeta?: SearchRetrievalMeta;
  serveMode?: SearchServeMode;
  error?: string;
}

export interface ScopedSearchOptions {
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

function buildScopedParams(
  query: string,
  scope: Exclude<SearchScope, 'all'>,
  options?: ScopedSearchOptions,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('q', query.trim());
  params.set('scope', scope);
  if (options?.limit) params.set('limit', String(Math.min(Math.max(options.limit, 1), 100)));
  if (options?.offset) params.set('offset', String(Math.max(options.offset, 0)));
  return params;
}

/**
 * Search public moodboards (`GET /search?scope=boards`). Postgres ILIKE on
 * title/description — boards are not indexed in the search backend.
 */
export async function searchBoardsFromApi(
  query: string,
  options?: ScopedSearchOptions,
): Promise<ScopedSearchResult<BoardSearchHit>> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], total: 0 };

  try {
    const payload = await fetchJson<{
      ok: boolean;
      total?: number;
      retrievalMeta?: SearchRetrievalMeta;
      serveMode?: SearchServeMode;
      items?: BoardSearchHit[];
    }>(`/search?${buildScopedParams(trimmed, 'boards', options).toString()}`);
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      total: typeof payload.total === 'number' ? payload.total : (payload.items?.length ?? 0),
      retrievalMeta: payload.retrievalMeta,
      serveMode: payload.serveMode,
    };
  } catch (error) {
    return { items: [], total: 0, error: friendlyBackendError(error) };
  }
}

/**
 * Search people (`GET /search?scope=people`). Postgres ILIKE on
 * username/display_name, gated by the user's `search_visibility` setting.
 */
export async function searchPeopleFromApi(
  query: string,
  options?: ScopedSearchOptions,
): Promise<ScopedSearchResult<PersonSearchHit>> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], total: 0 };

  try {
    const payload = await fetchJson<{
      ok: boolean;
      total?: number;
      retrievalMeta?: SearchRetrievalMeta;
      serveMode?: SearchServeMode;
      items?: PersonSearchHit[];
    }>(`/search?${buildScopedParams(trimmed, 'people', options).toString()}`);
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      total: typeof payload.total === 'number' ? payload.total : (payload.items?.length ?? 0),
      retrievalMeta: payload.retrievalMeta,
      serveMode: payload.serveMode,
    };
  } catch (error) {
    return { items: [], total: 0, error: friendlyBackendError(error) };
  }
}

/**
 * Fused search across all scopes (`GET /search?scope=all`). Returns one
 * ranked list — hits interleave items, people and boards by reciprocal
 * rank fusion. `offset` is not applied in fused mode (it is a top-N
 * relevance window); deep pagination goes through the scoped calls.
 */
export async function searchAllScopesFromApi(
  query: string,
  options?: { limit?: number },
): Promise<FusedSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], counts: { items: 0, people: 0, boards: 0 }, total: 0 };
  }

  const params = new URLSearchParams();
  params.set('q', trimmed);
  params.set('scope', 'all');
  if (options?.limit) params.set('limit', String(Math.min(Math.max(options.limit, 1), 100)));

  try {
    const payload = await fetchJson<{
      ok: boolean;
      total?: number;
      counts?: { items?: number; people?: number; boards?: number };
      retrievalMeta?: SearchRetrievalMeta;
      serveMode?: SearchServeMode;
      results?: FusedSearchHit[];
    }>(`/search?${params.toString()}`);
    const results = Array.isArray(payload.results) ? payload.results : [];
    return {
      results,
      counts: {
        items: payload.counts?.items ?? 0,
        people: payload.counts?.people ?? 0,
        boards: payload.counts?.boards ?? 0,
      },
      total: typeof payload.total === 'number' ? payload.total : results.length,
      retrievalMeta: payload.retrievalMeta,
      serveMode: payload.serveMode,
    };
  } catch (error) {
    return {
      results: [],
      counts: { items: 0, people: 0, boards: 0 },
      total: 0,
      error: friendlyBackendError(error),
    };
  }
}
