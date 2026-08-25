# 11 — Visual and Semantic Search

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Search/ML + Media platform + Native + Security/Privacy
**Status:** **P1 department / P0 security, placeholder-serving and semantic-contract gates**

---

## 1. Executive verdict

ThryftVerse's current user-facing visual search is a real, deterministic colour/layout heuristic and is labelled honestly. That is a legitimate baseline. It is not semantic product retrieval. The offline embedding worker stores 512 zeroes marked `placeholder` (`mediaEmbeddingHandler.ts:171`), the embedding table uses unindexed `BYTEA` (`145_media_embeddings.sql:44`), and no production vector candidate path reads those rows.

The deeper audit finds three blockers beyond model absence:

1. **SSRF vulnerability:** `POST /visual-search` accepts an arbitrary `imageUrl` (`visualSearch.ts:21`) and follows redirects server-side (`visualSearch.ts:59–61`, `redirect: 'follow'`) without network allow/deny controls. Both query and candidate download helpers expose an SSRF/resource-exhaustion boundary.
2. **Query-time fan-out DoS:** A request can download and decode up to 150 candidate images at query time (`visualSearch.ts:35` `CANDIDATE_CAP = 150`). With eight workers (`visualSearch.ts:37`) and 4-second per-image timeouts, worst-case tail latency is incompatible with flagship search and can amplify outbound traffic.
3. **Semantic text path is unreachable:** `vectorSearch.ts:114` sends `hybrid: { embedded: 'default' }` instead of Meilisearch's documented `hybrid: { embedder: 'default' }`. The `embedderConfigured: true` branch is unreachable; `classifyHybridError` (line 182) masks the typo as `embedder_unconfigured`.

The decision is to keep the heuristic available and truthfully named, immediately harden remote-media ingestion, prevent placeholder vectors from any serving projection, then build an evaluated asynchronous embedding/index pipeline. Do not market "AI visual search" until the real index beats the heuristic on a fixed commerce benchmark and passes privacy/security gates.

### 1.1 Maturity scorecard

| Capability | Score | Evidence-based judgement |
|---|---:|---|
| Native capture/gallery flow | 3/5 | Camera/gallery, preview, filters and masonry exist; request racing and error semantics are incomplete |
| Heuristic visual matching | 3/5 | Real 64-bin colour histogram + spatial/luminance/contrast/aspect scoring (`visualSimilarity.ts:154–168`), honestly disclosed |
| Semantic text retrieval | 0/5 | Meili hybrid extension exists but `embedded` field defect (`vectorSearch.ts:114`) makes semantic path unreachable |
| Multimodal embedding generation | 1/5 | Versioned schema/worker scaffold, but generator returns 512 zeroes (`mediaEmbeddingHandler.ts:171`) |
| Vector serving/index | 0.5/5 | `BYTEA` (`145_media_embeddings.sql:44`), no pgvector/HNSW and no serving projection |
| Composed image+text retrieval | 1/5 | UI sends both image and text/facets, but text is only SQL filtering and image heuristic is final reorder |
| Security | 1/5 | Arbitrary remote fetch with redirects (`visualSearch.ts:59–61`), no IP/scheme/size enforcement |
| Privacy/retention | 1/5 | Request table stores raw image URL (`visualSearch.ts:96–100`) with no expiry; local base64 path is unmodelled |
| Evaluation/governance | 2/5 | Model artifact registry exists (`migration 144`); no visual benchmark or promotion evidence |
| Operational reliability | 1.5/5 | Bounded concurrency/timeouts, but synchronous candidate media fetch and process-local cache |
| UX truth/accessibility | 2/5 | Honest result note and labelled controls; decorative scanline animation (`VisualSearchScreen.tsx:68–113`) contradicts current capability |
| **Overall** | **1.5/5** | **Useful honest heuristic; not production semantic search; P0 security defects** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Frontend — visual search screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `VisualSearchScreen.tsx` / state | 66 | `refreshing` state; `status` never set to `'error'` — service converts exceptions to fallback result | P1 |
| `VisualSearchScreen.tsx` / scanline animation | 68–113 | `scanLineAnim` + `scanOpacityAnim` — Instagram-style scanning overlay with loop animation; comment says "communicate AI analysis is in progress" but backend is heuristic, not AI | P1 anti-AI |
| `VisualSearchScreen.tsx` / scan brackets | 405–430 | `scanBracketTL/TR/BL/BR` — four corner brackets rendered during loading; decorative AI theatre | P1 anti-AI |
| `VisualSearchScreen.tsx` / `readImageAsBase64` | 236–258 | Reads entire local image as base64 and posts inline; remote URI forwarded as `imageUrl` | P0 payload/security |
| `VisualSearchScreen.tsx` / `runSearch` | 260–290 | No abort signal/request sequence; overlapping auto-run, Apply and refresh responses can overwrite newer intent; `setStatus(items.length > 0 ? 'populated' : 'empty')` (line 289) — error state unreachable | P1 |
| `VisualSearchScreen.tsx` / `handleSaveSearch` | 359–377 | Stores text/facets with `alertsEnabled: true` (line 375), but no query image, embedding or asset reference — truthful alert semantics violation | P0 |
| `VisualSearchScreen.tsx` / scan styles | 819–870 | `scanOverlay`, `scanLine`, `scanBracketTL/TR/BL/BR` style definitions | P1 |

