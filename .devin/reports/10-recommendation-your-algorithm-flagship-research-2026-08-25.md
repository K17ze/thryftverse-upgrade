# 10 — Recommendation System and "Your Algorithm"

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Personalisation ML + Discovery platform + Native product + Privacy
**Status:** **P1 department / P0 causal-control and exposure-attribution gap**

---

## 1. Executive verdict

ThryftVerse has a credible recommendation *observability skeleton*: versioned policies, candidate scoring, an authenticated decision service, deterministic fallback, Redis cache epochs, circuit breaking, serve/impression/feedback tables, candidate lineage columns, an expanded marketplace action vocabulary and an artifact registry. That is materially stronger than an illustrative prototype.

The live product loop is nevertheless open in **two decisive places**:

1. **`YourAlgorithmScreen` mutates a module-level development fixture only** (`algorithmTransparencyApi.ts:346` `sessionTopics`); its topics are not authoritative and cannot affect `HomeScreen`. `ALGORITHM_DEMO_MODE = __DEV__` (line 123) means the demo label is invisible in production.
2. **The Home hook discards all request/position/reason attribution** (`useForYouFeed.ts:83–88` maps only `item.listing`, discarding `score`, `model`, `policy`, `position`, `reasonCodes`, `componentScores`, `requestId`, `policyVersion`) and never confirms rendered/viewable impressions. The database can represent honest exposure, but the canonical consumer does not complete it.

The flagship decision is therefore **not "train a deeper model."** First close the causal and measurement loops: authoritative intent → versioned cache invalidation → provably changed next serve; served → rendered → viewable → attributable outcomes. Until then, retain the demo label and `heuristic_baseline` disclosure.

### 1.1 Maturity scorecard

| Capability | Score | Evidence-based judgement |
|---|---:|---|
| Candidate eligibility | 2/5 | Active, non-self listings bounded to 500 (`recommendations.ts:642–667`); no multi-source retrieval or full trust/inventory eligibility contract |
| Ranking policy | 3/5 | Deterministic quality/popularity/trust baseline with explore/exploit and reason codes |
| Trained-model serving | 2/5 | Shadow LightGBM scaffold exists; heuristic remains champion; artifact registry exists but no active trained ranker proof |
| Reliability/fallback | 4/5 | Timeout, Redis circuit breaker (`recommendations.ts:736–865`), contract validation and deterministic fallback |
| Exposure attribution | 1/5 | Schema/endpoint distinguish served/rendered/viewable (`recommendations.ts:576–630`); Home never calls it — `useForYouFeed.ts:83–88` discards all attribution |
| Outcome attribution | 2/5 | Authenticated idempotent interaction endpoint (`recommendations.ts:366–490`); Home loses request lineage because it never retained it |
| User controls | 1/5 | `Your Algorithm` is `__DEV__` mock (`algorithmTransparencyApi.ts:123`) with process-session persistence only (`sessionTopics` at line 346) |
| Explanation fidelity | 2/5 | Live reason codes exist server-side, but mock screen builds synthetic topics/explanations and `WEIGHT_TO_CONFIDENCE` (`YourAlgorithmScreen.tsx:97`) maps to AIConfidence badges with no calibrated probability |
| Privacy/deletion | 1/5 | No live topic signal ledger, purpose/expiry, reset proof or training deletion workflow |
| Evaluation | 2/5 | Small deterministic evaluator and health script; no production-scale point-in-time dataset or slice gates |
| Native flagship quality | 2/5 | Full screen states/accessibility exist, but dashboard-like stats, confidence badges and illustrative controls undermine trust |
| **Overall** | **2.0/5** | **Strong scaffolding, incomplete causal and measurement product** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Frontend — feed consumer

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `HomeScreen.tsx` / `effectiveForYouData` | 582–584 | `forYouFeed.listings.length > 0 ? forYouExploreData : exploreData` — silent fallback to all listings when recommendations are empty/error; no error banner, no `SyncStatusPill` | P1 truth |
| `HomeScreen.tsx` / `feedMode` | 243 | `'foryou' \| 'following'` — no `'non_profiled'` mode | P1 |
| `useForYouFeed.ts` / `RecommendationItem` | 16–24 | Interface includes `score`, `model`, `policy`, `position`, `reasonCodes`, `componentScores` — all defined but never used | P1 |
| `useForYouFeed.ts` / `loadForYouFeed` | 61–105 | Requests `/recommendations/:userId?surface=home` (line 78); maps only `item.listing` via `mapBackendListingToListing` (line 85); discards `score`, `model`, `policy`, `position`, `reasonCodes`, `componentScores`, `requestId`, `policyVersion` | P0 attribution loss |
| `useForYouFeed.ts` / mapping | 83–88 | `payload.items.map((item) => { const listing = mapBackendListingToListing(item.listing); return isDisplayReadyListing(listing) ? listing : null; })` — no retention of any recommendation metadata | P0 |
| `useForYouFeed.ts` / `source` | 81 | `setSource(payload.source)` — only coarse source retained (`'decision_service' \| 'cache' \| 'heuristic_baseline'`) | P1 |
| `useForYouFeed.ts` / sessionId | 78 | Does not send `sessionId` although server accepts one (`recommendations.ts:636`) | P1 |
| `useForYouFeed.ts` / impressions | — | No call to `POST /recommendations/impressions`; no viewability API exported by the hook | P0 |
| `useForYouFeed.ts` / return | 113–120 | Returns only `listings, isLoading, isRefreshing, error, source, refresh` — no attribution VM | P0 |

**Critical quote — the mapping that discards all attribution (`useForYouFeed.ts:83–88`):**
```ts
const mapped: Listing[] = payload.items
  .map((item) => {
    const listing = mapBackendListingToListing(item.listing);
    return isDisplayReadyListing(listing) ? listing : null;
  })
  .filter((item): item is Listing => item !== null);
```
The server returns `requestId`, `policyVersion`, `capabilityLevel`, `trainedModel`, `generatedAt`, and per-item `score`, `model`, `policy`, `position`, `reasonCodes`, `componentScores`. **All of it is thrown away.** The `RecommendationItem` interface (lines 16–24) defines these fields but the mapping function ignores them entirely.

