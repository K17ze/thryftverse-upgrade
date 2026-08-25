# 09 — Discovery, Search and Galleria Convergence

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owner:** Discovery platform + Native product
**Status:** **P1 department / P0 route-ownership, semantic-contract and production-truth defects**

---

## 1. Executive verdict

ThryftVerse does not have one discovery product. It has **six screens** (`HomeScreen`, `SearchScreen`, `GlobalSearchScreen`, `UnifiedDiscoveryScreen`, `BrowseScreen`, `GalleriaScreen`) owning overlapping portions of the same user journey, **two server modules** registering the same `/search/autocomplete` route, **three retrieval implementations** (PostgreSQL FTS, Meilisearch adapter, in-memory index) that can produce materially different answers depending on process environment, and **session state** spread across component state, Zustand, and two AsyncStorage key schemes.

This is not primarily a visual redesign problem. It is a **source-of-truth problem** that leaks into Back behaviour, saved searches, result counts, filtering, instrumentation, degraded-mode truth and accessibility. The correct decision is to converge on one versioned `DiscoverySession` and one server orchestration facade while retaining different compositions for ambient Home, instrumental Search and authored Galleria. Do **not** build a seventh wrapper screen.

### 1.1 Maturity scorecard

| Capability | Score | Evidence-based judgement |
|---|---:|---|
| Native entry and visual quality | 3/5 | Strong masonry/media primitives, but six orchestration owners and duplicate first-viewports |
| Query/session continuity | 1/5 | No durable session ID, cursor lineage, scroll restoration or single recent-search owner |
| Lexical retrieval | 3/5 | PostgreSQL FTS and Meilisearch adapter exist; result semantics differ by endpoint |
| Semantic retrieval | 0/5 | `hybrid.embedded` field name is wrong; Meilisearch requires `embedder`. Semantic path is unreachable |
| Facets/sort correctness | 1/5 | Browse silently maps "Most liked"→`newest`; GlobalSearch caps at 16 of 50 results |
| Editorial convergence | 1/5 | `fetchGalleriaEditorials` always returns mock data; no `/galleria/editorials` backend route exists |
| Index freshness/deletion | 3/5 | Full/single/delete sync exists; startup configuration swallows failures and has no end-to-end freshness proof |
| Degraded-mode truth | 1/5 | Meilisearch adapter silently falls back to process-local in-memory index; `retrievalInfo()` still reports `meilisearch` |
| Measurement/experimentation | 2/5 | Cache analytics exist; no canonical exposure/session attribution across surfaces |
| Accessibility/state coverage | 3/5 | Several screens cover loading/error/empty; state vocabulary and announcements are inconsistent |
| **Overall** | **1.8/5** | **Capable components, fragmented product and operational ownership, dishonest degradation reporting** |

---

## 2. Canonical code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`. Symbols and route literals are the stable evidence anchors.

### 2.1 Frontend screens

| Layer | File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|---|
| Home | `HomeScreen.tsx` / `effectiveForYouData` | 582–584 | `forYouFeed.listings.length > 0 ? forYouExploreData : exploreData` — silent fallback to all listings when recommendations empty; no error banner, no `SyncStatusPill` | P1 truth |
| Home | `HomeScreen.tsx` / polling timer | 386–390 | 55s `setInterval` silent refresh regardless of feed mode | P2 |
| Explore | `SearchScreen.tsx` / `submitSearch` | 74–86 | Stores recents under `@thryftverse_recent_searches:<user>` then navigates to `GlobalSearch`; does not render results itself | P1 duplication |
| Explore | `SearchScreen.tsx` / `TRENDING_SEARCHES` | 33 | Hardcoded `['Vintage denim', 'Y2K bags', 'Linen shirts', 'Chunky boots', 'Gold jewellery']` — not derived from inventory | P2 |
| Results | `GlobalSearchScreen.tsx` / `rankedListings` | 516–584 | When `backendSearchResults.length > 0` (line 517), returns backend results as-is; affinity/recency heuristic only runs on empty backend results — personalisation silently dropped on most common path | P0 rank ownership |
| Results | `GlobalSearchScreen.tsx` / `getRecencyBoost` | 161–167 | `Math.max(0, 16 - ageHours / 8)` — recency boost only used when backend returned nothing | P1 |
| Results | `GlobalSearchScreen.tsx` / result cap | 657 | `sorted.slice(0, 16)` caps at 16 from a 50-item backend response; 34 results discarded, no pagination | P1 |
| Results | `GlobalSearchScreen.tsx` / `getBroadenedSuggestions` | 175–183 | Returns `['women', 'men']` hardcoded fallback for single-token queries | P2 |
| Browse | `BrowseScreen.tsx` / `sortMap` | 454–461 | `Most liked`→`newest`, `Ending soon`→`newest` — UI label lies about sort (truthful-UI violation, AGENTS.md §11) | P0 truth |
| Browse | `BrowseScreen.tsx` / sustainability heuristic | 635–647, 697–709 | `isSustainableGrade` computed client-side from condition/category/brand; backend `fetchFilteredListings` does not know about it, so backend results can be filtered to empty | P1 |
| Browse | `BrowseScreen.tsx` / `displayListings` | 697–709 | Re-applies sustainability filter to backend results — double filtering with no backend-native column | P1 |
| "Unified" | `UnifiedDiscoveryScreen.tsx` / `CATEGORY_PILLS` | 75 | Hardcoded `['All', 'New', 'Vintage', 'Streetwear', 'Designer', 'Home', 'Tech']` — not derived from canonical `CATEGORIES` | P1 |
| "Unified" | `UnifiedDiscoveryScreen.tsx` / category filter | 228–243 | `Vintage`, `Streetwear`, `Designer` matched as substring against `category`, `subcategory`, **and `brand`** — "Designer" matches any brand containing "designer" | P1 |
| "Unified" | `UnifiedDiscoveryScreen.tsx` / search mapping | 178–194 | `condition: null` hardcoded (discards `item.condition` from API); aspect ratio `1` (square) for all search results — masonry loses editorial rhythm | P1 |
| "Unified" | `UnifiedDiscoveryScreen.tsx` / demo filter | 143 | Only moodboards filtered for `isDemo`; `collections`, `editorials`, `featuredAssets` from `galleriaApi.ts` are NOT filtered | P2 |
| Editorial | `GalleriaScreen.tsx` / `loadAll` | 476–478 | Owns collections/editorials/featured assets as a separate feed; no shared cache with `UnifiedDiscoveryScreen` | P1 isolated corpus |