**Critical quote — the scanline animation (`VisualSearchScreen.tsx:68–71`):**
```ts
// ── Instagram-style scanning animation ──────────────────────────────
// When a photo is captured/selected, an animated scanline sweeps across
// the thumbnail to communicate AI analysis is in progress.
const scanLineAnim = useRef(new RNAnimated.Value(0)).current;
```
The backend explicitly says `similarityMethod='heuristic_color_features'` — this is not AI analysis. The animation is deceptive under AGENTS.md §11 (Truthful UI) and DSA Article 25 (prohibits deceptive designs).

**Critical quote — `handleSaveSearch` storing no image (`VisualSearchScreen.tsx:359–377`):**
```ts
const handleSaveSearch = useCallback(() => {
  if (!imageUri) return;
  haptic.success();
  addSavedSearch({
    query: saveSearchLabel,
    filters: { ... },
    alertsEnabled: true,
  });
  show('Search saved with alerts enabled', 'success');
```
The saved search contains text/facets only — no query image, no embedding, no asset reference. Alerting "enabled" on a visual search with no visual query representation is deceptive.

### 2.2 Backend — visual search route

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `visualSearch.ts` / `visualSearchBodySchema` | 20–32 | `imageUrl: z.string().optional()` (line 21), `imageBase64: z.string().optional()` (line 22) — unbounded optional strings; URL not constrained to HTTPS or trusted media | P0 |
| `visualSearch.ts` / `CANDIDATE_CAP` | 35 | `const CANDIDATE_CAP = 150;` — up to 150 candidate listings scored per query | P0 latency |
| `visualSearch.ts` / `SCORING_CONCURRENCY` | 37 | `const SCORING_CONCURRENCY = 8;` — 8 concurrent image downloads at query time | P0 egress |
| `visualSearch.ts` / `decodeQueryImage` | 44–64 | Fetches user-supplied URL with `redirect: 'follow'` (line 61), 5s timeout; no DNS/IP denylist, content type or byte cap | P0 SSRF |
| `visualSearch.ts` / telemetry insert | 96–101 | `INSERT INTO visual_search_requests (id, image_url, created_at)` — stores raw `image_url`; request ID uses `Date.now() + Math.random()`; user ID/status/result not populated | P1 privacy |
| `visualSearch.ts` / candidate fetch | 228–231 | `mapWithConcurrency(scoreableIndices, SCORING_CONCURRENCY, ...)` — downloads/decodes candidate images at request time | P0 |
| `visualSearch.ts` / result method | 305–308 | `imageSupplied` + `visualFallbackReason` — honest disclosure of heuristic vs filter-only | Foundation |

**Critical quote — the SSRF exposure (`visualSearch.ts:55–62`):**
```ts
  if (payload.imageUrl && payload.imageUrl.trim().length > 0) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(payload.imageUrl, {
        signal: controller.signal,
        redirect: 'follow',
      });
```
No HTTPS enforcement, no IP allow/deny list, no DNS rebinding protection, no content-type validation, no byte cap before buffering. Per [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), this is a textbook SSRF vector: an attacker can supply `http://169.254.169.254/latest/meta-data/` (cloud metadata), `http://localhost:admin-port/`, or `file:///etc/passwd` (depending on fetch implementation).

### 2.3 Backend — visual similarity heuristic

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `visualSimilarity.ts` / `FEATURE_CACHE_MAX` | 51 | `const FEATURE_CACHE_MAX = 512;` — process-local cache of 512 URLs | P1 |
| `visualSimilarity.ts` / `featureCache` | 53 | `const featureCache = new Map<string, ImageFeatures>()` — per-instance, URL-keyed, no checksum/version/TTL | P1 |
| `visualSimilarity.ts` / `extractImageFeatures` | 62 | `sharp(buffer, { failOn: 'none' })` — tolerant decode; no decoded pixel/dimension bomb policy | P0 |
| `visualSimilarity.ts` / `computeSimilarity` | 154–168 | Fixed weights: `0.45 * histSim + 0.30 * gridSim + 0.10 * lumSim + 0.05 * contrastSim + 0.10 * aspectSim` | Foundation |
| `visualSimilarity.ts` / `extractRemoteImageFeatures` | 229–245 | Fetches remote URL, caches by URL string; FIFO eviction (lines 238–242) | P1 |

**Critical quote — the fixed-weight similarity (`visualSimilarity.ts:148–168`):**
```ts
 * Weighting:
 *   - colour histogram (cosine):  0.45
 *   - spatial grid (distance):    0.30
 *   - luminance agreement:        0.10
 *   - contrast agreement:         0.05
 *   - aspect-ratio agreement:     0.10
 */
export function computeSimilarity(a: ImageFeatures, b: ImageFeatures): number {
  const histSim = cosineSimilarity(a.histogram, b.histogram);
  const gridSim = gridAgreement(a.grid, b.grid);
  ...
  const score =
    0.45 * histSim +
    0.30 * gridSim +
    0.10 * lumSim +
    0.05 * contrastSim +
    0.10 * aspectSim;
```
Honest baseline: 64-bin colour histogram + 2×2 spatial grid + luminance/contrast/aspect. Cannot understand object identity, style, silhouette, brand or material. Correctly disclosed as `heuristic_color_features`.

### 2.4 Backend — semantic text search

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `vectorSearch.ts` / `semanticSearch` | 99–170 | `hybrid: { embedded: 'default', semanticRatio: 0.5 }` (line 114) — wrong field name; Meilisearch requires `embedder` | P0 |
| `vectorSearch.ts` / `classifyHybridError` | 177–186 | `message.includes('embedder')` → returns `embedder_unconfigured` — the `embedded` typo produces an error containing "embedder", masking the real bug | P1 |
| `vectorSearch.ts` / unreachable branch | 128–135 | `embedderConfigured: true` branch — unreachable because hybrid call always fails | P0 |