### 2.2 Frontend — "Your Algorithm" control screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `YourAlgorithmScreen.tsx` / `WEIGHT_TO_CONFIDENCE` | 97–101 | `Record<TopicWeight, AIConfidence>` maps `low→'low'`, `medium→'medium'`, `high→'high'` — presents confidence semantics not evidenced by live model output | P1 |
| `YourAlgorithmScreen.tsx` / `signalWeightToConfidence` | 104–107 | `if (weight >= 0.66) return 'high'; if (weight >= 0.33) return 'medium'; return 'low'` — arbitrary thresholds on mock weights | P1 |
| `YourAlgorithmScreen.tsx` / HowItWorks copy | 635 | "Topics derived from purchase or browse history cannot be removed because they reflect your real activity." — conflicts with user agency/deletion expectations | P1 |
| `YourAlgorithmScreen.tsx` / `AITrustBadge` | 740 | `confidence={WEIGHT_TO_CONFIDENCE[topic.weight]}` — confidence badge on every topic row | P1 |
| `YourAlgorithmScreen.tsx` / `AITrustSignal` | 899 | `confidence={signalWeightToConfidence(signal.weight)}` with `context={Relative influence: ${Math.round(signal.weight * 100)}%}` — percentage affinity on mock data | P1 |

**Critical quote — the "cannot be removed" copy (`YourAlgorithmScreen.tsx:635`):**
```text
Adjust how strongly each topic influences your feed, remove topics you no longer want,
or add new ones. Topics derived from purchase or browse history cannot be removed
because they reflect your real activity.
```
This is legally and ethically problematic. A transaction may need retention for accounting/trust; continued *use* of that activity for personalization is a separate decision the user must be able to revoke. DSA Article 27 requires options to modify or influence main recommender parameters.

### 2.3 Frontend — mock algorithm service

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `algorithmTransparencyApi.ts` / `ALGORITHM_DEMO_MODE` | 123 | `export const ALGORITHM_DEMO_MODE = __DEV__;` — false in production; demo indicator invisible to production users even when mock data is served | P1 |
| `algorithmTransparencyApi.ts` / `MOCK_TOPICS` | 142 | Hardcoded array of mock topics with fabricated IDs (`'topic-brand-acne'`), labels, categories, weights, evidence and `removable` flags | P1 |
| `algorithmTransparencyApi.ts` / `sessionTopics` | 346 | `let sessionTopics: AlgorithmTopic[] = MOCK_TOPICS.map((t) => ({ ...t }));` — module-level mutable copy; restart loses all changes | P0 |
| `algorithmTransparencyApi.ts` / `fetchAlgorithmProfile` | 379–384 | Returns `[...sessionTopics]` and `[...MOCK_SIGNALS]` — signals are never mutable | P1 |
| `algorithmTransparencyApi.ts` / `updateTopicWeight` | 390–403 | `sessionTopics = sessionTopics.map((t) => { if (t.id === topicId) { updated = { ...t, weight }; } ... })` — mutates module-level array only; no API call, no database mutation, no intent epoch increment, no cache invalidation | P0 |
| `algorithmTransparencyApi.ts` / `removeTopic` | 407–412 | `sessionTopics = sessionTopics.filter((t) => t.id !== topicId)` — same: module-level only | P0 |
| `algorithmTransparencyApi.ts` / `addTopic` | 418–431 | `sessionTopics = [topic, ...sessionTopics]` — same: module-level only | P0 |

**Critical quote — the mock mutation logic (`algorithmTransparencyApi.ts:390–403`):**
```ts
export async function updateTopicWeight(topicId: string, weight: TopicWeight): Promise<AlgorithmTopic | null> {
  await delay(180);
  let updated: AlgorithmTopic | null = null;
  sessionTopics = sessionTopics.map((t) => {
    if (t.id === topicId) {
      updated = { ...t, weight };
      return updated;
    }
    return t;
  });
  return updated;
}
```
`delay(180)` simulates network latency. The mutation is **module-level JS memory only**. There is:
- ✕ no API call
- ✕ no database mutation
- ✕ no intent epoch increment
- ✕ no recommendation cache invalidation
- ✕ no next-serve proof

### 2.4 Frontend — recommendation types

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `platform/product/recommendationTypes.ts` / `RecommendationResponse` | — | `capabilityLevel` narrowed to only `'heuristic_baseline'`; `trainedModel` narrowed to `false` — cannot truthfully represent promoted trained capability on that client path | P1 |
| `useForYouFeed.ts` / `RecommendationsResponse` | 26–33 | Uses broad `string`/`boolean` instead of shared validated contract — two recommendation client contracts already diverge | P1 |

### 2.5 Backend — recommendation route

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `recommendations.ts` / `intentEpochKey` | 163–165 | `recommendations:intent:${userId}` — Redis key for intent epoch | Foundation |
| `recommendations.ts` / `resolveIntentEpoch` | 170–177 | Reads epoch from Redis; falls back to `'0'` on error | Foundation |
| `recommendations.ts` / `recordServe` | 253–360 | Inserts `recommendation_serves` and one `recommendation_impressions` row per candidate with `status='served'` — server response is recorded before actual exposure | P1 |
| `recommendations.ts` / `recordServe` propensity | 320–321 | `policy === 'explore' ? explorePropensity : exploitPropensity` — approximate, not exact probability | P2 |
| `recommendations.ts` / `POST /interactions` | 366–490 | Authenticated; validates request/position attribution against `recommendation_impressions` (lines 391–396); idempotent writes; increments intent epoch (line 489) | Strong |
| `recommendations.ts` / `POST /recommendations/impressions` | 576–630 | Advances status monotonically `served → rendered → viewable` with `COALESCE` to preserve first timestamp | Strong design |
| `recommendations.ts` / `GET /recommendations/:userId` | 634–870 | Full route: intent epoch → cache key → candidate SQL → decision service → circuit breaker → fallback → recordServe | Foundation |
| `recommendations.ts` / cache key | 638 | `recommendations:v2:${userId}:${surface}:${POLICY_VERSION}:${intentEpoch}` — correct extension point, but no durable Your Algorithm mutation increments it | P0 |
| `recommendations.ts` / candidate SQL | 642–667 | `SELECT` from `listings` with `interaction_counts` CTE (30-day global) and `seller_ratings` CTE; `WHERE l.status = 'active' AND l.seller_id != $1 ORDER BY l.created_at DESC LIMIT 500` — single bounded recent-SQL pool | P1 |
| `recommendations.ts` / user history | 669–692 | `SELECT` last 200 interactions with listing features — useful short-term history, no explicit topic/control features | P2 |
| `recommendations.ts` / circuit breaker | 736–865 | Opens after `CIRCUIT_FAILURE_THRESHOLD` failures; `CIRCUIT_OPEN_SECONDS` timeout; fallback to `fallbackDecision` | Strong |
| `recommendations.ts` / `sessionId` | 636 | Server accepts `sessionId` in query but client never sends it | P1 |