### 2.2 Frontend services

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `feedApi.ts` / `searchListingsFromApi` | 205–226 | Calls `GET /search/listings`, not adapter-backed `GET /search`; no pagination (limit only) | P1 split facade |
| `feedApi.ts` / dual-shape comment | 167–172 | "The backend has two `/search/autocomplete` handlers… Normalise both shapes here so the frontend is robust to whichever handler is active at runtime" — client code admits backend defect | P0 |
| `searchAutocompleteApi.ts` / dual-shape comment | 404–412 | Second independent admission: "The backend has two handlers for this route" | P0 |
| `searchAutocompleteApi.ts` / `AUTOCOMPLETE_DEMO_MODE` | 24 | Hardcoded `false` — demo indicator never lights up even when fallback is used | P2 |
| `searchAutocompleteApi.ts` / `recordSearch` | 393–400 | In-memory only; never persisted to backend | P2 |
| `searchAutocompleteApi.ts` / catalogue | 73–146 | 60+ hardcoded terms (Dresses, Nike, Vintage, UK 6, Black, etc.) — static, not derived from real inventory | P2 |
| `galleriaApi.ts` / `GALLERIA_DEMO_MODE` | 88 | `__DEV__` — false in production even when mock data is served | P1 |
| `galleriaApi.ts` / `fetchGalleriaEditorials` | 424–429 | **Always returns mock data**; no backend route exists. Comment: "Editorials are not yet backed by a backend table — falls back to mock." This is not a fallback — it is the only path | P0 |
| `galleriaApi.ts` / `fetchFeaturedAssets` | 435–456 | N+1 fetch pattern: 1 list + 4 detail calls; falls back to mock on any error | P1 |
| `galleriaApi.ts` / `fetchGalleriaCollections` | 407–417 | `delay(420)` artificial latency on fallback; mock collections have hardcoded Unsplash images and fabricated curator names | P1 |

### 2.3 Backend routes

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `routes/search.ts` / `registerSearchRoutes` | 58–196 | Registers `GET /search` (64), **`GET /search/autocomplete`** (112), `GET /search/health` (132), `POST /search/semantic` (144), `POST /search/reindex` (172) | Foundation |
| `routes/search.ts` / autocomplete handler | 112–130 | Returns `suggestions` from `adapter.autocomplete()` — no Redis cache, no analytics, no `responseTimeMs` | P1 |
| `routes/searchExtended.ts` / `registerSearchExtendedRoutes` | 296–452 | Registers `GET /search/listings` (301), **`GET /search/autocomplete`** (382), `GET /search/analytics` (447) | P0 duplicate |
| `routes/searchExtended.ts` / duplicate comment | 282–295 | "Both are registered; the last registration wins in Fastify, so the order in `index.ts` determines which handler serves the route at runtime" — explicit admission | P0 |
| `routes/searchExtended.ts` / autocomplete handler | 382–443 | Postgres-backed with Redis cache, `responseTimeMs`, analytics — but this is **dead code** because `search.ts` wins | P0 |
| `routes/galleria.ts` / `registerGalleriaRoutes` | 101–258 | `GET /galleria/collections` (108), `GET /galleria/collections/:id` (146), `POST /galleria/collections` (188). **No `/galleria/editorials` route** | P0 |
| `index.ts` / registration order | 16739 vs 43741 | `registerSearchExtendedRoutes` at line 16739; `registerSearchRoutes` at line 43741 — **~27,000 lines apart**. Last wins → adapter autocomplete wins, postgres cached autocomplete is dead code | P0 |

### 2.4 Backend lib

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `lib/searchAdapter.ts` / `InMemorySearchAdapter` | 155–197 | Process-local index; `health()` always returns `true` (line 184); `retrievalInfo()` honestly reports `in_memory` | Foundation |
| `lib/searchAdapter.ts` / `MeilisearchSearchAdapter` | 211–347 | `private fallback = new InMemorySearchAdapter()` (line 214); every operation silently falls back when client is null (lines 257, 275, 302, 323) | P0 |
| `lib/searchAdapter.ts` / dishonest `retrievalInfo` | 334–346 | Reports `backend: 'meilisearch'` even when serving from in-memory fallback — `retrievalMeta` attached to API responses will lie | P0 |
| `lib/searchAdapter.ts` / `ElasticsearchSearchAdapter` | 361–393 | Every method delegates to `InMemorySearchAdapter`; honestly reports `elasticsearch_placeholder` | P2 |
| `lib/searchAdapter.ts` / `createSearchAdapter` | 409–426 | Singleton via `cachedAdapter` (407) — once created, env changes ignored | P1 |
| `lib/vectorSearch.ts` / `semanticSearch` | 99–170 | `hybrid: { embedded: 'default', semanticRatio: 0.5 }` (line 114) — **wrong field name**; Meilisearch requires `embedder` | P0 |
| `lib/vectorSearch.ts` / `classifyHybridError` | 177–186 | `message.includes('embedder')` → returns `embedder_unconfigured` — the `embedded` typo produces an error containing "embedder", masking the real bug | P1 |
| `lib/searchSync.ts` / `configureSearchIndex` | 66–123 | No-op when `MEILISEARCH_URL` not set (68–70); silent, no log | P2 |
| `lib/searchSync.ts` / `syncListingsToSearchIndex` | 131–187 | Sequential per-row `adapter.index` in batches of 100; no parallelism; for 10k listings = 10k sequential calls | P1 |
| `lib/searchCache.ts` / TTLs | 16–24 | `SEARCH_CACHE_TTL=60s`, `AUTOCOMPLETE_CACHE_TTL=300s`; grace period 2x TTL (line 197) | Foundation |
| `lib/searchCache.ts` / mock Redis | 539–660 | `scan` returns `['0', []]` (586–589) — mock scan never returns keys, so `invalidateSearchCache` is a no-op in tests | P2 |