**Critical quote — the field-name typo (`vectorSearch.ts:112–115`):**
```ts
      const searchOpts: Record<string, unknown> = {
        limit,
        hybrid: { embedded: 'default', semanticRatio: 0.5 },
      };
```
Per [Meilisearch hybrid search docs, accessed 25 Aug 2026](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/multiple_embedders), the correct field is `hybrid.embedder`, not `hybrid.embedded`. This makes the entire semantic search path non-functional.

### 2.5 Backend — media embedding worker

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `mediaEmbeddingHandler.ts` / `generatePlaceholderEmbedding` | 163–182 | `const vector = new Array<number>(PLACEHOLDER_DIMENSIONS).fill(0);` (line 171) — always creates 512 zeroes; `placeholder: true`, `model_loaded: false` | P0 |
| `mediaEmbeddingHandler.ts` / `processMediaEmbeddingJob` | 305 | `const embeddingResult = await generatePlaceholderEmbedding(qualityFlags);` — always calls placeholder, never a real model | P0 |
| `mediaEmbeddingHandler.ts` / serialisation | 188+ | Serialises zero vector as little-endian float32 BYTEA and inserts into `media_embeddings` | P0 |
| `mediaEmbeddingHandler.ts` / `findExistingEmbedding` | — | PK omits checksum; changed bytes under same model/preprocess are skipped | P1 |
| `mediaEmbeddingHandler.ts` / `downloadImage` | — | 15s and 50MB cap, but follows arbitrary redirects and checks size only after buffering full body | P0 |

**Critical quote — the placeholder embedding (`mediaEmbeddingHandler.ts:163–182`):**
```ts
async function generatePlaceholderEmbedding(
  qualityFlags: Record<string, unknown>,
): Promise<EmbeddingResult> {
  logger.info(
    { dimensions: PLACEHOLDER_DIMENSIONS },
    'mediaEmbedding.placeholder_model_no_model_loaded',
  );

  const vector = new Array<number>(PLACEHOLDER_DIMENSIONS).fill(0);
  return {
    vector,
    dimensions: PLACEHOLDER_DIMENSIONS,
    qualityFlags: {
      ...qualityFlags,
      placeholder: true,
      model_loaded: false,
    },
    placeholder: true,
  };
}
```
512 zeroes. Always. The worker is honest about it (`placeholder: true`, `model_loaded: false`), but the zero vector is inserted into the same `media_embeddings` table as future real vectors. There is no serving-view constraint that prevents placeholder rows from being used in retrieval.

### 2.6 Backend — migrations

| Migration | Lines | Finding |
|---|---|---|
| `032_visual_search_requests.sql` | — | Raw `image_url`, optional user, pending/processed/failed and result JSON; no retention/expiry/purpose |
| `145_media_embeddings.sql` | 35–52 | `embedding BYTEA NOT NULL` (line 44) — no pgvector, no ANN index; PK is `(media_asset_id, model_id, model_version, preprocessing_version)` (line 51); no `status` column to distinguish placeholder from real |
| `145_media_embeddings.sql` | 14–25 | Header comment explicitly says "pgvector is NOT installed" and describes the upgrade path: `CREATE EXTENSION vector`, `ALTER TABLE ... ADD COLUMN embedding_vec vector(512)`, `CREATE ... HNSW index` |
| `144_model_artifact_registry.sql` | — | Supports `visual_search` task, immutable artifact hash, dataset/code lineage, approval and rollback |

**Critical quote — the BYTEA embedding column (`145_media_embeddings.sql:44`):**
```sql
  -- BYTEA: serialised little-endian float32 array. See header comment for
  -- the pgvector upgrade path.
  embedding BYTEA NOT NULL,
```
No `vector` type, no HNSW index, no serving view. The table can store embeddings but cannot serve them at scale. Every similarity query would require fetching all rows and computing distance in application code.

---

## 3. End-to-end traces

### 3.1 Top-down: current visual query

```text
Camera/gallery
  → optional forced 1:1 crop
  → local file read fully to base64 (VisualSearchScreen:236) OR remote URL forwarded
  → POST /visual-search (visualSearch.ts:20-32)
  → decodeQueryImage: fetch user URL with redirect:'follow' (line 59-61) [SSRF P0]
  → SQL newest active candidate superset (60-150) (line 35)
  → primary listing image URLs resolved
  → API downloads candidate images in 8 concurrent workers (line 228-231)
  → sharp extracts colour/layout features (visualSimilarity.ts:62)
  → fixed weighted similarity sort (0.45/0.30/0.10/0.05/0.10) (line 154-168)
  → listing DTO + similarityMethod='heuristic_color_features'
  → native maps results; possibly substitutes cached filter-only listings
  → note says heuristic/not AI
  → scanline animation plays during loading (VisualSearchScreen:68-113) [anti-AI P1]
```

### 3.2 Bottom-up: current embedding pipeline

```text
approved media asset job
  → downloadImage (15s timeout, 50MB cap, follows redirects) [SSRF P0]
  → SHA-256 + minimal metadata quality
  → model registry described but not enforced by handler
  → generatePlaceholderEmbedding() (mediaEmbeddingHandler.ts:163-182)
  → 512 × float32 zeroes (line 171)
  → serialise to BYTEA (line 188+)
  → INSERT into media_embeddings (placeholder=true, model_loaded=false)
  ✕ no serving projection constraint
  ✕ no ANN index (BYTEA, no pgvector)
  ✕ no vector candidate query
  ✕ no status column to exclude placeholders from serving
```