**Critical quote — the candidate SQL (`recommendations.ts:642–667`):**
```sql
WITH interaction_counts AS (
  SELECT listing_id, COUNT(*)::text AS interaction_count
  FROM interactions
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY listing_id
),
seller_ratings AS (
  SELECT seller_id, AVG(rating)::text AS seller_rating
  FROM order_reviews
  GROUP BY seller_id
)
SELECT
  l.id, l.seller_id, l.title, l.description, l.category, l.brand,
  l.size, l.condition, l.price_gbp::text, l.image_url,
  l.created_at::text,
  COALESCE(ic.interaction_count, '0') AS interaction_count,
  COALESCE(sr.seller_rating, '0') AS seller_rating
FROM listings l
LEFT JOIN interaction_counts ic ON ic.listing_id = l.id
LEFT JOIN seller_ratings sr ON sr.seller_id = l.seller_id
WHERE l.status = 'active' AND l.seller_id != $1
ORDER BY l.created_at DESC
LIMIT 500
```
Single source, hard 500-row recall ceiling. Long-tail inventory outside the newest 500 active listings can never be recommended. No content similarity, collaborative, graph, or session-intent candidate sources.

### 2.6 Backend — migrations

| Migration | Tables/columns | Finding |
|---|---|---|
| `077_decision_system_observability.sql` | `recommendation_policies`, `recommendation_serves`, `recommendation_impressions` | Active/shadow/retired/blocked policy versions; serve/impression tables |
| `105_user_personalisation.sql` | Four coarse columns on `users` | Separate from mock topics and recommendation feature payload |
| `141_recommendation_impression_status.sql` | `served → rendered → viewable` with timestamps and viewability JSON | Honest distinction exists in DB; client never triggers it |
| `142_recommendation_candidate_lineage.sql` | `candidate_source`, `source_rank`, `source_score`, `retrieval_version`, `selection_propensity` | Nullable, compatible; not proof route populates a real multi-source funnel |
| `143_interaction_action_vocabulary.sql` | Qualified view, rapid skip, save, share, follow, commerce funnel, negative signals | Suitable vocabulary; weights/purpose still policy decisions |
| `144_model_artifact_registry.sql` | Immutable hashes, code/data/schema/preprocessing lineage, approval and rollback | Strong governance schema; serving must enforce it |

### 2.7 Backend — ML service

| File / symbol | Lines | Finding |
|---|---|---|
| `backend/ml-service/app/main.py` / `recommendations` | — | Heuristic is champion; optional LightGBM only shadow-scores |
| `scripts/evaluate_recommendations.py` | — | Determinism, quality metrics, coverage and seller concentration on small fixtures — useful CI smoke test, insufficient launch evidence |
| `backend/api/scripts/recommendation-health.mjs` | — | Checks fallback, empty, p95, attribution and seller concentration — valuable operational gate if run against representative windows |

---

## 3. End-to-end system traces

### 3.1 Top-down: what Home serves today

```text
HomeScreen feedMode='foryou'
  → useForYouFeed()
  → GET /recommendations/{authenticatedUser}?surface=home
    (no sessionId sent — useForYouFeed.ts:78)
  → server: resolveIntentEpoch → cacheKey (recommendations.ts:637-638)
  → candidate SQL: newest 500 active listings + 30-day interaction counts + seller ratings
    (recommendations.ts:642-667)
  → Redis cache check (line 696)
  → if cache miss: decision service call with timeout (line 738)
  → if circuit open or service fails: fallbackDecision (line 862)
  → recordServe: INSERT recommendation_serves + recommendation_impressions(status='served')
    (line 870)
  → response with requestId, policyVersion, per-item score/model/position/reasonCodes
  → useForYouFeed maps ONLY item.listing → Listing (line 83-88)
    DISCARDS: score, model, policy, position, reasonCodes, componentScores, requestId, policyVersion
  → Home masonry renders
  → NO call to POST /recommendations/impressions
  → 'served' rows NEVER advance to 'rendered' or 'viewable'
  → if empty/error: effectiveForYouData silently substitutes exploreData (HomeScreen:584)
```

### 3.2 Top-down: what "Your Algorithm" changes today

```text
YourAlgorithmScreen
  → fetchAlgorithmProfile()
  → reads module-level sessionTopics (algorithmTransparencyApi.ts:379)
  → updateTopicWeight/removeTopic/addTopic
  → mutates sessionTopics in JS memory (lines 393, 411, 430)
  → delay(180-260ms) simulates network latency
  ✕ no API call
  ✕ no database mutation
  ✕ no intentEpoch increment (recommendations.ts:489 is never reached from this path)
  ✕ no recommendation cache invalidation (cacheKey at line 638 never changes)
  ✕ no next-serve proof
  ✕ restart loses all changes (sessionTopics is module-level, line 346)
  ✕ ALGORITHM_DEMO_MODE = __DEV__ → false in production → no demo indicator visible
```

### 3.3 Bottom-up: feedback to future serve

```text
Qualified user action (e.g., save, like, view)
  → POST /interactions with idempotencyKey (recommendations.ts:366)
  → resolves authenticated actor (line 368)
  → validates requestId/position against recommendation_impressions (lines 391-396)
  → INSERT interactions + recommendation_feedback (line 420)
  → Redis: ltrim events + incr intentEpoch (line 489)
  → next recommendation request: resolveIntentEpoch returns new epoch
  → cacheKey changes → cache miss → new decision service call
  → heuristic ranker can change scores based on updated interaction history
```

This bottom-up path is credible **only for callers that preserve attribution**. Home currently does not — `useForYouFeed.ts:83–88` discards `requestId` and `position`, so any interaction from Home cannot be attributed to a specific serve.

---

## 4. August 2026 benchmark research