### 2.5 Critical corrections

**P0-CORRECTION-1: Duplicate Fastify route is a boot defect, not a style choice.**
`searchExtended.ts:382` and `search.ts:112` both register `GET /search/autocomplete`. Fastify defines `FST_ERR_DUPLICATED_ROUTE` for already-declared routes (confirmed in [Fastify errors reference, accessed 25 Aug 2026](https://fastify.dev/docs/latest/Reference/Errors/)). The code comment at `searchExtended.ts:289–295` claims "last registration wins" but Fastify's documented behavior is to throw on duplicate method+path within the same encapsulation context. Whether this currently boots without error depends on encapsulation boundaries (each `register*` call may create a child context). This must be proven by booting the exact server and running `printRoutes()` + a contract test. Until proven safe, this is a P0 release gate.

**P0-CORRECTION-2: Semantic search is unreachable due to field-name typo.**
`vectorSearch.ts:114` sends `hybrid: { embedded: 'default', semanticRatio: 0.5 }`. The Meilisearch Search API (confirmed [25 Aug 2026](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/multiple_embedders)) requires `hybrid: { embedder: 'default', semanticRatio: 0.5 }`. The `embedderConfigured: true` branch (lines 128–135) is unreachable. The `classifyHybridError` function (177–186) then translates the resulting error (which mentions "embedder") into `embedder_unconfigured`, making a code defect look like an environment defect.

**P0-CORRECTION-3: Editorials are fabricated, not fallback.**
`galleriaApi.ts:424–429` always returns `MOCK_EDITORIALS`. There is no `/galleria/editorials` backend route in `galleria.ts`. Both `GalleriaScreen` and `UnifiedDiscoveryScreen` display fabricated editorial content with hardcoded Unsplash images and fabricated author names. This is not a degradation — it is the only path. The `GALLERIA_DEMO_MODE = __DEV__` flag (line 88) is `false` in production, so the UI cannot honestly indicate demo mode.

---

## 3. End-to-end flow traces

### 3.1 Top-down: user intent to data

```text
Home search icon
  → navigation.navigate('UnifiedDiscovery')
  → local query/searchScope state (UnifiedDiscoveryScreen:91-110)
  → searchListingsFromApi(query, 50) (line 170)
  → GET /search/listings
  → PostgreSQL FTS (searchExtended.ts:301-378)
  → ILIKE fallback if zero FTS rows (lines 200-234)
  → Redis SWR/cache metadata (searchCache.ts)
  → local mapping to DiscoveryFeedUnit (condition: null, aspectRatio: 1)
  → screen-local Items/People composition

Explore SearchScreen input
  → user-scoped AsyncStorage recents (SearchScreen:62)
  → navigation.navigate('GlobalSearch', { initialQuery }) (line 85)
  → GET /search/listings + GET /users/search (GlobalSearchScreen:416, 477)
  → if backendSearchResults.length > 0: use as-is (line 517)
  → else: local affinity/rerank/filter/sort/broadening (lines 516-584)
  → Browse navigation with loose query params

Galleria
  → galleriaApi parallel fetches (GalleriaScreen:476-478)
  → /galleria/collections (real backend) + fetchGalleriaEditorials (always mock)
  → independent hero/collection/masonry narrative
  → collection-specific detail routes
```

### 3.2 Bottom-up: listing mutation to visible discovery

```text
PostgreSQL listings/listing_images mutation
  → caller must invoke syncSingleListing/removeListingFromIndex
  → SearchAdapter selects backend per process environment (searchAdapter.ts:409-426)
  → Meilisearch async task OR process-local in-memory index (silent fallback)
  → retrievalInfo() reports 'meilisearch' even when in-memory served (dishonest)
  → separate Redis search cache may still hold prior PostgreSQL result
  → native screens may additionally filter/rerank cached BackendDataContext rows
  → visible results can differ by endpoint, process and screen
```

The missing owner is an **outbox-driven projection coordinator** that updates the typed discovery index and invalidates all dependent query caches with measurable freshness.

---

## 4. August 2026 benchmark research

### 4.1 Pinterest — unified retrieval and ranking at scale

| Source (publication/access date) | Directly supported claim | ThryftVerse inference |
|---|---|---|
| [UniPinRec, Pinterest Engineering, 2026](https://arxiv.org/html/2606.00422) | Full-stack unification of retrieval and ranking: one input format, one model, one training stage. +1% online engagement, -11.1% latency, +63.6% QPS. Cross-stage KV cache sharing reuses user-history computation from retrieval for ranking | Converge transport/features first; do not force Home, Search and Galleria into identical ranking or UI |
| [Pinterest Manas Kubernetes migration](https://medium.com/pinterest-engineering/debugging-the-one-in-a-million-failure-migrating-pinterests-search-infrastructure-to-kubernetes-bef9af9dabf4) | Manas serves dozens of search indices; two-tier root/leaf architecture; 100+ clusters across thousands of hosts. Same infrastructure powers Search, Homefeed, Related Pins, Visual and Shopping | Reuse one candidate/index platform while preserving surface-specific policies |
| [Pinterest LLM search relevance](https://medium.com/pinterest-engineering/improving-pinterest-search-relevance-using-large-language-models-4cd938d4e892) | Cross-encoder LLM predicts Pin relevance to query; distilled into lightweight student model for serving. 5-level relevance guideline. Query-level + Pin text features | Semantic relevance must be distilled, not run as a heavy model per query |
| [Beyond Two Towers, Pinterest Ads, 2 Feb 2026](https://medium.com/pinterest-engineering/beyond-two-towers-re-architecting-the-serving-stack-for-next-gen-ads-lightweight-ranking-models-1992f2b76cbb) | GPU model inference stage inserted into optimized serving stack; latency-neutral by feature fetching + inference co-location | Heavy ranking must be staged; do not block retrieval on model inference |

### 4.2 Marketplace search ranking — Depop, Vinted, eBay Cassini (2026)

| Source | Ranking signals (directly documented) | ThryftVerse application |
|---|---|---|
| [Depop Help Centre — how search ranks](https://depophelp.zendesk.com/hc/en-gb/articles/9422984899985-How-Depop-ranks-search-results-and-recommends-listings) | Relevance (title, description, brand, category, colour), popularity (views, likes, add-to-bag), seller location, shopping habits, recency (slight), seller reputation, boosted listings | Title relevance is heaviest weight; popularity signals matter; recency is slight, not dominant |
| [Depop Algorithm 2026 — Underpriced](https://www.underpriced.app/blog/depop-algorithm-seo-guide-2026) | Two-stage: relevance filter then quality score. Quality = photo CTR, likes, conversion, seller reputation, activity, recency, price fit. Title carries heaviest weight; hashtags and category secondary; description body tertiary | Server must own both stages; client-side reranking bypasses quality signals |
| [Vinted Seller Algorithm 2026 — Vinta.App](https://blog.vinta.app/blog/vinted-seller-algorithm-how-it-works) | Two-stage filter: keyword/category match then quality/engagement rank. 2026 update: increased weight on listing freshness and main-photo CTR. Title is primary; description/hashtags secondary; category accuracy non-negotiable | Backend must enforce category accuracy; CTR on main photo is a ranking signal ThryftVerse does not collect |
| [eBay Cassini Search Engine 2026 — Ecomli](https://ecomli.com/blog/ebay-cassini-search-engine-explained-2026) | Title (first 60-70 chars heaviest), item specifics (rapidly growing weight), category, brand, MPN. Post-purchase experience: free/fast shipping, return windows, handling time, photo quality, competitive pricing. Listings missing item specifics are silently removed from filtered result sets | Structured attributes (brand, size, condition, MPN) are not optional — they are retrieval-critical. Missing attributes = invisible in filtered search |

### 4.3 Meilisearch hybrid search API (25 Aug 2026)

| Source | Confirmed fact | ThryftVerse defect |
|---|---|---|
| [Meilisearch hybrid search getting started](https://www.meilisearch.com/docs/capabilities/hybrid_search/getting_started) | `hybrid.embedder` is the required field name; `semanticRatio` controls lexical/semantic balance | `vectorSearch.ts:114` uses `embedded` — wrong field, semantic path unreachable |
| [Meilisearch multiple embedders](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/multiple_embedders) | Multiple embedders per index (text, image, semantic) with `hybrid.embedder` selecting which to use | ThryftVerse could configure separate text and image embedders for visual search (report #11) |
| [Meilisearch composite embedders (experimental)](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/composite_embedders) | Different embedders for indexing vs search — optimize cost and latency independently | Future optimization for bulk reindex vs low-latency query |
| [Meilisearch supported providers](https://www.meilisearch.com/docs/capabilities/hybrid_search/how_to/choose_an_embedder) | OpenAI, Cohere, Voyage, Jina, Mistral, Gemini, Cloudflare, AWS Bedrock, HuggingFace (local) | HuggingFace local embedder eliminates API cost for development; Cloudflare edge embedder for low-latency |

### 4.4 EU DSA recommender transparency (2026)

| Source | Requirement | ThryftVerse obligation |
|---|---|---|
| [DSA Article 27 — overview.legal](https://overview.legal/laws/dsa/art-27) | Platforms must disclose main recommender parameters in plain language; explain why content is suggested and relative importance of parameters; offer options to modify/influence | "Recommended" sort must be explainable; cannot be an opaque client-side heuristic |
| [DSA Article 38 — VLOP non-profiling](https://overview.legal/laws/dsa/art-38) | VLOPs/VLOSEs must provide at least one recommender option not based on profiling | Build non-profiled discovery now even if ThryftVerse is not yet a VLOP |
| [Bits of Freedom ruling, Oct 2025](https://the-platform-law.com/2025/10/09/the-bits-of-freedom-ruling-the-first-step-in-private-dsa-enforcement/) | Court ordered Meta to stop resetting recommender choices on page navigation/app close; non-profiling option must be persistently accessible and not technically inferior | `feedMode` must persist across sessions; non-profiled mode must not be a degraded experience |

### 4.5 Mobile scroll restoration (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Scroll Restoration in Mobile Apps — rs999.in, 21 Aug 2026](https://www.rs999.in/blog/janky-scroll-restoration-why-your-app-forgets-where-users-were-and-the-state-persistence-fix-most-devs-botch) | 23% of rage-taps happen on back button because app dumped users at top of feed. Root cause: component remounting. 4-layer fix: keep component alive, capture offset on blur, decouple restoration from data, content-anchor | Discovery screens must preserve scroll across Back; `detachInactiveScreens={false}` or equivalent |
| [Rork Lab — scroll restoration across process death](https://rorklab.net/en/articles/app-dev/rork-restore-scroll-position-back-navigation-process-death) | Two separate problems: back-navigation (navigation-structure, no storage needed) and process-death (persist offset). Confusing them leads to writing offset to disk on every frame | ThryftVerse needs both: navigation-level preservation + persisted offset for process death |

---

## 5. Capability, state and ownership matrices

### 5.1 Surface responsibility — today vs target

| Surface | Today owns | Must continue owning | Must stop owning |
|---|---|---|---|
| Home | Feed mode, feed fallback, mixed media rhythm, 55s polling | Ambient composition, Following vs For You choice | Retrieval policy, silent fallback meaning |
| Search/GlobalSearch | Query input, recents, people/items, ranking, broadening | Instrumental search composition and keyboard behaviour | Local ranking semantics, duplicate recents, entity federation, 16-item cap |
| Browse | Category/subcategory, filters, sort, density, sustainability heuristic | Category landing composition and density preference | Client-only authoritative filters, lying sort labels, client-side sustainability |
| UnifiedDiscovery | Another ambient/result hybrid with hardcoded categories | Migration shell only, then canonical explicit-search scene or retirement | Duplicate fetch/state orchestration, substring category matching |
| Galleria | Editorial graph and art direction (currently mock) | Editorial provenance, hierarchy, media treatment | Parallel discovery transport/session model, fabricated editorials |
| Server search facade | Endpoint and retrieval metadata (dishonest on fallback) | Session, federation, eligibility, cursors, explanations | Screen-specific DTOs, duplicate route registration |

### 5.2 Current state ownership

| State | Current authority | Failure | Target authority |
|---|---|---|---|
| Raw query | Each screen (GlobalSearch:333, UnifiedDiscovery:91) | Back/deep-link divergence | `DiscoverySession.rawQuery` |
| Normalized query | Each screen/server independently | Attribution mismatch | Server query-understanding result |
| Recents | AsyncStorage `@thryftverse_recent_searches:<user>` (SearchScreen:62, GlobalSearch:681) + in-memory `autocomplete_recent_${userId}` (searchAutocompleteApi:221) | Two parallel systems; in-memory wiped on reload; no cross-device sync | Account API + encrypted local cache |
| Filters | Zustand + route params + local state | Stale combinations and mismatched facets | Versioned server-compatible filter schema |
| Sort/ranking | Server plus local reranking (GlobalSearch:516-584) + lying sortMap (Browse:454-461) | Result order not reproducible; "Most liked" is actually "newest" server-side | Server policy; client only display order for explicit user sort |
| Cursor | Page/offset or absent | Duplicates/skips under inventory churn | Opaque keyset cursor bound to session/policy |
| Editorial provenance | Galleria DTO (mock) | Cannot blend/measure consistently; fabricated content | Typed candidate source metadata |
| Degraded mode | Ad hoc note/pill; `retrievalInfo()` lies | Silent semantic changes; in-memory served as "meilisearch" | `serveMode` + capability contract |
| Exposure | Screen analytics | Duplicate/missing impressions | Viewability event keyed by session/result token |

### 5.3 Pagination inconsistency

| Surface | Pagination mechanism |
|---|---|
| `fetchHomeFeed` | cursor (`nextCursor`) |
| `searchListingsFromApi` | none (limit only, capped 50) |
| `fetchFilteredListings` (Browse) | none |
| `GET /search` (search.ts) | offset (line 36) |
| `GET /search/listings` (searchExtended.ts) | page → offset (line 31) |
| `GET /galleria/collections` | limit + offset |
| `fetchGalleriaCollections` | limit only (24) |
| `fetchFeaturedAssets` | limit only (6) + N+1 detail fetches |

No consistent pagination contract. Cursor and offset coexist. Most frontend surfaces have **no pagination at all** — they fetch a fixed limit and stop.

---

## 6. User psychology, JTBD and trust

### 6.1 Jobs to be done

1. **Known item:** "I know roughly what I want; help me narrow fast." Success is low interaction cost, stable filters and exact-match confidence.
2. **Taste articulation:** "I know the feeling, not the vocabulary." Success is useful semantic/visual reformulation with reversible correction.
3. **Ambient inspiration:** "Show me objects worth stopping for." Success is coherent novelty, not a settings-heavy query UI.
4. **Editorial learning:** "Help me understand why this object or creator matters." Success is authored context and provenance, not algorithmic sameness.
5. **Recovery:** "My words returned nothing; help without changing the deal behind my back." Success is explicit relaxation and preserved agency.

### 6.2 Psychological failure modes

- **Loss of place:** Back returns to a reset query/grid. 23% of rage-taps are on Back ([rs999.in, Aug 2026](https://www.rs999.in/blog/janky-scroll-restoration-why-your-app-forgets-where-users-were-and-the-state-persistence-fix-most-devs-botch)). ThryftVerse has no scroll restoration or session persistence.
- **Choice overload:** Many category pills/cards before useful inventory make the user do taxonomy work. `UnifiedDiscoveryScreen` has 7 hardcoded category pills with substring matching.
- **False precision:** "Recommended" after client-side heuristic reranking implies an authority the system cannot reproduce. The heuristic is bypassed when backend returns results (GlobalSearch:517).
- **Filter betrayal:** Silently relaxing size/condition breaks the user's mental contract. Browse's sustainability filter can eliminate all backend results without explanation.
- **Sort betrayal:** "Most liked" in Browse sorts by `newest` server-side (Browse:454–461). The user thinks they see most-liked items; they see newest items.
- **Context collapse:** Mixing an editorial essay and a listing without provenance makes curation look like paid/ranked placement. Galleria editorials are fabricated mock content.
- **Intermittent truth:** Different screens returning different inventories teaches users to repeat searches rather than trust one answer. Six surfaces with independent data fetching.
- **Degradation dishonesty:** `retrievalInfo()` reports `meilisearch` when in-memory index served the request. Users and operators cannot trust capability claims.

---

## 7. Flagship native direction and strict anti-AI design

### 7.1 First viewport composition

- **Explicit search:** safe-area header with transparent Back target, one 44pt search field, optional camera glyph; below it, a flat two-mode underline only when multiple entity types have results. First useful result begins immediately.
- **Ambient discovery:** media grid/hero is dominant. Search is utility, not a large decorative panel.
- **Galleria:** one authored hero object/story and the edge of the next collection. Editorial byline/provenance is quiet but visible.
- Normal result viewport target: 4–6 useful rows or two-plus meaningful media objects. Above-fold rounded-container budget: one non-media panel maximum.

### 7.2 Remove AI-made tells

- No "AI Search" sparkle pill unless the mode changes user capability and the method is truthful; call it "Describe what you want."
- No repeated category-card dashboard, chip wall, gradient header, glass panels or card-on-card filters.
- No method-confidence percentages. Surface "Matched title and brand" or "Visually similar" only when supported by response metadata.
- One radius grammar, one icon family and one 160–220ms transition language. Do not animate historical result cells on mount.
- No fabricated editorial content. If editorials do not exist, do not render an editorial section — do not mock it.

### 7.3 Full native state machine

| State | Visual/interaction treatment |
|---|---|
| `idle_no_history` | Field focused, three restrained inventory-grounded suggestions; no generic welcome copy |
| `idle_with_history` | Flat recent rows with remove-all; server/cache provenance invisible unless degraded |
| `typing` | Preserve typed text; debounce suggestions; keyboard remains stable |
| `suggestions_partial` | Render available suggestion classes; do not block on one failed vertical |
| `submitting` | Keep previous results dimmed only if query is refinement; skeleton final geometry for new query |
| `populated` | Server order, stable keys, viewability tracking, filter summary |
| `filtered_empty` | Name the blocking filters; offer one-tap removal with preview count |
| `zero_results` | Spellcheck/reformulation and explicit relaxations; never generic inventory |
| `partial_vertical` | Show successful vertical and a local retry row for failed vertical |
| `offline_cached` | Preserve cached results and timestamp; disable server-dependent refinements truthfully |
| `backend_degraded` | Use non-personalized/lexical mode label only when meaning materially changes; report honest `serveMode` |
| `stale_session` | Restore query then refresh; preserve scroll anchor until replacement is ready |

### 7.4 Accessibility and motion

- Announce result count once after settled response, not on every keystroke.
- Expose selected vertical/filter and expanded filter sheet states.
- Filter summary must be readable text, not colour/chips alone.
- Dynamic Type may wrap result title/price without occluding action targets.
- Focus returns to the result heading after submit and to the originating control after sheet dismissal.
- Reduced motion uses immediate underline changes/crossfade; no parallax or full-grid reanimation.

---

## 8. Target architecture and source-of-truth boundaries

```text
Native mode-specific composition
  → DiscoverySessionStore (local cache, server-issued identity)
  → POST /v1/discovery/sessions/:id/search
  → query understanding + policy/consent
  → typed candidate federation
       lexical | semantic | social | editorial | trend | visual
  → eligibility (active inventory, moderation, trust, geography)
  → vertical rankers
  → deterministic dedupe + whole-page blend
  → opaque cursor + result token + explanations
  → client viewability/outcome events

Domain outbox
  → projection workers
  → versioned listing/creator/look/moodboard/editorial indexes
  → cache tag invalidation
  → freshness reconciliation
```

### 8.1 Boundary decisions

- PostgreSQL remains authoritative for entity/inventory state.
- Search indexes are rebuildable projections, never the source of listing truth.
- Server owns eligibility, retrieval, ranking, spelling and relaxation policy.
- Client owns presentation mode, keyboard/focus, scroll restoration and explicit display preferences.
- Galleria owns editorial authorship; Discovery owns delivery/session/exposure contracts.
- No process-local backend is permitted in production serving.
- `retrievalInfo()` must report the **actual backend that served the request**, not the configured backend.

---

## 9. Proposed contracts, schemas and events

### 9.1 Discovery session

```ts
type DiscoveryMode = 'ambient' | 'explicit' | 'category' | 'editorial' | 'visual';
type ServeMode = 'personalized' | 'non_profiled' | 'cold_start' | 'degraded_lexical';

interface DiscoverySession {
  id: string; actorId: string | null; anonymousId: string | null;
  entryPoint: string; mode: DiscoveryMode;
  rawQuery: string; normalizedQuery: string;
  vertical: 'all' | 'listing' | 'person' | 'look' | 'moodboard' | 'editorial';
  filters: DiscoveryFilterV1; sort: DiscoverySort;
  serveMode: ServeMode; consentVersion: string;
  policyVersion: string; experimentAssignments: string[];
  intentVersion: number; createdAt: string; expiresAt: string;
}
```

### 9.2 Result envelope

```ts
interface DiscoveryPage {
  sessionId: string; requestId: string; resultToken: string;
  policyVersion: string; indexVersions: Record<string, string>;
  serveMode: ServeMode; totalRelation: 'exact' | 'lower_bound' | 'unknown';
  entities: DiscoveryEntity[]; facets: FacetBucket[];
  cursor: string | null; partialFailures: VerticalFailure[];
  appliedRelaxations: Relaxation[]; generatedAt: string;
}
```

`DiscoveryEntity` is a discriminated union. Every member carries `entityType`, canonical ID, navigation target, `candidateSource`, source rank, eligibility policy, editorial/sponsored provenance, and display-ready media geometry. Screens do not guess types or routes.

### 9.3 Persistence and events

- `discovery_sessions`: identity, mode, query/filters, serve mode, policy/consent, expiry.
- `discovery_requests`: request/session IDs, cursor hash, index/policy versions, latency and vertical status; avoid raw sensitive query retention beyond policy.
- `discovery_result_exposures`: result token, entity, position, rendered/viewable status, dwell bucket.
- `search_history`: actor-scoped, encrypted where appropriate, delete/reset timestamps and sync version.
- `saved_searches`: canonical filter schema, alert consent/channel, last evaluated cursor and authoritative match count.

```text
listing.published.v2 / listing.updated.v2 / listing.unpublished.v2
creator.public_profile.updated.v1
look.published.v1 / moodboard.published.v1 / editorial.published.v1
discovery.query.submitted.v1
discovery.results.served.v1
discovery.entity.rendered.v1 / discovery.entity.viewable.v1
discovery.relaxation.accepted.v1
discovery.result.opened.v1 / discovery.search.saved.v1
```

Mutation/outbox ID is the indexing idempotency key. Projectors record `(event_id, projection_name, schema_version)` uniquely. Cursors are signed and bind session, policy, query hash, sort key and last entity key; clients cannot edit them.

### 9.4 Privacy/security

- Query text can disclose sensitive intent. Define purpose, retention, export/delete and access-control classifications.
- Anonymous and authenticated histories must merge only after explicit account transition logic; never key a guest merely as a shared string.
- Rate-limit by actor/device/IP risk, not query alone. Prevent enumeration through people-search projection and privacy settings.
- Do not log raw queries in general application logs. Use redaction and sampled secured analytics.
- Editorial and sponsored provenance must survive caching and blending.

---

## 10. Algorithms, evaluation and guardrails

### 10.1 Retrieval stack

1. Query normalization/language detection without rewriting the displayed user text.
2. Exact SKU/brand/title and typo-tolerant lexical retrieval.
3. Semantic retrieval only when model/index readiness is proven (fix `embedder` field first).
4. Typed candidate federation across eligible verticals.
5. Entity dedupe and listing-family/duplicate-image suppression.
6. Rank by intent-specific objectives; diversify seller/category without violating exact intent.
7. Relax constraints only as an explicit, logged policy step.

### 10.2 Ranking signals (informed by Depop/Vinted/eBay Cassini 2026)

Per the 2026 benchmark research, marketplace search ranking converges on:

| Signal bucket | Depop | Vinted | eBay Cassini | ThryftVerse today |
|---|---|---|---|---|
| Title keyword relevance | Heaviest weight | Primary signal | First 60-70 chars heaviest | Client-side substring match (GlobalSearch:530-543) |
| Structured attributes (brand, size, condition, category) | Secondary | Non-negotiable category accuracy | Rapidly growing weight; missing = invisible in filters | Backend FTS includes them; Browse sortMap ignores them |
| Photo quality / CTR | Quality score input | Direct ranking signal (2026 update) | Photo quality reward | Not collected |
| Listing freshness / recency | Slight favour | Increased weight (2026 update) | Factor | `getRecencyBoost` (GlobalSearch:161-167) but bypassed when backend returns results |
| Seller reputation | Factor | Factor | Factor | Not in search ranking |
| Popularity (views, likes, saves) | Factor | Engagement rate | Factor | `Math.min(listing.likes, 120) * 0.22` (GlobalSearch:525) but bypassed |
| Price competitiveness | Factor | Factor | Factor | Not in search ranking |
| Shipping speed/cost | — | — | Reward | Not in search ranking |

ThryftVerse's search ranking is materially behind all three benchmarks. The client-side heuristic that exists is bypassed on the most common path.

### 10.3 Evaluation

- Human-judged query set split into exact item, brand/category, descriptive, misspelling, long-tail, zero-result, people and editorial intents.
- nDCG@10, MRR@10, Recall@50, exact-match success, facet correctness, zero-result rate, unsafe/inactive leakage and seller concentration.
- Slice by language, spelling quality, category, sparse sellers, new inventory and accessibility-driven voice/dictation queries.
- Online success includes reformulation, filter churn, long-click/detail quality, save/message/checkout, return/report and abandonment—not clicks alone.
- Run interleaving for ranker comparisons where safe; A/B for composition/system changes.
- Guardrails: no increase in reports/counterfeit exposure, seller Gini/concentration, zero-result rate, latency or cross-session repetition.

---

## 11. Threat and failure-mode analysis

| Failure | Current exposure | Required control |
|---|---|---|
| Duplicate route registration | Two `/search/autocomplete` declarations (searchExtended:382, search:112); 27,000 lines apart in index.ts | Boot contract test; delete one owner before release |
| Silent process-local fallback | Meili adapter falls back to in-memory (searchAdapter:214,257,275); `retrievalInfo()` lies (334-346) | Production readiness fail closed; honest `serveMode` in response |
| Semantic path never succeeds | `embedded` parameter typo (vectorSearch:114) | Version-pinned integration test and readiness probe |
| Error classification masks bug | `classifyHybridError` (177-186) translates `embedded` typo into `embedder_unconfigured` | Fix field name; add unit test for error classification |
| Cache/index inconsistency | Independent Redis and index updates | Transactional outbox, cache tags, reconciliation and freshness SLI |
| Pagination duplicates/skips | Offset/page with mutable inventory; most surfaces have no pagination at all | Signed keyset cursor and snapshot/policy binding |
| Local/server rank divergence | GlobalSearch reranks locally (516-584) but bypasses on backend results; Browse sortMap lies (454-461) | One server order; explicit local sort only |
| Inactive/unsafe item leakage | Projection lag | Final authoritative eligibility join/filter before serve |
| Editorial provenance loss | Ad hoc blending; editorials are fabricated mock | Required provenance field; do not render editorial section if no real editorials exist |
| People enumeration | Broad username endpoint | Privacy projection, rate limits, block rules and minimal fields |
| Query privacy leak | Raw query analytics/logging | Classification, redaction, retention and access audit |
| N+1 fetch pattern | `fetchFeaturedAssets` does 1 list + 4 detail calls (galleriaApi:435-456) | Backend endpoint returns composed response |
| Sustainability filter empties results | Client-side heuristic (Browse:635-647,697-709) can eliminate all backend results | Backend-native sustainability column or pre-computed grade |

---

## 12. SLOs, SLIs and observability

| SLI | Target |
|---|---:|
| Search API availability | 99.95% monthly, excluding explicit maintenance |
| Cached query latency | p50 <100ms, p95 <250ms server-side |
| Uncached federated query | p95 <600ms, p99 <1,200ms |
| Autocomplete | p95 <150ms after 2+ characters |
| Listing publish/update → searchable | p95 <5s, p99 <30s |
| Unpublish/delete → unservable | p99 <30s, with final eligibility fail-closed immediately |
| Session restore | p95 <200ms from local snapshot |
| Duplicate exposure events | <0.1% per result token/entity/status |
| Production process-local serves | exactly 0 |
| `retrievalInfo()` honesty | 100% — reported backend matches actual serving backend |

Trace spans: native submit → API gateway → query understanding → each candidate source → eligibility → rank/blend → serialization. Metrics carry request/session/policy/index versions, serve mode, cache state, vertical partial failures and relaxation count—not raw sensitive query text. Alert on zero-result spikes, fallback/degraded rate, freshness lag, route-boot failure and divergence between DB active counts and index projections.

---

## 13. Migration, compatibility and rollback

### 13.1 Feature flags

```text
discovery_session_v1
discovery_facade_v1
discovery_server_rank_v1
discovery_editorial_candidates_v1
discovery_semantic_candidates_v1
discovery_canonical_native_scene_v1
discovery_honest_serve_mode_v1
```

### 13.2 Safe sequence

1. **Boot safety:** remove duplicate autocomplete registration behind a compatibility alias; snapshot old/new DTO contract tests. Add `printRoutes()` boot test.
2. **Honesty:** fix `retrievalInfo()` to report actual serving backend; fix `vectorSearch.ts:114` `embedded`→`embedder`; fix `classifyHybridError` to distinguish field-name errors from configuration errors.
3. **Observe:** add entry-point/route telemetry and result fingerprints without changing output.
4. **Session shadow:** issue `sessionId` while old screens still own UI; dual-write recents/saved-search state.
5. **Facade shadow:** call old and new retrieval paths on sampled traffic; compare IDs/order/eligibility, never expose shadow results.
6. **Server-rank cutover:** stop GlobalSearch/Browse local reranking by cohort; fix Browse sortMap to send honest sort labels; preserve an emergency old-policy flag.
7. **Native convergence:** migrate deep links and Back restoration screen by screen. Remove a screen only after 30 days of zero route usage and app-version floor review.
8. **Editorial candidate integration:** build `/galleria/editorials` backend route; retain Galleria composition; share entity/session/exposure contracts. Remove mock editorials.
9. **Semantic enablement:** only after report 11's model/index gates pass.

Rollback changes policy/feature flag, not schema. New columns/tables are additive; old clients continue receiving compatible listing DTOs. Keep old endpoint adapters for a versioned deprecation window and measure usage by app version.

---

## 14. Phased implementation plan mapped to files/owners

### Phase 0 — P0 truth and inventory (1 sprint)

- **Backend/Search:** consolidate `/search/autocomplete` (delete `searchExtended.ts:382–443` or `search.ts:112–130`); correct `embedder` field in `vectorSearch.ts:114`; fix `retrievalInfo()` in `searchAdapter.ts:334–346`; add server boot and real-Meilisearch tests in `routes/search*.ts`, `lib/vectorSearch.ts`, `index.ts`.
- **SRE:** prohibit in-memory/Elasticsearch-placeholder backends in production readiness.
- **Analytics:** instrument each screen/endpoint and result fingerprints.
- **Galleria:** either build `/galleria/editorials` backend route or remove the editorial section from `GalleriaScreen` and `UnifiedDiscoveryScreen` until real content exists.

### Phase 1 — contracts and projection reliability (2–3 sprints)

- **Discovery platform:** add session/result/entity contracts and `/v1/discovery` facade.
- **Data platform:** domain-outbox consumers, projection ledger and reconciliation.
- **Search relevance:** judgement set, baseline evaluator and facet/eligibility tests.
- **Browse honesty:** fix `sortMap` (Browse:454–461) to send honest sort labels; add backend-native sustainability column.
- Likely changes: new migration(s), `backend/api/src/routes/discovery.ts`, search adapter/sync/cache, shared frontend schema/service.

### Phase 2 — native convergence (2–4 sprints)

- **Native/Design:** canonical search field/results scene; route adapters for `SearchScreen`, `GlobalSearchScreen`, `UnifiedDiscoveryScreen`, `BrowseScreen`.
- **Mobile platform:** session persistence, scroll/focus restoration (4-layer framework per [rs999.in, Aug 2026](https://www.rs999.in/blog/janky-scroll-restoration-why-your-app-forgets-where-users-were-and-the-state-persistence-fix-most-devs-botch)), encrypted/account cache migration.
- **Accessibility:** screen-reader/Dynamic Type/reduced-motion test matrix.
- **Recents convergence:** merge AsyncStorage recents and in-memory `autocomplete_recent_${userId}` into one account-scoped system.

### Phase 3 — typed editorial and multimodal candidates (2+ sprints)

- **Editorial/Galleria:** publish indexable editorial entities with provenance; replace mock editorials with real authored content.
- **ML/Search:** semantic and visual candidate sources behind readiness flags.
- **Trust:** entity eligibility and people-search privacy projection.

### Phase 4 — deletion and simplification

- Remove redundant screen orchestration and legacy endpoints only after usage, app-version and deep-link gates.
- Delete local business heuristics after server parity evidence, not before.
- Remove `UnifiedDiscoveryScreen` only after `GlobalSearchScreen` consumes the facade and deep-link telemetry proves zero usage.

---

## 15. Test, evaluation and release gates

- Exact server boot succeeds with all routes and `printRoutes()` snapshot contains one handler per method/path.
- Old/new clients parse the facade across supported app versions.
- Meilisearch integration proves lexical, typo, filter, sort and hybrid query against the pinned server version using `embedder` field.
- `retrievalInfo()` reports `in_memory` when in-memory served, `meilisearch` only when Meilisearch actually served.
- Cursor tampering/reuse with changed query/policy is rejected.
- Outbox replay is idempotent; update/delete reconciliation reaches zero drift.
- Deep link → query → result → detail → Back restores query/filter/scroll/focus.
- Cold start and app restart restore permissible session state.
- Keyboard, orientation, low memory and offline transitions do not duplicate submissions or results.
- VoiceOver/TalkBack announces result count, selected scope, relaxations and errors once.
- Fixed judgement set meets nDCG/MRR/zero-result thresholds and no protected slice regresses beyond tolerance.
- Browse "Most liked" sort actually sorts by likes, not `newest`.
- No editorial section renders when no real editorials exist.
- Canary 1% → 5% → 25% → 50% → 100%, with automatic rollback on eligibility leak, latency, crash, zero-result or report guardrail.
- Dashboard proves zero in-memory serves and index freshness SLO before retiring old paths.

---

## 16. Explicit non-goals

- Making Home, Browse, Search and Galleria visually identical.
- Replacing editorial judgement with an ML ranker.
- Launching generative conversational answers in search.
- Personalizing every query or hiding explicit sort/filter intent.
- Building a custom vector database before current infrastructure is evaluated.
- Removing legacy screens before deep-link/app-version telemetry proves safety.
- Rendering fabricated editorial content as if it were real curation.

---

## 17. Decisions requiring product, privacy or legal input

1. Which user histories sync across devices, for how long, and how guest history merges after sign-in.
2. Exact non-profiled discovery definition and whether it is a persistent account choice (DSA Article 38).
3. Whether editorial, sponsored and marketplace-priority placements can blend—and mandatory labels/order rules.
4. People-search discoverability defaults, block semantics and minor protections.
5. Saved-search alert consent, notification channels and frequency.
6. Ranking marketplace objectives and acceptable seller-concentration guardrails.
7. Query analytics retention and access policy, especially sensitive/inferred intent.
8. Whether to build a `/galleria/editorials` backend or remove the editorial surface until real content exists.

---

## 18. Final decision

**APPROVE CONVERGENCE; BLOCK NEW DISCOVERY SURFACES.** First fix duplicate route ownership, semantic contract correctness, `retrievalInfo()` honesty and fabricated editorials. Then introduce a versioned discovery session/facade, migrate screen orchestration one route at a time, and integrate Galleria as a typed authored candidate source without flattening its composition. Flagship quality is one reliable system expressed through distinct human-authored modes—not one generic dashboard and not six competing truths.