### 3.3 Semantic text flow

```text
POST /search/semantic
  → semanticSearch(query) (vectorSearch.ts:99)
  → Meilisearch search(hybrid.embedded='default') (line 114) [BUG: should be 'embedder']
  → Meilisearch rejects or ignores unknown field
  → catch block (line 136) → classifyHybridError (line 177)
  → error message contains 'embedder' → returns 'embedder_unconfigured' (line 183)
  → lexical SearchAdapter fallback
  → retrievalMeta says embedder_unconfigured
  → embedderConfigured: true branch (line 128-135) NEVER reached
```

---

## 4. August 2026 benchmark research

### 4.1 Visual search in production — Mercari SigLIP (2024–2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Mercari Engineering — Fine-tuned SigLIP Similar Looks, Nov 2024](https://engineering.mercari.com/en/blog/entry/20241104-similar-looks-recommendation-via-vision-language-model/) | Fine-tuned SigLIP on 1M product image-title pairs; A/B test showed significant improvement; released to 100% of users. Image embeddings used for similar product recommendations, product searches, and fraudulent listing detection | SigLIP is a proven baseline for C2C marketplace visual search; ThryftVerse should evaluate SigLIP 2 as a starting point |
| [Mercari — VLM-based image encoder, arXiv 2026](https://arxiv.org/html/2510.13359) | Fine-tuned SigLIP: +9.1% nDCG@5 offline; +50% CTR and +14% CVR online A/B test vs CNN baseline. 20M+ monthly users | The jump from heuristic/CNN to fine-tuned VLM is the single highest-impact visual search upgrade. ThryftVerse's colour histogram is weaker than the CNN baseline they beat |
| [Mercari — Zero-Shot Retrieval, arXiv Aug 2025](https://arxiv.org/html/2508.05661v1) | Zero-shot multilingual SigLIP: +13.3% nDCG@5 over baseline; +40.9% transaction rate via image search in 1-week A/B test. "Recent zero-shot models can serve as a strong and practical baseline for production use" | Even without fine-tuning, zero-shot SigLIP beats traditional baselines. ThryftVerse can start with zero-shot and fine-tune later |
| [Elasticsearch Labs — Multimodal embeddings for ecommerce, 2026](https://www.elastic.co/search-labs/blog/multimodal-embeddings-ecommerce-product-search) | Averaged image+text embeddings put correct product in top spot up to 1.5× as often as image alone. CLIP-style dual encoder (jina-clip-v2) beat broader multimodal model | Composed image+text retrieval materially outperforms image-only; ThryftVerse's text-as-SQL-filter approach leaves performance on the table |

### 4.2 Vector indexing — pgvector HNSW (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [pgvector HNSW PostgreSQL 18 tuning, 2026](https://nerdleveltech.com/pgvector-hnsw-postgres-18-production-tuning-tutorial) | pgvector 0.8.2 on PostgreSQL 18; HNSW with `m=16`, `ef_construction=64`, `ef_search=40` defaults; `halfvec` halves storage with negligible recall loss; `hnsw.iterative_scan='relaxed_order'` rescues filtered queries; CVE-2026-3172 makes pgvector 0.8.2 a security floor | ThryftVerse should install pgvector 0.8.2+, use `halfvec` for 512-dim embeddings, and tune `ef_search` to 100–200 for 95%+ recall |
| [QueryPlane — pgvector HNSW tuning guide](https://queryplane.com/blog/pgvector-hnsw-tuning-guide/) | `ef_search` 100–200 provides 95%+ recall with sub-5ms queries on real embeddings; `ef_search` must be ≥ `LIMIT` in query | Set `ef_search` based on ThryftVerse's result limit (20–50); benchmark recall vs latency |
| [dbi-services — pgvector indexes, March 2026](https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/) | Three index families: HNSW (built-in, general purpose), IVFFlat (built-in, fast build), DiskANN (pgvectorscale/Timescale, storage-constrained). HNSW 2,000-dim limit for `vector` type; use `halfvec` for higher dimensions | For 512-dim embeddings, HNSW on `halfvec(512)` is the right choice; HNSW build time ~29s for 25K rows |

### 4.3 SSRF prevention (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | "Image on an external server (user enters image URL for the application to download)" is a common SSRF scenario. Recommend allowlist approach, IP validation (v4 and v6), block loopback/link-local/RFC1918/metadata | Replace arbitrary `imageUrl` with owned finalized uploads; harden any unavoidable fetcher with DNS resolution + IP allow/deny |
| [Vulnify — SSRF Explained 2026](https://vulnify.app/blog/ssrf-explained-2026-how-to-find-fix-server-side-request-forgery) | "Image fetch/proxy (avatar URL, upload by URL, image optimisation)" is a primary SSRF entry point. Fixes: strict allowlists, redirect controls, network egress filtering | ThryftVerse's `decodeQueryImage` (visualSearch.ts:44–64) is a textbook SSRF entry point |
| [OWASP A10 SSRF Developer Guide 2026](https://www.securecodinghub.com/blog/owasp-ssrf-a10-developer-guide) | SSRF retained in OWASP Top 10 2025 revision; cloud metadata endpoint (169.254.169.254) is the most damaging target; application-layer URL validation is fragile, durable mitigations live at network layer | Enforce network-level egress filtering in addition to application-layer validation |

### 4.4 Meilisearch hybrid search API (25 Aug 2026)

| Source | Confirmed fact | ThryftVerse defect |
|---|---|---|
| [Meilisearch multiple embedders](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/multiple_embedders) | `hybrid.embedder` is the required field name; multiple embedders per index (text, image, semantic) | `vectorSearch.ts:114` uses `embedded` — wrong field, semantic path unreachable |
| [Meilisearch image search with user embeddings](https://www.meilisearch.com/docs/capabilities/hybrid_search/how_to/image_search_with_user_embeddings) | User-provided multimodal embeddings via `_vectors` field and query vectorization with `hybrid.embedder` | ThryftVerse could use Meilisearch's user-provided-vector integration for visual search instead of a separate ANN index |

---

## 5. Capability, state and ownership matrices

### 5.1 Source-of-truth matrix

| Concern | Current owner | Failure | Target owner |
|---|---|---|---|
| Query media bytes | Native inline base64 / arbitrary URL | Large payload, privacy and SSRF ambiguity | Finalized ephemeral upload asset |
| Canonical listing media | Listing URL columns + `media_assets` | Candidate route re-fetches at request time | Authoritative media asset + derived feature projection |
| Visual features | Process-local cache (`visualSimilarity.ts:53`) | Per-instance, URL-keyed, stale, no checksum | Versioned embedding/feature registry |
| Model identity | Job payload | Worker does not verify active approved artifact | Model registry/promotion controller |
| Placeholder state | JSON quality flag (`mediaEmbeddingHandler.ts:177`) | Same table/blob shape as real vector; no serving constraint | Explicit `status` column + serving view constraint |
| Vector index | None (`BYTEA`, no pgvector) | No scalable retrieval | pgvector HNSW on `halfvec(512)` |
| Marketplace eligibility | SQL active filter only | Trust, stock, blocks, moderation and duplicates incomplete | Final eligibility service |
| Query retention | Raw URL telemetry (`visualSearch.ts:96–100`) | No purpose/expiry | Privacy-governed query asset lifecycle |
| Result truth | Backend note + client fallback | Cached fallback may erase distinction/intent | Structured `serveMode` and partial-state contract |

### 5.2 Required capability modes

| Mode | Preconditions | Allowed claim |
|---|---|---|
| `filter_only` | No usable image | "Matches your filters" |
| `heuristic_visual` | Query/candidate colour features succeed | "Similar colours and composition" |
| `semantic_visual` | Approved model/index passes gates | "Visually similar" |
| `composed_multimodal` | Image+text model/evaluator passes | "Similar, refined by 'black under £80'" |
| `degraded` | Higher mode unavailable | Explicitly name effective mode; never keep AI wording |

---

## 6. User psychology, JTBD and trust

### 6.1 Jobs to be done

- "Find this exact object or credible alternatives without knowing its name."
- "Find the part of this scene I mean, not the whole photograph."
- "Keep the silhouette but change colour/material/price/size."
- "Tell me whether results are visually similar or merely satisfy filters."
- "Do not keep my personal photo longer than necessary."

### 6.2 Psychological constraints

- The selected crop is the query. Users need focal-object correction because wrong focus feels like model incompetence.
- Image results produce stronger perceived certainty than text results. Avoid "exact match" unless identity-level evidence supports it.
- A graceful fallback must not silently become random cached inventory; users will attribute it to visual intelligence.
- Show constraints as a human sentence, not a wall of pills: "Similar jackets · black · under £80."
- Retrying should preserve crop/text/facets and explain only actionable failures.
- Saving a visual alert without saving a permissible query representation is deceptive. Disable until an authoritative durable visual-query contract exists.

---

## 7. Strict anti-AI design direction

### 7.1 First viewport

- Header with transparent Back, title `Search by photo`, gallery action.
- Dominant square/portrait query preview occupying roughly one third of viewport, with a simple crop/focus affordance.
- Below: one sentence field "Add words, e.g. black, cropped, under £80"; a compact filter row; results begin at or just below fold.
- Once results load, collapse the query preview to a 56–72pt thumbnail beside the constraint sentence so inventory dominates.

### 7.2 Remove current AI-made tells

- **Delete the scanline animation** (`VisualSearchScreen.tsx:68–113`) and corner brackets (lines 405–430). The comment at line 70 says "communicate AI analysis is in progress" — the backend is a colour histogram, not AI. Use a final-geometry result skeleton/progress label instead.
- No sparkles, neon/glow, magic gradients, confidence percentages or pseudo-detection boxes.
- Avoid category chip walls; show the highest-value corrections only.
- One media radius and one field radius. Results are not nested in decorative cards.

### 7.3 Motion/accessibility

- Crop transition and query-thumbnail collapse: 180–220ms, no bounce; reduced motion crossfades or changes instantly.
- Camera permission, photo-library permission, unsupported image, low resolution, upload, processing and results are distinct announcements.
- Preview has a meaningful alt label derived from user input, never invented product identity.
- Results announce effective method and count once. Do not announce "AI scanning."
- Provide gallery/text path when camera is unavailable and ensure controls survive Dynamic Type.

---

## 8. Complete client state machines

### 8.1 Query asset

```text
idle
 → permission_request
   → permission_denied(recovery/settings)
   → capturing | picking
 → selected_local
 → cropping/focus_select
 → upload_preparing
 → uploading(progress, cancellation)
   → uploaded_ephemeral(assetId, expiry)
   → upload_failed(retry)
   → unknown_upload_outcome(operationId → check)
```

### 8.2 Search request

```text
ready(assetId, filters)
 → submitting(requestSequence, abort previous)
   → populated(method)
   → filtered_empty
   → zero_visual_candidates
   → partial(candidate source failures)
   → degraded(method actually used)
   → error(retry)
   → unknown_outcome(requestId/check)
offline
  → cached_prior_query only if exact query fingerprint matches
```

Never allow an older response to replace a newer crop/filter request. Persist only a privacy-approved query fingerprint/asset ID, not a raw local URI or base64 blob.

---

## 9. Target architecture and boundaries

```text
Native capture/gallery
  → bounded local preprocess + focal crop
  → authoritative ephemeral media upload/finalization
  → query asset (purpose=visual_search, TTL)
  → embedding service (approved active model)
  → ANN candidate lookup in versioned index (pgvector HNSW)
  + optional text embedding / structured facets
  → marketplace eligibility and duplicate control
  → multimodal reranker
  → result contract with method/model/index versions

Approved listing media lifecycle
  → media.finalized outbox event
  → decode/security/quality pipeline
  → versioned embeddings (SigLIP 2 or similar)
  → blue/green ANN index projection (HNSW on halfvec)
  → reconciliation + deletion propagation
```

### 9.1 Boundaries

- Media service owns bytes, checksum, moderation and deletion.
- Model service owns preprocessing/inference and verifies active artifact identity.
- Search owns ANN index, composed retrieval and result policy.
- PostgreSQL owns listing/inventory/trust truth; ANN never directly serves final items.
- Native owns focal crop and presentation; it does not fabricate similarity explanations.
- Query assets are ephemeral by default and excluded from training absent separate explicit consent/policy.

---

## 10. Proposed schemas, contracts and events

### 10.1 Query contract

```ts
interface VisualSearchRequestV1 {
  requestId: string;
  queryAssetId: string;           // finalized owned media only
  focalRegion?: { x: number; y: number; width: number; height: number };
  text?: string;
  facets: ListingFacetV1;
  cursor?: string;
  requestedMode: 'best_available' | 'heuristic_only';
  idempotencyKey: string;
}

interface VisualSearchPageV1 {
  requestId: string; queryFingerprint: string;
  serveMode: 'semantic_visual' | 'composed_multimodal' | 'heuristic_visual' | 'filter_only';
  model?: { id: string; version: string; preprocessVersion: string };
  indexVersion?: string; policyVersion: string;
  items: VisualResult[]; cursor: string | null;
  partialFailures: string[]; queryAssetExpiresAt: string;
}
```

### 10.2 Embedding registry changes

Add explicit `status` (`pending|ready|rejected|failed|placeholder`), `asset_revision`, `normalized_l2`, `indexed_at`, `deleted_at`, `failure_code` and `artifact_sha256`. A serving view requires `status='ready'`, nonzero finite norm, approved active model and current asset checksum/revision. Placeholder rows are structurally unservable.

Install pgvector and add:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE media_embeddings ADD COLUMN embedding_vec halfvec(512)
  USING embedding::halfvec(512);
CREATE INDEX media_embeddings_hnsw_idx
  ON media_embeddings USING hnsw (embedding_vec halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### 10.3 Events

```text
media.asset.finalized.v2
media.asset.moderation.approved.v1
media.asset.deleted.v1
embedding.requested.v1
embedding.generated.v1 / embedding.rejected.v1 / embedding.failed.v1
vector_index.document.upserted.v1 / deleted.v1
visual_search.query.created.v1
visual_search.results.served.v1
visual_search.result.viewable.v1 / opened.v1
visual_search.correction.recorded.v1
```

---

## 11. Security and privacy design

### 11.1 Immediate P0 hardening

- **Stop accepting arbitrary `imageUrl`** from public clients (`visualSearch.ts:21`). Accept owned finalized `queryAssetId` only.
- If remote fetch remains for internal jobs: allow HTTPS only; resolve DNS and block loopback, link-local, RFC1918/ULA, metadata (169.254.169.254) and internal service ranges before every redirect; cap redirects; revalidate destination each hop.
- Stream with content-length and actual-byte limits; abort before buffering limit. Validate content type and magic bytes.
- Set decoded pixel/frame/dimension limits and isolate `sharp` work in bounded worker resources.
- Rate-limit by actor/device/IP risk and enforce concurrent query quotas.
- Candidate images come only from authoritative media storage, not arbitrary listing URLs.

### 11.2 Privacy

- Query asset purpose, region, consent version, created/expiry/deleted timestamps and training eligibility are explicit.
- Default TTL should be short and product-approved; deletion propagates to object store, caches, embeddings, ANN indexes, logs and derived thumbnails.
- Do not store base64 or raw personal image URLs in analytics. Log query fingerprint, method, coarse quality and outcome.
- Faces, documents, children, location metadata and intimate imagery need moderation/privacy handling; strip EXIF before inference/storage.
- Saved visual searches require a clear retained-query disclosure and separate alert consent. Otherwise permit session-only reuse.

---

## 12. Model and retrieval evaluation

### 12.1 Candidate models (informed by Mercari 2026 results)

Per [Mercari's SigLIP fine-tuning results](https://arxiv.org/html/2510.13359): fine-tuned SigLIP achieved +9.1% nDCG@5 offline and +50% CTR / +14% CVR online. Per [Mercari's zero-shot study](https://arxiv.org/html/2508.05661v1): zero-shot multilingual SigLIP achieved +13.3% nDCG@5 and +40.9% transaction rate. Both studies used a C2C marketplace with 20M+ users — directly comparable to ThryftVerse.

| Model | Type | Expected baseline | Fine-tuning potential |
|---|---|---|---|
| SigLIP 2 (zero-shot) | Pre-trained VLM | Strong zero-shot per Mercari | Fine-tune on ThryftVerse product image-title pairs |
| jina-clip-v2 | CLIP-style dual encoder | Good for text↔image per [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/multimodal-embeddings-ecommerce-product-search) | Fine-tune for resale domain |
| Domain-adapted encoder | Fine-tuned on ThryftVerse catalog | Highest potential | Requires labelled dataset |

Evaluate full-image, focal crop, multi-crop and category-aware embeddings. Quantize only after measuring slice regressions.

### 12.2 ThryftVerse benchmark

- Query-target judgements for exact/near item, category, silhouette, colour, pattern, material, era/style, brand/logo, condition and composed text changes.
- Hard negatives: same colour/wrong object, same category/wrong silhouette, counterfeit/logo ambiguity, unavailable duplicates and background-dominant photos.
- Categories: tops, dresses, footwear, bags, jewellery/watches, accessories, furniture/art/collectibles if supported.
- Slices: low light, clutter, screenshots, model-worn garments, flat lay, skin tones/backgrounds, image quality, aspect ratios, languages and sparse catalog cohorts.

### 12.3 Metrics

- Recall@20/50, nDCG@20, mAP, composed-retrieval Recall@K, exact/duplicate precision and calibration of score bands.
- Eligible Recall@K after stock/trust filters, seller/family diversity, zero-result and relaxation rate.
- Latency/cost by input size/model/hardware; embedding throughput and index freshness.
- Downstream save/detail/message/checkout, return/report/counterfeit outcomes—not click alone.

Launch requires statistically defensible improvement over the colour heuristic overall and no unacceptable slice regression. Low-quality cohorts may stay on the honest heuristic.

---

## 13. Threat/failure-mode analysis

| Failure | Current exposure | Required control |
|---|---|---|
| SSRF/internal probing | Arbitrary URL + redirects (`visualSearch.ts:59–61`) | Owned uploads; strict fetch broker controls |
| Payload/decompression bomb | Unbounded base64 and post-buffer size checks | Gateway/body/stream/decode limits |
| Query-time fan-out DoS | Up to 150 remote downloads (`visualSearch.ts:35`) | Offline embeddings; per-query ANN only |
| Zero-vector contamination | Placeholder stored with future vectors (`mediaEmbeddingHandler.ts:171`) | Status/constraint/serving view + norm check |
| Mixed vector versions | Multiple rows possible, no serving selector | One active index alias per model/preprocess |
| Stale embeddings | URL-keyed cache (`visualSimilarity.ts:53`) and checksum mismatch skip | Asset revision + reconciliation |
| Wrong-object focus | Whole/square crop | Focal selection and multi-crop evaluation |
| Unsafe/inactive results | ANN similarity alone | Final authoritative eligibility |
| Older response wins | No native request sequencing (`VisualSearchScreen.tsx:260–290`) | Abort controller + monotonic sequence |
| Fake visual alert | Image not persisted, alerts enabled (`VisualSearchScreen.tsx:375`) | Disable or build retained query contract |
| Silent method downgrade | Client cached fallback | Structured serve mode; no claim carryover |
| Sensitive query retention | Raw URL table (`visualSearch.ts:96–100`), no TTL | Purpose/expiry/deletion and redacted analytics |
| Semantic field-name bug | `embedded` instead of `embedder` (`vectorSearch.ts:114`) | Fix field name; add version-pinned integration test |
| Error classification masks bug | `classifyHybridError` (`vectorSearch.ts:177–186`) conflates typo with config | Fix field name; add unit test for error classification |

---

## 14. SLOs, SLIs and observability

| SLI | Target |
|---|---:|
| Query asset upload finalization | p95 <2s on supported 4G/Wi-Fi for bounded image |
| Query embedding | p95 <250ms warm, p99 <500ms |
| ANN retrieval (pgvector HNSW) | p95 <100ms |
| End-to-end search after upload | p95 <900ms, p99 <1.8s |
| Listing media → searchable embedding | p95 <60s, p99 <5m |
| Delete → vector unservable | p99 <60s; final eligibility immediate |
| Ready embedding coverage | >99% of eligible primary listing media |
| Placeholder vectors served | exactly 0 |
| SSRF blocked-network violation | exactly 0 successful connections |
| Query asset expiry/deletion completion | >99.99% within policy window |

Trace: upload → finalization → query inference → ANN → eligibility → rerank → serialize → render/outcome. Metrics label model/preprocess/index/policy, serve mode, quality cohort, cache state and failure code—not raw images or sensitive text. Alert on zero-norm ready vectors, coverage drop, index/version mismatch, outbound destination violation, deletion lag, latency/cost and heuristic-fallback spikes.

---

## 15. Migration, compatibility and rollback

### 15.1 Flags

```text
visual_search_owned_query_assets_v1
visual_search_security_broker_v1
visual_search_real_embeddings_shadow_v1
visual_search_ann_index_v1
visual_search_composed_query_v1
visual_search_semantic_serve_v1
visual_search_remove_scan_animation_v1
```

### 15.2 Sequence

1. Cap request bodies and remote fetches; disable external URL input for new clients.
2. **Remove scanline animation** (`VisualSearchScreen.tsx:68–113`) and corner brackets (lines 405–430); replace with honest progress label.
3. Add explicit embedding status/norm constraints; serving projection excludes all existing placeholders.
4. **Fix `vectorSearch.ts:114`** `embedded`→`embedder`; pin integration test against deployed Meilisearch version.
5. Install pgvector 0.8.2+; add `halfvec(512)` column and HNSW index to `media_embeddings`.
6. Build benchmark before selecting a model.
7. Deploy approved model service (SigLIP 2 zero-shot as starting baseline per Mercari results); shadow-generate embeddings into a new versioned index.
8. Reconcile coverage/checksum/deletion; never mutate current heuristic path.
9. Shadow queries compare heuristic vs ANN without exposing ANN results.
10. Canary semantic candidate mix by category/quality cohort; preserve heuristic-only flag.
11. Add composed text+image after dedicated evaluation.
12. Remove request-time candidate downloads only after ANN parity/coverage is proven.

Rollback switches index alias/serve flag to prior approved model or heuristic. Embedding records remain immutable. Old clients may send legacy base64 within strict caps during a deprecation window; server converts to ephemeral assets. Arbitrary URL support gets an explicit short sunset.

---

## 16. Phased implementation plan mapped to files/owners

### Phase 0 — security and truth (1 sprint)

- **Security/Backend:** harden `routes/visualSearch.ts` (lines 20–32, 44–64, 96–101), `visualSimilarity.ts` (lines 53, 62), `mediaEmbeddingHandler.ts` (downloadImage); gateway/body/decode caps.
- **Native:** abort/sequence requests (`VisualSearchScreen.tsx:260–290`), make error state reachable, **remove scan animation** (lines 68–113, 405–430), disable fake visual alerts (line 375).
- **Search:** fix `vectorSearch.ts:114` `embedder` field and add real integration test.

### Phase 1 — asset/embedding contract (2 sprints)

- **Media:** ephemeral query upload/finalization/TTL.
- **ML platform:** enforce `model_artifacts` approval and inference contract.
- **Data:** install pgvector; migration extending `media_embeddings` with `status`, `embedding_vec halfvec(512)`, HNSW index, outbox/reconciliation.
- Likely files: upload/media routes, queue types/worker, new vector projection module and migrations.

### Phase 2 — benchmark and shadow index (2–4 sprints)

- **ML/Search relevance:** labelled resale dataset, evaluator, model comparison (start with zero-shot SigLIP 2 per Mercari results) and model card.
- **Search/SRE:** pgvector HNSW index, blue/green alias, coverage/deletion dashboards.
- **Trust:** eligibility and counterfeit/moderation slices.

### Phase 3 — flagship native composed search (2–3 sprints)

- **Native/Design:** focal crop, compact result-mode composition, method/partial states and accessible corrections.
- **Search/ML:** image+text+facet composition, reranker/diversification, result explanations.

---

## 17. Test/eval/release gates

- SSRF suite covers redirects, DNS rebinding, IPv4/IPv6 private/link-local/metadata targets, oversized/chunked bodies and wrong magic bytes.
- Fuzz/decompression tests prove bounded memory/CPU and worker isolation.
- Database constraint/view makes placeholder/zero/nonfinite/wrong-dimension vectors unservable.
- Model artifact hash/schema/preprocess mismatch fails closed.
- Backfill and replay are idempotent; asset revision changes produce a new correct embedding.
- Delete propagates through object store, embedding registry, ANN and cache under SLO.
- Fixed benchmark beats heuristic with slice/latency/cost gates (target: exceed Mercari's +13.3% nDCG@5 zero-shot baseline).
- Native rapid crop/filter changes never show stale responses; cancel/offline/unknown-outcome paths pass.
- Screen-reader, Dynamic Type, reduced motion, camera denied, photo denied, unsupported/low-quality image and partial-source states pass.
- Canary rollback is exercised, not merely documented.
- Privacy/security approve query retention and saved-alert semantics before enabling them.
- No scanline animation or AI-themed visual theatre renders on any loading state.

---

## 18. Explicit non-goals

- Generative image enhancement or editing.
- Facial recognition or identifying people from photos.
- Authenticity/counterfeit determination from similarity alone.
- Claiming exact product identity from a nearest neighbour.
- Training a foundation encoder from scratch.
- Retaining personal query images for training by default.
- Replacing lexical search; exact brand/model/SKU intent still needs lexical retrieval.

---

## 19. Decisions requiring product, legal/privacy or security input

1. Query image retention TTL, cross-device history and saved visual alert consent.
2. Supported categories and prohibited use cases (faces, documents, minors, intimate imagery).
3. "Exact," "similar," "same style" and method-label vocabulary.
4. Whether category/brand/logo correction becomes training data and under what consent.
5. Domain model licensing, data rights and geographic processing constraints.
6. Acceptable model quality/latency/cost and slice-regression thresholds.
7. Whether visual queries may personalize other surfaces.

---

## 20. Final decision

**KEEP THE HONEST HEURISTIC; BLOCK AI CLAIMS AND VECTOR SERVING.** First eliminate arbitrary-fetch and query-time fan-out risks, make placeholder vectors structurally unservable, fix the semantic API contract (`embedded`→`embedder`), and remove the deceptive scanline animation. Then evaluate real multimodal models (start with zero-shot SigLIP 2 per Mercari's +13.3% nDCG@5 and +40.9% transaction rate results) on a resale benchmark, build a versioned ANN projection with pgvector HNSW and deletion guarantees, and canary composed search. "AI visual search" becomes truthful only when that complete chain—not a zero-vector row or decorative scanline—is live and measured.