### 4.1 Pinterest — home feed multi-objective optimization and retrieval

| Source (date) | Directly supported claim | ThryftVerse inference |
|---|---|---|
| [Pinterest Engineering — Multi-Objective Optimization at Home Feed, 7 Apr 2026](https://medium.com/pinterest-engineering/evolution-of-multi-objective-optimization-at-pinterest-home-feed-06657e33cd10) | Cascaded system: retrieval → pre-ranking → ranking → re-ranking. Diversity-based re-ranking (DPP → SSD with PinCLIP visual embeddings and Semantic ID overlap penalty). Removing diversity improved immediate actions but hurt longer-term outcomes | Treat diversity as a long-term satisfaction constraint, not decorative reshuffling. ThryftVerse has no diversity re-ranking |
| [Pinterest Engineering — Modernizing Home Feed Pre-Ranking](https://medium.com/pinterest-engineering/modernizing-home-feed-pre-ranking-stage-e636c9cdc36b) | New pre-ranking layer with joint request-level + item-level sub-components; root-leaf serving architecture; early-funnel logging pipeline uses final impression data as training data to address Sample Selection Bias | ThryftVerse's single 500-row SQL pool has no pre-ranking stage; training on served-but-unseen data is a risk since viewability is never confirmed |
| [Pinterest Engineering — Embedding-Based Retrieval at Homefeed, 3 Feb 2025](https://medium.com/pinterest-engineering/advancements-in-embedding-based-retrieval-at-pinterest-homefeed-d7d7971a409e) | Two-tower model upgraded with MaskNet feature crossing and DHEN framework; +0.15–0.35% engaged sessions. Engaged sessions = continuous interaction >60 seconds | ThryftVerse has no embedding-based retrieval; candidate source is pure SQL recency |
| [PRL-PUTS — Production RL for Personalized Utility Tuning, Pinterest, 2026](https://arxiv.org/html/2605.16344v1) | RL framework for personalized utility-weight tuning with Pareto sweeping; runs in parallel with ranking inference without adding serving latency; +0.13% successful sessions | Utility weight tuning is a separable control layer; ThryftVerse's "Your Algorithm" could tune weights rather than toggle mock topics |
| [Pinterest Engineering — Next-Level Personalization: 16K Lifelong User Actions](https://medium.com/pinterest-engineering/next-level-personalization-how-16k-lifelong-user-actions-superch…) | Scaling user action sequence length to 16K for long-term personalization | ThryftVerse loads only last 200 interactions (recommendations.ts:682–692) |

### 4.2 DSA recommender transparency and user controls (2026)

| Source | Requirement | ThryftVerse obligation |
|---|---|---|
| [DSA Article 27 — overview.legal](https://overview.legal/laws/dsa/art-27) | Platforms must disclose main recommender parameters in plain language; explain relative importance; offer options to modify/influence; controls must be "directly and easily accessible" from the section where information is prioritised | "Your Algorithm" must be accessible from the feed, not buried in settings; parameters must be explained in plain language |
| [DSA Article 38 — VLOP non-profiling](https://overview.legal/laws/dsa/art-38) | VLOPs must provide at least one recommender option not based on profiling | Build non-profiled mode now; `feedMode` needs `'non_profiled'` option |
| [DSA Observatory — Multiple and Dynamic Controls, Nov 2024](https://dsa-observatory.eu/2024/11/22/the-regulation-of-recommender-systems-under-the-dsa-a-transition-from-default-to-multiple-and-dynamic-controls/) | DSA requires transition from default-on to multiple dynamic controls; platforms' economic incentives may not align with meaningful control | Controls must be meaningful, not decorative; mock topics with no effect violate the spirit of Article 27 |
| [DSA Observatory — Better Feeds report, May 2025](https://dsa-observatory.eu/2025/05/19/making-recommender-systems-work-for-people/) | Article 25 prohibits deceptive or manipulative interface designs; recommender controls must enable "intentional and deliberative user interaction" | Confidence badges on mock data (WEIGHT_TO_CONFIDENCE) are deceptive; "cannot be removed" copy is manipulative |
| [Sota.io — DSA Recommender Transparency 2026 Guide](https://sota.io/blog/eu-dsa-recommender-system-transparency-requirements-2026) | Any online platform including marketplaces must publish recommender parameters in ToS; non-profiling option required for VLOPs | ThryftVerse is a marketplace → Article 27 applies now |
| [IJHCS 2026 — Feeding the short-video feed: DSA user control design](https://doi.org/10.1016/j.ijhcs.2026.103811) | User study: users tend not to use control features unless prompted; transparent and user-friendly controls encourage usage; availability of controls associated with feeling of empowerment | Controls must be discoverable and low-friction; not buried behind a settings navigation |

### 4.3 Viewability and attribution (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [EcomToolkit — Ecommerce Recommendation Performance Analytics, Jul 2026](https://ecomtoolkit.net/blog/ecommerce-product-recommendation-performance-analytics-2026/) | "An impression should mean that a recommendation was rendered and viewable, not merely returned by an API." 9-step funnel: request triggered → candidates returned → business rules → items rendered → module viewable → item clicked → meaningful engagement → add to cart → purchase. Metrics: qualified click rate, novel product-view rate, incremental conversion lift, hide/dismiss/rapid-back signals | ThryftVerse records `served` at response time but never advances to `rendered`/`viewable`. All training data would be contaminated by served-but-unseen candidates |
| [Adobe Commerce — Recommendations Performance](https://experienceleague.adobe.com/en/docs/commerce/optimizer/manage-results/recommendation-performance) | Distinguishes `impressions` (rendered on page) from `vImpressions` (viewable impressions — scrolled into viewport). vCTR measures clicks based only on viewable impressions | ThryftVerse's schema has this distinction (migration 141) but the client never triggers it |
| [Amazon Ads — View Attribution Updates, Jan 2026](https://advertising.amazon.com/resources/whats-new/view-attribution-updates-for-amazon-store-ads) | Shopping-signal enhanced last-touch attribution model; credit to ad views during early discovery moments; shorter attribution window | ThryftVerse needs view-aware attribution before any trained model can learn from exposures |

---

## 5. Capability, state and ownership matrices

### 5.1 Source-of-truth matrix

| Concern | Current owner | Problem | Target owner |
|---|---|---|---|
| Recommendation eligibility | SQL in route (`recommendations.ts:642–667`) | Incomplete trust/inventory rules, bounded recent pool (500) | Versioned eligibility service/projection |
| Candidate retrieval | Newest 500 SQL rows | Single source, hard recall ceiling | Candidate federation with source lineage |
| Rank score | ML service heuristic or API fallback | Two heuristic implementations can drift | Decision service champion; API emergency fallback parity-tested |
| User intent controls | Frontend mock (`algorithmTransparencyApi.ts:346`) | No durability or effect | Authoritative intent ledger/API |
| Inferred topics | Mock fixtures (`MOCK_TOPICS:142`) | Synthetic, untraceable | Derived projection from permitted signal ledger |
| Feed explanation | Server reason codes vs mock topics | Vocabulary and evidence disconnected | Shared reason taxonomy + evidence references |
| Exposure | Server pre-creates impression (`recordServe:253`); client silent | "Served" confused with viewed downstream | Client viewability + monotonic server ledger |
| Interaction attribution | Optional client fields | Home drops them (`useForYouFeed.ts:83–88`) | Shared recommendation item VM retains lineage |
| Personalisation mode | Implicit | Silent fallback/general feed (`HomeScreen:584`) | Durable account choice and response `serveMode` |
| Model promotion | Schema/manual operations | Registry not enforced end-to-end | Signed registry + automated promotion controller |

### 5.2 Response modes that must be explicit

| Mode | Meaning | User treatment |
|---|---|---|
| `personalized` | Permitted signals used | No persistent badge; per-item explanation available |
| `cold_start` | Insufficient history | Quiet "Popular and new" context where useful |
| `non_profiled` | Account choice excludes profiling | Persistent selected state in feed controls |
| `degraded_cached` | Valid recent page reused | Normally silent; timestamp only if materially stale |
| `degraded_baseline` | Trained/champion service unavailable | Do not claim tailored learning; preserve safe feed |
| `recovery_general` | No eligible personalized results | Explain once; never silently pretend it is For You |

---

## 6. User psychology, JTBD and trust design

### 6.1 Jobs to be done

- "Help me find things that feel like me without making me manage a model."
- "When the feed is wrong, let me correct it with one reversible action."
- "Tell me why I saw this when I ask, in language tied to real activity."
- "Let me switch off profiling without punishing me with a broken/empty product."
- "Let temporary shopping intent expire instead of redefining me forever."

### 6.2 Trust principles

1. **Agency requires effect.** A control is not real until its mutation version appears in the next serve and the resulting distribution measurably changes. Today, `updateTopicWeight` mutates module-level memory and has zero effect on the feed.
2. **Inference is not identity.** Never label the user with personality or sensitive traits. "More vintage watches" is a feed parameter, not "You are a luxury collector."
3. **History is not irrevocable consent.** The current copy (`YourAlgorithmScreen.tsx:635`) saying purchase/browse topics "cannot be removed because they reflect your real activity" is unacceptable. A transaction may need retention; continued recommendation use can still be disabled. DSA Article 27 requires options to modify parameters.
4. **Explanation is evidence, not persuasion.** Use attributable actions: "Because you saved two linen jackets," with a manage/remove link. Not `AIConfidence: 'high'` derived from `WEIGHT_TO_CONFIDENCE[topic.weight]`.
5. **Negative feedback needs undo and scope.** "Not interested in this item," "show fewer from this seller," and "less of this topic" are different intents.
6. **Temporary intent needs expiry.** "Shopping for a wedding" should default to a visible time window and never silently become a permanent inferred trait.

### 6.3 Psychological failure modes

- **Fake agency:** User adjusts topic weight, sees no change in feed, learns controls are decorative. This is the most damaging failure mode and it is the current state.
- **Exposure bias:** Training on served-but-unseen candidates treats invisible items as "rejected" by the user. Since `useForYouFeed` never calls `/recommendations/impressions`, all `served` rows remain `served` forever — none advance to `rendered` or `viewable`.
- **Confidence deception:** `WEIGHT_TO_CONFIDENCE` maps mock weights to `AIConfidence` badges. The user sees "high confidence" on fabricated data. This violates AGENTS.md §11 (Truthful UI) and DSA Article 25 (prohibits deceptive designs).
- **Silent fallback:** `effectiveForYouData` (HomeScreen:584) silently substitutes general listings when recommendations fail. The user thinks they see personalized content; they see all listings sorted by recency.

---

## 7. Strict anti-AI native design direction

### 7.1 First viewport

- Header: `Your algorithm`, transparent Back target, optional plain `Reset` text action.
- One concise mode row: `Personalized` / `Non-profiled`, with plain consequence text only when changed.
- Dominant object: a flat ranked list of 5–7 evidenced topics, each showing label, restrained source text and a three-state `Less / Usual / More` control only when expanded.
- The next section begins with "Recent influences"; do not lead with stat cards such as "Active topics" and "Signals."

### 7.2 Remove current AI-made tells

- **Remove `WEIGHT_TO_CONFIDENCE`** (`YourAlgorithmScreen.tsx:97–101`) and all `AITrustBadge`/`AITrustSignal` components that display confidence on mock data. They imply model certainty with no calibrated probability.
- **Remove `signalWeightToConfidence`** (`YourAlgorithmScreen.tsx:104–107`) and "Relative influence: X%" display (line 901). Percentage affinity on mock data is deceptive.
- Remove dashboard stat tiles and ornamental explanatory panels.
- Do not show percentage affinity, neural/brain/sparkle iconography, charts, gradients or "AI-powered" copy.
- Avoid labelling every row with category, source, confidence and lock at once. Use progressive disclosure.
- One radius for the optional dominant mode boundary; topic rows remain flat with hairlines.
- **Fix the "cannot be removed" copy** (line 635). Replace with: "Topics from your activity can be paused from your feed. Transaction records are kept for trust and accounting but you control whether they influence recommendations."

### 7.3 Motion/haptics/accessibility

- Weight change: 160–200ms indicator movement and selection haptic; reduced motion updates instantly.
- Undo snackbar for destructive negative/remove/reset operations; no celebration.
- Screen reader row label states topic, current influence and evidence source; expanded controls follow immediately in reading order.
- Dynamic Type can wrap topic/evidence; controls move below rather than truncate meaning.
- Mode, weight and expanded state use `accessibilityState`; reset result is announced.

---

## 8. Target architecture and source-of-truth boundaries

```text
Authorized event producers
  → interaction/event ledger (purpose, provenance, request attribution)
  → feature pipelines with point-in-time joins
  → short-term session intent + long-term permitted profile

Authoritative user controls
  → intent mutation transaction
  → intent_version++ + outbox event
  → cache invalidation / online feature update
  → next serve cites intent_version

Candidate sources
  recent inventory | content similarity | collaborative | graph |
  item-to-item | session intent | exploration | marketplace modules
  → eligibility
  → pre-rank
  → multi-task score
  → whole-page re-rank/diversity/fatigue
  → serve ledger with source lineage and propensity
  → rendered/viewable/outcome confirmation
```

### 8.1 Boundary decisions

- The intent ledger is authoritative for explicit controls; model-derived profiles are rebuildable projections.
- The decision service owns rank policy. API fallback is a parity-tested emergency implementation, not a second product ranker.
- PostgreSQL owns listing availability/trust truth; recommendation caches cannot override it.
- Native owns viewability measurement under a versioned definition, not ranking semantics.
- Explanations resolve through a controlled evidence service; the frontend never synthesizes causes.

---

## 9. Proposed data contracts and events

### 9.1 Intent mutation

```ts
type IntentScope = 'item' | 'seller' | 'topic' | 'category' | 'brand' | 'session';
type IntentDirection = 'more' | 'usual' | 'less' | 'exclude';

interface IntentMutationRequest {
  idempotencyKey: string;
  scope: IntentScope;
  targetId: string;
  direction: IntentDirection;
  expiresAt?: string;
  source: 'your_algorithm' | 'feed_action' | 'onboarding' | 'search';
  expectedIntentVersion?: number;
}

interface IntentMutationResult {
  mutationId: string;
  intentVersion: number;
  effectiveAt: string;
  status: 'applied' | 'already_applied' | 'conflict';
}
```

### 9.2 Recommendation response (shared contract)

```ts
interface RecommendationPage {
  requestId: string; sessionId: string; surface: string;
  serveMode: 'personalized' | 'cold_start' | 'non_profiled' | 'degraded_baseline';
  policyVersion: string; featureSchemaVersion: string;
  modelId: string; modelVersion: string | null;
  intentVersion: number; generatedAt: string; cursor: string | null;
  items: RecommendationItemVM[];
}

interface RecommendationItemVM {
  listing: DisplayReadyListing;
  position: number; scoreBand: 'high' | 'medium' | 'explore';
  candidateSources: CandidateLineage[];
  reasonCodes: RecommendationReasonCode[];
  explanationToken: string | null;
  selectionPropensity: number | null;
}
```

The client retains this VM through render, detail navigation and action creation. Do not narrow trained capability to impossible literal types.

### 9.3 New/extended tables

- `user_intent_mutations`: immutable mutation, actor, scope, target, direction, source, expiry, idempotency key, consent/policy version.
- `user_intent_versions`: one row per actor with monotonic version.
- `recommendation_signal_ledger`: event provenance, purpose, retention, permitted use, source request and deletion state.
- `recommendation_topic_projection`: topic taxonomy/version, evidence count/window, influence band, removable/controllable state; no raw sensitive inference in native DTO.
- Extend `recommendation_serves` with `serve_mode`, `intent_version`, `model_id/version`, candidate-source counts and fallback reason enum.

### 9.4 Event vocabulary

```text
recommendation.intent.changed.v1
recommendation.intent.reset.v1
recommendation.profile.mode.changed.v1
recommendation.serve.created.v2
recommendation.item.rendered.v1
recommendation.item.viewable.v1
recommendation.feedback.recorded.v1
recommendation.model.shadow_scored.v1
recommendation.model.promoted.v1 / rolled_back.v1
recommendation.signal.deleted.v1
```

Control mutations use unique `(actor_id, idempotency_key)`, optimistic `expected_intent_version`, transactionally increment the version and write an outbox event. Unknown network outcome returns an operation token/check-result path—not a fabricated failure or success.

---

## 10. Client state machines

### 10.1 Feed

```text
idle
 → loading_initial
   → populated_personalized | populated_cold_start | populated_non_profiled
   → empty_eligible
   → error_recoverable
refreshing(previous_page_retained)
 → populated | partial | unknown_refresh_outcome
offline_cached(stale_at)
degraded_baseline(reason)
```

### 10.2 Intent control

```text
stable(version N)
 → submitting(idempotency key, optimistic preview optional)
   → applied(version N+1, undo window)
   → conflict(server version, refetch)
   → rejected(policy reason)
   → unknown_outcome(operation id → check result)
undoing → applied(version N+2) | unknown_outcome
```

Optimistic preview may visually stage a change, but Home cannot claim the feed changed until the next response cites the new version. Offline controls queue only if semantics and expiry are safe; otherwise disable with a truthful reason.

### 10.3 Your Algorithm states

Loading geometry matches topic rows; empty means genuinely no permitted topic projection; partial renders available topics and a local retry for influence history; privacy-deleted shows the non-profiled/general state; stale cached data includes last-updated context; reset has submitting, applied, conflict and unknown-outcome handling.

---

## 11. Ranking, ML and evaluation design

### 11.1 Candidate stages (informed by Pinterest 2026 cascade)

Per [Pinterest Home Feed Multi-Objective Optimization, Apr 2026](https://medium.com/pinterest-engineering/evolution-of-multi-objective-optimization-at-pinterest-home-feed-06657e33cd10), the industry standard is a cascaded funnel:

1. **Retrieval** — multiple sources independently return IDs, source rank/score/version. ThryftVerse today: single SQL source (newest 500).
2. **Pre-ranking** — lightweight scorer reduces union within strict latency budget. ThryftVerse today: none.
3. **Ranking** — multi-task scorer estimates qualified detail, save, message/offer, checkout/completion and negative/return risks. ThryftVerse today: heuristic quality/popularity/trust.
4. **Re-ranking** — page composition: diversity, novelty, fatigue, seller concentration, exploration. ThryftVerse today: none. Pinterest reports removing diversity hurt long-term outcomes.

### 11.2 Marketplace ranking signals (informed by Depop/Vinted/eBay 2026)

| Signal | ThryftVerse today | Target |
|---|---|---|
| Title keyword relevance | Not in ranker (only in search) | Include in candidate scoring |
| Structured attributes | Not in ranker | Brand, size, condition, category as features |
| Photo quality / CTR | Not collected | Track main-photo viewability and CTR |
| Listing freshness | `ORDER BY l.created_at DESC` in SQL, not in ranker | Recency as a ranking feature, not the sole sort |
| Seller reputation | `seller_rating` from `order_reviews` | Include in ranker (already fetched) |
| Popularity (views, likes, saves) | `interaction_count` (30-day global) | Include in ranker (already fetched) |
| Price competitiveness | Not in ranker | Price relative to category median |
| Shipping speed/cost | Not in ranker | Include when available |

### 11.3 Offline datasets

- Point-in-time joins prevent post-event leakage.
- Training examples require **viewable** exposure; served-but-unseen candidates are not negatives. This is impossible today because viewability is never confirmed.
- Split by time and seller/listing family to reduce memorization.
- Carry consent and deletion eligibility into dataset manifests.
- Report Recall@K for each candidate source; NDCG/MRR for rank; calibration/Brier/log loss per task; coverage, novelty, intra-list diversity, seller concentration and long-tail exposure.
- Slice by cold start, low activity, language, category, price band, new seller, new listing, protected/difficult cohorts and device/network.

### 11.4 Online tests and guardrails

- Primary: completed-order quality or a pre-agreed composite tied to saves/messages/checkout and negative outcomes.
- Long-term: 7/28-day return, repeated hides, reports, returns/refunds and category fatigue.
- Guardrails: API latency/errors, empty rate, crash, unsafe exposure, seller concentration, new-seller coverage and non-profiled parity.
- Exact propensity logging is required before inverse-propensity/off-policy conclusions; the current approximation (`recommendations.ts:320–321`) cannot support strong causal claims under a complex blender.

### 11.5 Promotion

Candidate → offline-approved → shadow → canary → active. Artifact hash, container digest, code commit, dataset manifest, feature/preprocess schemas and rollback model must match registry. Shadow deltas are persisted; automated rollout halts on contract, latency, calibration, fairness or marketplace guardrail breach.

---

## 12. Threat, abuse and failure-mode analysis

| Failure/abuse | Current exposure | Control |
|---|---|---|
| Fake agency | `updateTopicWeight`/`removeTopic`/`addTopic` mutate module-level memory only (`algorithmTransparencyApi.ts:393,411,430`) | Demo label until next-serve causal tests pass; build authoritative intent API |
| Exposure bias | Server rows treated as impressions; `useForYouFeed` never calls `/recommendations/impressions` | Train only on confirmed viewable state; add viewability calls to Home |
| Feedback poisoning | Any high-volume action can shape profile | Rate/risk weighting, dedupe, anomaly detection, provenance |
| Seller manipulation | Coordinated clicks/saves | Trust-weighted signals, graph abuse detection, holdouts |
| Filter bubble/fatigue | Click optimization; no diversity re-ranking | Exploration, diversity and long-term guardrails (Pinterest 2026: removing diversity hurt long-term) |
| Sensitive inference | Free-form mock topics (`MOCK_TOPICS:142`) | Controlled taxonomy, denylist, privacy review, no sensitive traits |
| Deletion resurrection | Derived features/training copies | Tombstone propagation, dataset manifest exclusion, retrain policy |
| Cache/version skew | Redis epoch unavailable; no durable Your Algorithm mutation increments it | DB version truth, bounded cache TTL, response mismatch detection |
| Model/schema mismatch | Client literal contracts (`recommendationTypes.ts`); registry separate | Runtime schema handshake and generated shared types |
| Silent fallback | `effectiveForYouData` substitutes all listings (`HomeScreen:584`) | Explicit serve mode and measured recovery policy |
| Unknown mutation outcome | Mobile disconnect after submit | Idempotency key + status endpoint + warning state |
| Confidence deception | `WEIGHT_TO_CONFIDENCE` maps mock weights to AIConfidence badges (`YourAlgorithmScreen.tsx:97`) | Remove confidence badges until calibrated probabilities exist |
| Manipulative copy | "cannot be removed because they reflect your real activity" (`YourAlgorithmScreen.tsx:635`) | Rewrite to respect user agency; DSA Article 25 prohibits deceptive designs |

---

## 13. Privacy, security and policy

- Classify signals by purpose: security/trust, transaction fulfilment, product personalization, model training. One purpose does not imply another.
- Provide access, correction, reset, export and deletion; preserve legally required transaction records while excluding them from personalization when chosen.
- Default minors/high-risk cohorts to more conservative profiling rules; product/legal must define exact policy.
- Avoid raw feature vectors and sensitive free text in general logs. Restrict model/debug access with audit trails.
- Explanations must disappear or generalize when source evidence is deleted/expired.
- Non-profiled mode must remain useful through recency, broadly aggregated popularity and explicit choices, with no covert personalized cache reuse.
- `ALGORITHM_DEMO_MODE = __DEV__` must be replaced with an honest runtime flag that reflects whether real backend data is available, not whether the app is in development mode.

---

## 14. SLOs, SLIs and observability

| SLI | Target |
|---|---:|
| Feed availability | 99.95% monthly |
| Warm recommendation latency | p95 <300ms server-side |
| Cold/uncached recommendation latency | p95 <650ms, p99 <1,200ms |
| Viewability confirmation acceptance | >99.9%; duplicate effect 0 |
| Attributable viewable interactions | >99% for supported Home actions |
| Control mutation availability | 99.95% |
| Control → next eligible serve | p95 <2s; >99% next-serve version match |
| Fallback rate | <1% steady-state; page on >5% for 5m |
| Empty eligible page | <0.5% except explicit filters/policy |
| Intent/model version mismatch | exactly 0 served pages |

Distributed trace: native feed request → candidate SQL/sources → decision service/cache → serve write → serialization → native render/viewability → interaction write → epoch update. Dashboards by policy/model/surface/cohort show latency, fallback, cold start, viewability confirmation, attribution, source recall/coverage, seller concentration, negative outcomes and control-effect latency. Raw sensitive intent is excluded from labels.

---

## 15. Migration, feature flags, compatibility and rollback

### 15.1 Flags

```text
recommendation_attribution_vm_v1
recommendation_viewability_home_v1
algorithm_intent_api_v1
algorithm_next_serve_proof_v1
recommendation_non_profiled_v1
recommendation_multisource_v1
recommendation_trained_champion_v1
recommendation_honest_demo_flag_v1
```

### 15.2 Sequence

1. Generate one shared response schema; widen impossible trained-model literals compatibly.
2. **Preserve request/item lineage in Home VM** — refactor `useForYouFeed.ts:83–88` to return `RecommendationItemVM[]` instead of `Listing[]`.
3. Add rendered/viewable calls in shadow logging; integrate list viewability.
4. Audit attribution rates and viewability thresholds before using statuses for training.
5. Add intent ledger/version APIs (`routes/recommendationIntent.ts`); keep mock UI isolated until live data parity.
6. **Fix `ALGORITHM_DEMO_MODE`** to reflect real backend availability, not `__DEV__`.
7. **Remove `WEIGHT_TO_CONFIDENCE` and confidence badges** until calibrated probabilities exist.
8. **Fix "cannot be removed" copy** to respect user agency.
9. Dual-read mock/live only in internal builds; external builds fail closed to the truthful unavailable state.
10. Prove weight/negative/reset mutations affect the next serve distribution and version.
11. Launch non-profiled mode before trained champion.
12. Add candidate sources and exact lineage in shadow; then promote stage by stage.
13. Trained model remains challenger until registry, shadow, canary and rollback gates pass.

Rollback is a policy pointer/flag change to the last approved champion. Intent mutations and exposure ledgers remain append-only. Older clients receive compatible defaults and cannot send unsupported controls. Do not delete mock fixtures until screenshot/development workflows have an explicit fixture provider.

---

## 16. Phased implementation plan mapped to files/owners

### Phase 0 — measurement truth (1–2 sprints)

- **Native:** refactor `useForYouFeed.ts` (lines 83–88) to return attributed VMs and session ID; integrate list viewability.
- **Backend:** harden `/recommendations/impressions` (line 576); dashboards/tests for served/rendered/viewable.
- **Contracts:** unify `recommendationTypes.ts`, product-detail recommendation service and feed contract.
- **Analytics/Privacy:** ratify viewability definition and retention.

### Phase 1 — authoritative controls (2–3 sprints)

- **Backend:** migrations, `routes/recommendationIntent.ts`, transaction/outbox/version/status endpoints.
- **Native:** replace `algorithmTransparencyApi.ts` mock path (lines 346–431) and re-author `YourAlgorithmScreen.tsx` composition; remove `WEIGHT_TO_CONFIDENCE` (line 97) and confidence badges; fix "cannot be removed" copy (line 635).
- **Decision service:** consume intent version, explicit preferences and exclusions.
- **QA:** next-serve effect, conflict, offline and unknown-outcome tests.

### Phase 2 — candidate federation and evaluation (3–5 sprints)

- **ML/Data:** point-in-time dataset pipeline, source retrievers, evaluator and model cards.
- **Discovery/Trust:** eligibility service, dedupe and seller guardrails.
- **SRE:** per-stage tracing, feature freshness and fallback dashboards.

### Phase 3 — trained promotion and transparency (2+ sprints)

- Shadow challenger, canary cohorts and automated rollback.
- Live evidenced topics/recent influences and explanation tokens.
- Export/reset/deletion workflows and privacy audit.

---

## 17. Test, eval and release gates

- Shared schema contract tests cover heuristic, trained, cache and fallback modes.
- Home sends exactly one monotonic rendered/viewable transition per request/listing.
- Interaction retains request ID, position, policy/model and valid idempotency key through detail navigation.
- Concurrent intent writes conflict safely; replay is no-op; network loss resolves through status lookup.
- "Less" statistically reduces target exposure in deterministic test corpus while preserving eligibility/diversity.
- Reset/non-profiled excludes disallowed features from online serving and future dataset manifests.
- Offline evaluation is time-split, slice-complete and reproducible from registry artifacts.
- Shadow prediction and latency comparison runs for a full representative cycle.
- Canary 1% → 5% → 25% → 50% → 100%; automatic rollback on SLO, negative, safety, concentration or calibration breach.
- Native VoiceOver/TalkBack, Dynamic Type, reduced motion, offline, partial and unknown-outcome matrix passes.
- Product/legal approves explanation taxonomy, signal use and minors policy.
- No confidence badge renders without a calibrated probability backing it.
- `ALGORITHM_DEMO_MODE` reflects real backend availability, not `__DEV__`.

---

## 18. Explicit non-goals

- A "personality profile," psychographic labels or sensitive-trait inference.
- User-facing model scores/confidence percentages.
- Training a foundation model from scratch.
- Replacing editorial/Following feeds with the same personalization policy.
- Optimizing click/dwell as the sole objective.
- Making every internal feature inspectable; explanations should expose meaningful parameters/evidence, not security-sensitive internals.

---

## 19. Decisions requiring product, legal and privacy input

1. Exact semantics and expiry for `less`, `exclude`, seller, brand, topic and session intent.
2. Which transaction/browse signals may be retained yet excluded from personalization.
3. Non-profiled feed definition, default and persistence across devices.
4. Topic taxonomy, prohibited/sensitive inferences and minors handling.
5. Explanation granularity and evidence retention after deletion.
6. Marketplace objective weights and acceptable seller/new-seller concentration bands.
7. Viewability threshold by layout/media and whether rapid skip is a negative signal.
8. Training retention, unlearning/retraining policy and audit evidence.
9. Whether the "cannot be removed" copy should be replaced before or after the intent API is live.

---

## 20. Final decision

**KEEP THE HEURISTIC CHAMPION; FUND LOOP CLOSURE BEFORE MODEL DEPTH.** The next release milestone is not a trained-model badge. It is an attributed Home feed and a live intent API where every control produces a durable version, every next serve proves which version it used, every exposure is distinguished from delivery, and every explanation resolves to permitted evidence. Only after those gates should ThryftVerse promote a trained challenger or remove the `Your Algorithm` demo disclosure. The `WEIGHT_TO_CONFIDENCE` confidence badges and "cannot be removed" copy must be fixed immediately regardless of model status — they are deceptive under DSA Article 25 and AGENTS.md §11.
