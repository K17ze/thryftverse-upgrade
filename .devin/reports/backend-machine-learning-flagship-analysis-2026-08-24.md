# ThryftVerse Backend Intelligence — Flagship ML Research and Implementation Blueprint

**Research cut-off:** 24 August 2026  
**Repository snapshot:** `ab0b99d8f8ea54c0f156fa4ae39b8c99fe6716ce`  
**Scope:** recommendation, discovery, search, visual retrieval, catalogue enrichment, duplicate detection, pricing advice, auctions, fraud, trust, moderation, media intelligence, experimentation, MLOps, privacy, security, and product psychology  
**Status:** code-grounded research and implementation blueprint; this report does not change production behavior  
**Quality policy:** `AGENTS.md`, `Design.md`, truthful UI, fail-closed trust signals, and the anti-AI-made design policy

---

## 0. Executive verdict

ThryftVerse should not respond to the current quality gap by adding a general-purpose “AI layer.” The repository already contains several things that many early products skip: a separate Python decision service, versioned recommendation policies and feature contracts, reproducible request timestamps, deterministic exploration, seller/category caps, attributed recommendation serves, circuit breaking, a truthful heuristic capability label, moderation provider boundaries, catalogue-import field provenance, idempotent publication, queues, outbox infrastructure, and explicit human-review requirements for pricing advice.

That is a strong foundation. It is not yet a production machine-learning system.

The current backend intelligence is mostly deterministic:

- recommendation is `recommendation-heuristic-v2.0`, not a trained ranker;
- the recommendation evaluation set contains three handcrafted cases and eight candidates;
- visual search compares colour histograms, a 2×2 spatial grid, luminance, contrast, and aspect ratio;
- conversational search is a keyword and regular-expression parser;
- contextual product recommendations are a weighted exact-match heuristic;
- catalogue field mapping and duplicate detection are versioned heuristics;
- price forecasting is a moving-trend baseline and pricing actions require human review;
- fraud is a Redis-backed rule score, not an empirically calibrated risk model;
- image moderation can call trained third-party providers, but ThryftVerse does not yet own a durable labelled review/evaluation loop.

The largest blocker is not model sophistication. It is **learning-system integrity**. Before the first trained ranker can be promoted, ThryftVerse needs:

1. an append-only, server-verifiable exposure and outcome contract;
2. event time, ingestion time, surface, session, request, position, candidate-source, and selection-propensity lineage;
3. point-in-time-correct feature materialisation and delayed labels;
4. a representative time-split evaluation corpus, not a small scenario fixture;
5. artifact, data, feature, and code version lineage;
6. shadow and canary deployment with prediction-quality SLOs;
7. segment, marketplace-health, calibration, latency, and safety gates;
8. user control, faithful explanations, reset/negative-feedback paths, and non-profiled alternatives where required;
9. a strict boundary between low-risk assistance and authoritative commerce, money, identity, enforcement, or settlement decisions.

The first trained production model should therefore be a **small CPU-served learning-to-rank challenger**, most plausibly LightGBM LambdaRank or XE-NDCG-MART, using the already defined interpretable features plus improved exposure/outcome data. It should shadow the deterministic baseline before receiving limited traffic. A deep two-tower or graph recommender is a later retrieval-stage investment, justified only after catalogue scale and interaction volume make it useful.

The first multimodal model should be an **offline image/text embedding worker**, evaluated on ThryftVerse’s own fashion, home, collectible, and marketplace queries. SigLIP 2 is a strong 2025-era candidate because it supports multilingual image-text retrieval and native-aspect-ratio variants, but it is a benchmark candidate, not a foregone conclusion. CLIP, SigLIP 2 variants, and any vendor model must be tested on exact-category, attribute, colour, condition, near-duplicate, and out-of-domain slices. Embeddings should be stored with model-version lineage and retrieved through the existing Meilisearch hybrid path or PostgreSQL with pgvector. The current colour/layout heuristic remains a truthful fallback.

The highest-return roadmap is:

> data truth → trained ranking challenger → hybrid/multimodal retrieval → constrained re-ranking → importer assistance → calibrated moderation/fraud support → advanced sequence/graph models only when the evidence demands them.

### Deployment verdict

| Capability | Current state | Production-trained ML verdict |
|---|---|---|
| Recommendation | Strong deterministic baseline and serve attribution | **Not ready for trained promotion** |
| Home/Discover feed | Chronological/velocity blending plus separate recommendation route | **Needs one ranked heterogeneous contract** |
| Text search | In-memory or Meilisearch keyword search; hybrid call is present | **Hybrid configuration and evaluation unproven** |
| Visual search | Honest colour/layout heuristic | **Ready for shadow embedding challenger, not replacement** |
| Conversational search | Honest keyword parser | **Do not call AI; add constrained semantic parsing later** |
| Catalogue import intelligence | Excellent provenance/review architecture; deterministic maps | **Best near-term human-in-the-loop ML surface** |
| Duplicate detection | Layered deterministic matching; never auto-merges | **Ready for learned candidate score in shadow/review only** |
| Price forecasting/advice | Simple advisory baseline with human review | **Keep advisory; build intervals before sophistication** |
| Fraud/risk | Explainable rules, Redis audit, advisory wrapper | **Trust blocker: error path fabricates low risk and allow** |
| Moderation | Provider abstraction and review lifecycle | **Needs durable labels, appeals, video, calibration, and slice QA** |
| MLOps | Version rows and CI smoke evaluation | **Needs training data lineage, registry, shadow telemetry, and drift gates** |

No generative “AI” chrome is required for any of this. The flagship result should feel like better relevance, faster listing, safer transactions, clearer recovery, and less repetitive discovery—not like a chatbot was bolted onto the app.

---

## 1. Research method and evidence standard

The codebase was traced in both directions:

```text
surface → request → route → candidate source → feature construction → decision service
        → re-ranking → response → impression → outcome → dataset → model → deployment

model artifact → inference contract → API attribution → UI explanation/control
              → user action → durable event → delayed label → evaluation/monitoring
```

Three evidence classes are used:

| Class | Meaning | Use in this report |
|---|---|---|
| A — code fact | Direct observation from this repository snapshot | Current-state and defect conclusions |
| B — primary technical evidence | Official documentation, first-party engineering publication, standard, or original paper | Architecture and implementation recommendations |
| C — product inference | A reasoned recommendation derived from A and B | Roadmap, sequencing, and product psychology |

“Latest” does not mean “newest model wins.” A 2026 flagship system is one whose data and deployment discipline allows it to adopt or reject models safely. Pinterest and Meta’s recent engineering publications describe cascaded retrieval/ranking/re-ranking systems, model registries, launch tooling, and predictive-health monitoring—not a single magic architecture.[^meta-1000-models][^pinterest-moo-2026]

This report intentionally does not:

- infer production traffic or data volume from source code;
- claim a third-party embedding model is accurate on ThryftVerse data without a benchmark;
- call a heuristic “AI”;
- recommend automatic price changes, auction manipulation, KYC decisions, account bans, or settlement decisions;
- treat clicks as unbiased relevance labels;
- use engagement alone as the definition of product quality;
- recommend Kafka, a feature store, Kubernetes, or GPUs merely to make the stack look advanced.

---

## 2. Current system inventory

### 2.1 Decision service

The canonical low-risk intelligence service lives in `backend/ml-service/` and uses FastAPI, Pydantic, NumPy, and Uvicorn. `backend/ml-service/README.md` is unusually candid: the service runs a versioned deterministic baseline and does not claim trained ML.

`backend/ml-service/app/ranking.py` implements:

- recency-decayed actions for view, wishlist, and purchase;
- token, category, brand, size, condition, sequence, and price affinity;
- listing freshness, quality, popularity, and seller-trust components;
- cold-start ranking when meaningful history is insufficient;
- deterministic novelty exploration;
- seller and category caps;
- exclusion of unavailable, duplicate, explicitly excluded, and purchased candidates;
- bounded component scores and stable reason codes.

The service contract supports up to 2,000 candidates and 500 recent interactions, although the current API route selects 500 candidates and 200 interactions. Production compose exposes the service on an internal network and the API uses an internal token plus a 2.5-second timeout.

This is a credible **champion baseline**. It is simple, reproducible, inspectable, and immediately recoverable. It should remain available as the rollback policy after learned models exist.

### 2.2 Recommendation serving and attribution

`backend/api/src/routes/recommendations.ts` and migration `077_decision_system_observability.sql` already provide:

- `decision_policy_versions` with shadow/active/retired/blocked states;
- `recommendation_serves` with request, user, surface, session, policy, schema, source, latency, exploration, and diagnostic data;
- `recommendation_impressions` with listing, position, score, exploit/explore policy, model, reason codes, and component scores;
- outcome attribution back to a valid user/request/listing impression;
- idempotent interactions and feedback;
- a versioned fallback;
- a Redis circuit breaker and one-minute cache;
- validation that the service returns only eligible candidates and unique positions.

These are important strengths. The gaps are equally concrete:

1. **A recorded recommendation row is a serve candidate, not proof it was visible.** The current API inserts every returned row into `recommendation_impressions` before client viewport exposure is known. Training must distinguish `served`, `rendered`, and `viewable`.
2. **The action vocabulary is too narrow.** Only view, wishlist, and purchase are accepted by the decision contract. There is no canonical visible dwell, long press, share, save-to-board, hide/not-interested, seller follow, profile open, add-to-basket, offer, message, bounce, or rapid skip event.
3. **No explicit propensity is stored.** The exploit/explore label and exploration rate are useful but not enough to reconstruct the probability that a particular item was selected at a position.
4. **Candidate-source lineage is absent.** A later multi-source funnel needs to identify keyword, semantic, visual, follow-graph, similar-item, fresh, trending, seller, and exploration candidates.
5. **The cache key is only user-scoped.** `recommendations:v2:${userId}` ignores surface and session intent, so a cached home ranking can be reused for a different recommendation surface within its TTL.
6. **The client response hardcodes `trainedModel: false`.** That is truthful today, but will become a contract bug the moment a trained policy is shadowed or promoted.
7. **Client analytics are stored in capped Redis lists.** `POST /analytics/events` is useful operational telemetry, not a durable training ledger.
8. **Candidate construction performs wide per-request work.** Up to 500 full listing documents and 200 historical listing documents are serialised across HTTP. That is acceptable for a baseline, but a trained service needs a compact feature contract and precomputed/static features.

### 2.3 Evaluation

`backend/ml-service/evaluation/recommendation_baseline_v2.json` defines thresholds for NDCG@K, MRR, recall, catalogue coverage, and maximum seller concentration. That is the correct family of metrics. The fixture has only:

- three user scenarios;
- eight candidates;
- two personalised cases and one cold-start case;
- hand-authored relevant IDs.

It is a deterministic regression smoke test, not an evidence base for production promotion. It cannot reveal position bias, temporal leakage, new-user behavior, new-item exposure, sparse categories, seller inequality, calibration, query/surface differences, or long-term feedback loops.

### 2.4 Feed and discovery

`backend/api/src/routes/feed.ts` exposes separate home, looks, trending, and following endpoints. Home combines recent listings, posters, and looks chronologically. Trending ranks listings by recent event velocity. Following combines followed creators’ items chronologically. The recommendation route separately ranks active listings.

This split explains why merely changing masonry geometry cannot create Pinterest-quality discovery. The UI needs one response contract that can rank heterogeneous objects while preserving type-specific rendering and constraints. The backend currently has the content, but not one decision owner for composition.

Pinterest’s 2025 module work is relevant here: modules are heterogeneous objects with their own relevance layer, not decorative section headings placed into a grid.[^pinterest-modules] Its April 2026 account of final re-ranking is more important still: feed composition optimises more than immediate actions, and removing diversity can improve day-one actions while degrading later satisfaction and session outcomes.[^pinterest-moo-2026]

### 2.5 Search

`backend/api/src/lib/searchAdapter.ts` supports an in-memory implementation and a Meilisearch implementation. `backend/api/src/lib/vectorSearch.ts` attempts Meilisearch hybrid search and falls back to ordinary text search. `backend/api/src/routes/conversationalSearch.ts` is explicitly labelled `heuristic keyword matching, not AI`.

Current risks:

- hybrid search assumes a configured embedder named `default`, but no code-level evidence in the inspected path proves production embedder configuration, indexing completeness, or relevance evaluation;
- the in-memory adapter loses brand/category/condition/media fidelity when mapping results back to its generic document contract;
- the Meilisearch adapter builds filter strings directly and supports only a subset of marketplace facets;
- failure silently falls back, which is good for availability but needs a response capability marker and monitoring so semantic degradation is observable;
- search analytics are largely Redis counters/lists rather than a durable query → result → exposure → action evaluation stream;
- “conversational” should not be the product label while the implementation is a parser.

Meilisearch now supports named multiple embedders and federated combinations of lexical, semantic, and image queries, so the existing investment can support a credible hybrid pilot without prematurely adding a second vector database.[^meili-multiple-embedders]

### 2.6 Visual search

`backend/api/src/lib/visualSimilarity.ts` is an honest, lightweight feature extractor. It computes a 64-bin RGB histogram, 2×2 average-colour grid, luminance, contrast, and aspect ratio. `backend/api/src/routes/visualSearch.ts` fetches candidate images, computes features in memory, and labels responses `heuristic_color_features` or `filter_only`.

Strengths:

- no false AI claim;
- bounded fetch timeout and concurrency;
- a bounded in-memory feature cache;
- filtering still works when image scoring cannot;
- method disclosure is returned to the caller.

Limitations:

- colour/layout similarity cannot reliably understand object identity, style, silhouette, era, material, pattern, or substitute intent;
- candidates are fetched and decoded at request time;
- URL-keyed process memory is not a durable feature store and invalidation depends on URL changes;
- feature extraction stretches images to fixed thumbnails, which can distort composition;
- no embedding/model version, crop version, or asset checksum joins the result;
- only a limited candidate set is visually ranked.

The correct upgrade is offline, versioned embedding generation on approved media assets, not a larger synchronous request handler.

### 2.7 Catalogue importer

The new importer domain is one of the best-designed ML landing zones in the repository. Migrations `137_catalog_import_foundation.sql`, `138_catalog_import_provenance.sql`, and `139_catalog_import_publication.sql` create:

- consented source connections and capability gates;
- source snapshots, checksums, retention deadlines, and reconciliation state;
- authoritative media acquisition, checksum, perceptual-hash, verification, and moderation state;
- immutable per-field provenance with `source_kind`, raw/resolved value, confidence, mapping version, actor, and reason;
- seller/operator review queues;
- idempotent publication sagas and frozen request hashes.

`catalogImportNormalisationHandler.ts` deterministically maps category, condition, size, and currency; never upgrades condition automatically; never silently converts currency; blocks missing/low-confidence fields; and never auto-merges duplicates.

The architecture is already prepared for `ai_suggestion` provenance. That does **not** mean generation should overwrite facts. It means a model can propose:

- category leaf;
- normalised brand/entity;
- colour/material/pattern attributes;
- concise title cleanup;
- condition cues that always require confirmation;
- probable duplicate candidate;
- image order/crop suggestion;
- missing-field extraction;
- policy-risk reason;

while the original value, suggestion, model version, confidence band, and seller correction remain durable.

The most important learning signal is not “seller accepted batch.” It is the per-field correction delta: suggested value → confirmed value, with source/category/language/image-quality context.

### 2.8 Pricing and auctions

The decision service’s forecast and action endpoints are explicitly advisory. `backend/api/src/lib/pricingEngine.ts` is authoritative deterministic commerce logic for 1ze anchor, FX, markup, markdown, cross-border fee, PPP bounds, wallet segments, conversion events, and arbitrage checks. These should not be casually replaced by learned values.

Machine learning can support:

- comparable-listing retrieval;
- sell-through probability by price band and time horizon;
- demand trend and liquidity estimates;
- anomaly detection for implausible bids or price manipulation;
- reserve suggestion with an interval;
- seller-facing scenario comparisons.

It must not:

- silently change a listing price;
- optimise only platform conversion or fee revenue;
- present one precise number when the market is sparse;
- use future sale outcomes in training features;
- bid, retract, settle, or restrict an account by itself;
- merge auction countdown/order truth with probabilistic inference.

eBay’s public work is a useful pattern: a gradient-boosted model can estimate an outcome across candidate settings, but the product presents an item-level suggestion and evaluates it experimentally.[^ebay-ad-rate] For ThryftVerse, the user-facing result should be a range and explicit trade-off, such as “£72–£84 has the strongest recent comparable support; lower may sell faster,” never “AI price: £78.43.”

### 2.9 Fraud and seller risk

`backend/api/src/lib/fraudDetection.ts` combines device fingerprints, Redis velocity windows, account age, IP blacklist, disposable email, high-value/new-account, missing-user-agent, and multi-account signals. It returns explainable rule IDs and persists bounded Redis audit trails. `seller_risk_tiers` stores a rule-based velocity tier and reserve percentage.

The severe issue is the exception path in `checkFraudNonBlocking`: if the check fails, it returns `riskScore: 0`, `riskLevel: 'low'`, and `action: 'allow'`. Operationally allowing a low-risk flow can be a business decision; claiming the user was evaluated as low risk when no evaluation completed is not. The state must be `unknown` or `check_unavailable`, and high-risk money or account actions need a separate fail policy.

Other gaps:

- Redis expiry makes the audit trail unsuitable as the sole durable evidence for disputes and model training;
- device fingerprinting uses IP and headers and needs a privacy purpose, retention, access, and rotation design;
- thresholds are not shown to be calibrated against labelled outcomes;
- user-submitted reports are Redis lists rather than a durable review/case domain;
- feedback from investigators, disputes, chargebacks, false positives, and appeals is not yet a labelled training contract;
- an attacker can deliberately shape event data, so any learned system requires poisoning/evasion monitoring.

Fraud ML should initially be a shadow score that prioritises human review, not an autonomous blocker. The model should output calibrated risk plus reason features, while authoritative rules continue to own irreversible actions.

### 2.10 Moderation

The moderation provider abstraction supports mock, Sightengine, and Amazon Rekognition. `moderationService.ts` maps results into approved, review, rejected, or failed lifecycle states. `routes/moderation.ts` supports owner/admin triggering, status inspection, and admin review.

Current gaps:

- manual decisions are logged to console rather than a dedicated immutable review-decision table in the inspected path;
- raw provider confidence and labels are returned to callers without a product-level disclosure policy;
- image moderation is available, but video moderation is not closed;
- no appeal, reviewer disagreement, sampling-QA, per-category threshold, or vendor/model change-control domain was found;
- no labelled evaluation set or slice metrics are tied to deployment;
- repeated owner-triggered moderation should be queued, idempotent, and rate-controlled;
- a provider score is not calibrated probability and must not be displayed as certainty.

Amazon’s own guidance frames automation as triage that narrows the human-review set and supports confidence-range or random-sampling review rules.[^aws-moderation] That is the correct mental model here.

---

## 3. Product principle: invisible intelligence, visible agency

Flagship intelligence is usually experienced indirectly:

- the first discovery viewport feels varied and personally relevant;
- “similar” actually preserves the object or style the user meant;
- search understands attributes without hiding exact filters;
- an imported catalogue arrives mostly complete but never falsifies facts;
- a risky action receives an appropriate check without treating the user as guilty;
- pricing advice describes evidence and uncertainty;
- moderation catches harm without pretending it is infallible.

The anti-AI design policy therefore extends into backend and UX contracts.

### 3.1 Prohibited intelligence patterns

- sparkle icons or gradient “AI” pills on ordinary search and recommendation results;
- “Powered by AI” as a substitute for an explanation;
- fabricated natural-language reasons not traceable to actual decision inputs;
- raw confidence percentages shown as consumer certainty;
- automatic edits presented as seller-authored facts;
- an assistant persona inserted where a facet, preview, range, or review queue is better;
- one opaque “For you” feed with no controls or alternate ordering;
- engagement-maximising repetition that makes masonry look algorithmically monotonous;
- false low-risk, success, approval, or completion states when inference failed;
- mock personalisation or generic summaries created to make an empty state look intelligent.

### 3.2 Required user controls

At minimum, personalised discovery should support:

- `Not interested` with immediate removal and durable negative feedback;
- `Show fewer like this` where the reason can be scoped;
- undo after negative feedback;
- a “Why this” explanation derived from stable reason codes;
- management/reset of inferred interests and explicit preferences;
- a non-profiled or plainly chronological alternative where legally or product-wise appropriate;
- private/sensitive signal exclusions;
- separate controls for content type, category, seller, price, and recency rather than one vague personalisation switch.

NIST’s explainability work stresses that explanations must be meaningful to their audience, not merely expose internal mechanics.[^nist-explainability] Empirical work on algorithm aversion shows that even slight user control can improve willingness to use imperfect algorithmic advice.[^algorithm-control] That supports an important design rule: the best explanation frequently ends in an action.

Example:

```text
Because you saved vintage outerwear        [Show less] [Manage]
```

Not:

```text
AI match 96% ✨
```

### 3.3 Psychology and marketplace health

Optimising immediate taps alone creates self-reinforcing sameness:

1. high-ranked inventory receives exposure;
2. exposed inventory receives more clicks;
3. clicks are misread as pure relevance;
4. the same styles and sellers rise again;
5. the feed becomes repetitive;
6. new inventory and sellers cannot earn evidence.

Pinterest reported in 2026 that removing diversity could improve immediate actions but harm later session and satisfaction outcomes.[^pinterest-moo-2026] ThryftVerse should explicitly optimise a constrained marketplace objective rather than a single engagement score.

Suggested final-list objective:

```text
expected_user_value
+ discovery_novelty
+ seller/catalogue_coverage
+ freshness
+ trust_and_content_quality
- visual_repetition
- seller_concentration
- category_saturation
- policy_risk
```

This is not a licence to hide irrelevant inventory for business reasons. User relevance remains the primary constraint; composition prevents pathological repetition among sufficiently relevant candidates.

---

## 4. Target recommendation architecture

Industrial recommenders converge on a funnel because expensive models cannot score every item. YouTube’s canonical paper separates candidate generation and ranking; Meta describes retrieval, first-stage ranking, second-stage ranking, and final re-ranking; Pinterest describes retrieval, pre-ranking, ranking, and re-ranking.[^youtube-two-stage][^meta-explore][^pinterest-preranking]

ThryftVerse should adopt the pattern proportionally.

### 4.1 Stage 0 — eligibility

Authoritative rules, not ML:

- listing is active and publishable;
- media is approved and available;
- seller/account is eligible;
- user blocks and privacy rules are respected;
- geography, shipping, age, legal, and category constraints pass;
- sold/purchased/excluded inventory is removed;
- policy quarantine always wins over a relevance score.

### 4.2 Stage 1 — multi-source retrieval

Retrieve a union of bounded candidate sets:

| Source | Purpose | Initial implementation |
|---|---|---|
| Recent | fresh inventory and cold start | existing SQL keyset query |
| Following | explicit social intent | existing follow graph |
| Text/hybrid | query and topic relevance | Meilisearch lexical + semantic |
| Visual | image/item similarity | versioned multimodal embeddings |
| Item-to-item | related listings | co-engagement + content embeddings |
| User affinity | long-term taste | category/brand/price aggregates first |
| Session intent | immediate browsing direction | recent sequence features |
| Exploration | new/tail evidence | controlled, logged policy |
| Marketplace modules | looks, posters, moodboards, boards, listings | type-specific candidate owners |

Every candidate carries `source`, `source_rank`, `source_score`, `retrieval_version`, and `retrieval_probability` where meaningful. Dedupe uses listing identity, source entity, media checksum/perceptual hash, and canonical object grouping.

### 4.3 Stage 2 — lightweight ranker

The first learned model should be a CPU-friendly gradient-boosted ranker, not a transformer.

Why:

- the current feature set is structured and small;
- tree models work well on heterogeneous, sparse marketplace data;
- feature effects are inspectable;
- inference is fast and cheap;
- missing values are manageable;
- model and baseline can be compared directly;
- monotonic constraints can be considered for carefully defined features;
- eBay publicly describes using gradient-boosted trees with semantic similarity, context, and personalisation features in a three-stage recommendation engine.[^ebay-bert-ranker]

Recommended first task:

```text
group = recommendation request
candidate = eligible listing
label = graded delayed outcome
objective = LambdaRank or XE-NDCG-MART
```

Example graded labels must be validated, but a starting hypothesis could be:

| Outcome | Illustrative gain |
|---|---:|
| viewable impression with rapid skip | 0 |
| qualified detail view/dwell | 1 |
| share, seller/profile exploration, board save | 2 |
| wishlist, offer, basket, meaningful seller message | 3 |
| completed purchase after attribution window | 4 |

Do not simply use the current `strength` as ground truth. Outcome definitions must be server-verifiable where possible and de-biased for position/exposure.

### 4.4 Stage 3 — heavier ranker, later

Only after sufficient volume and stable Stage 2 operations:

- two-tower retrieval for user/session → item candidates;
- multi-task ranking heads for qualified view, save, message/offer, purchase, and negative feedback;
- sequence encoder for session intent;
- graph embeddings for user–listing–seller–board–look relationships;
- knowledge-graph/entity features for brand/category/style relations.

Do not copy Pinterest’s billion-node graph architecture into an early marketplace. PinSage is evidence that graph learning can work at web scale, not evidence that it is the correct first model for ThryftVerse.[^pinsage]

### 4.5 Stage 4 — constrained re-ranking

This layer owns final feed quality:

- max consecutive same content type;
- seller and category concentration;
- near-duplicate image suppression;
- visual palette/silhouette repetition;
- exploration budget;
- freshness floor;
- trust/policy constraints;
- configurable module slots only when the module is relevant;
- no reordering that breaks pagination stability within a request/session.

The current deterministic caps are a strong seed. Promote them into a versioned re-ranker whose constraint relaxations are logged.

### 4.6 Heterogeneous discovery contract

The backend should return renderable objects without flattening them into equal cards:

```ts
type DiscoveryUnit =
  | { type: 'listing'; listingId: string; mediaAspectRatio: number; decision: DecisionMeta }
  | { type: 'look'; lookId: string; mediaAspectRatio: number; decision: DecisionMeta }
  | { type: 'poster'; posterId: string; mediaAspectRatio: number; decision: DecisionMeta }
  | { type: 'moodboard'; moodboardId: string; mediaAspectRatio: number; decision: DecisionMeta }
  | { type: 'board_module'; boardId: string; previewIds: string[]; decision: DecisionMeta };
```

The ranker decides relevance and composition; the client retains the type-specific visual hierarchy. ML must not force every unit into the same 1:1 card.

---

## 5. Data contract required before training

### 5.1 Canonical event envelope

Create an append-only analytics/decision event table or stream with at least:

```text
event_id                 UUID / sortable unique ID
event_name               versioned enum
schema_version           event contract version
event_time               client/server occurrence time
ingested_at              server receipt time
actor_user_id            pseudonymous internal ID, nullable where legitimate
session_id               bounded opaque ID
request_id               recommendation/search request
impression_id            returned unit instance
listing/content_id       entity ID
content_type             listing/look/poster/moodboard/board
surface                  home/discover/search/similar/profile/etc.
position                 absolute position within response
viewport_position        optional client geometry bucket
viewability_ms           accumulated qualified visibility
candidate_source         retrieval source
retrieval_version        version
policy_version           ranker/re-ranker version
model_version            artifact version or heuristic model name
feature_schema_version   exact online schema
selection_propensity     probability or logged exploration likelihood
experiment_assignments   server-issued assignments
idempotency_key          deduplication
properties               allow-listed, size-bounded JSON
```

Never place free-form private messages, secrets, raw image URLs, precise location, or arbitrary client payloads into training-event metadata.

### 5.2 Event taxonomy

Use semantic, mutually distinguishable events:

```text
decision_served
unit_rendered
unit_viewable
unit_opened
qualified_detail_view
rapid_skip
save
unsave
wishlist
share
follow_seller
unfollow_seller
open_seller_profile
offer_started
offer_submitted
message_seller_started
add_to_basket
checkout_started
purchase_completed
purchase_refunded
not_interested
show_fewer
report_content
search_submitted
search_result_viewable
search_result_opened
filter_changed
visual_search_submitted
import_suggestion_accepted
import_suggestion_corrected
import_suggestion_rejected
moderation_review_decided
fraud_case_outcome
```

Undo and reversal events matter. `unsave`, refund, appeal overturn, and suggestion correction must update labels rather than disappear.

### 5.3 Viewability

A `recommendation_impressions` insert at response time should be renamed or supplemented:

- `recommendation_candidates_served`: server returned it;
- `recommendation_impressions`: client proves it crossed a viewability threshold;
- `recommendation_engagements`: user action attributed to the impression.

Define viewability in product terms, for example a percentage of media visible for a minimum duration, with foreground state and deduplication. Exact values require device testing. This prevents training the system to treat unseen lower-ranked rows as rejected.

### 5.4 Point-in-time correctness

Every training row must obey:

```text
feature_timestamp <= decision_timestamp < label_window_end
```

Examples of leakage to block:

- current seller rating used to train a decision served before those reviews existed;
- “sold” status or final price present in an earlier recommendation feature snapshot;
- future interaction counts included in popularity;
- imported/edited attributes after the recommendation used as if known then;
- refund/chargeback outcome used inside the label observation window incorrectly;
- random time split that lets the same listing/user future bleed into training.

The initial system can build point-in-time datasets using SQL, immutable event tables, and Parquet/object storage. Do not add Feast until multiple models genuinely need shared offline/online features and the team can operate another stateful platform. If adopted later, Feast’s point-in-time join semantics are the relevant capability—not the brand name itself.[^feast-pit]

### 5.5 Consent and retention

Separate:

- operational transaction data;
- product analytics;
- personalisation data;
- safety/fraud evidence;
- model training datasets;
- imported marketplace source data.

Each needs purpose, legal basis, retention, deletion propagation, access class, and export behavior. A user deleting/resetting personalisation must invalidate online features and schedule removal or compliant de-identification from future training corpora; already trained artifacts require a documented deletion/retraining policy.

---

## 6. Multimodal search and media intelligence

### 6.1 Candidate models

Benchmark at least:

- current heuristic baseline;
- CLIP-compatible open checkpoint;
- SigLIP 2 B/16 or B/32 candidate at practical resolution;
- a fashion/domain-tuned retrieval model only if licence, provenance, and maintained implementation are acceptable;
- any managed API only through a redacted/privacy-reviewed evaluation.

CLIP established a shared language–image representation but documented important limitations and bias concerns.[^clip] SigLIP 2 reports improved zero-shot classification, image-text retrieval, multilingual understanding, localisation, and native-aspect-ratio support across released scales.[^siglip2] Those results justify evaluation, not immediate deployment.

### 6.2 ThryftVerse retrieval benchmark

Create a human-labelled set across:

- exact object identity;
- same model/different seller;
- same category, different style;
- silhouette and fit;
- colour, print, material, texture;
- brand/logo where legitimate;
- home-object shape and era;
- watches/jewellery fine detail;
- condition and damage cues;
- background-dominated photography;
- mannequins, flat lays, worn items, collage, screenshots;
- low light, blur, crop, occlusion;
- multilingual text queries;
- “similar but cheaper,” size, condition, and shipping filters;
- protected/sensitive attribute leakage checks.

Metrics:

- Recall@K and NDCG@K;
- exact-category accuracy;
- attribute consistency;
- near-duplicate precision/recall;
- filtered ANN recall versus exact search;
- latency and memory;
- segment parity;
- out-of-domain rejection;
- human preference on task-specific result sets.

### 6.3 Embedding pipeline

```text
approved media asset
  → checksum-addressed embedding job
  → decode/crop policy version
  → encoder artifact + preprocessing version
  → normalised embedding
  → durable embedding row/index
  → exact/ANN evaluation
  → hybrid retrieval
  → learned or deterministic re-rank
```

Suggested schema:

```sql
media_embeddings(
  media_asset_id,
  model_id,
  model_version,
  preprocessing_version,
  checksum_sha256,
  dimensions,
  embedding,
  generated_at,
  quality_flags,
  PRIMARY KEY(media_asset_id, model_id, model_version, preprocessing_version)
)
```

Only approved authoritative media should enter the user-facing retrieval index. Quarantine or deletion must invalidate bindings and index entries.

### 6.4 Index choice

Two proportional options already align with the stack:

**Option A — Meilisearch first.** Configure named text and image embedders, lexical/hybrid/federated queries, and versioned reindexing. This minimises new infrastructure.

**Option B — PostgreSQL + pgvector.** Use exact search first on a small corpus, then HNSW when measurements justify it. pgvector supports HNSW and IVFFlat, hybrid use with PostgreSQL full-text search, and iterative scans that compensate for post-index filtering.[^pgvector]

Recommendation: start with Meilisearch if its multimodal configuration can meet recall, filtering, privacy, and operational requirements. Use pgvector when embeddings must live transactionally beside authoritative entity state or when search evaluation reveals limitations. Do not operate both without a clear ownership split.

### 6.5 Advanced media intelligence

Useful backend assistance:

- blur/exposure/resolution/occlusion quality checks;
- duplicate and near-duplicate media detection;
- subject saliency and suggested crop focal point;
- background segmentation for optional seller-controlled cleanup;
- image ordering recommendations;
- policy/OCR cues for contact details, counterfeit signals, or prohibited material;
- keyframe extraction for video search/moderation;
- perceptual hashes and embedding drift checks.

User-visible rules:

- original media remains recoverable;
- auto-crop is a preview/suggestion, never destructive;
- generated or materially altered imagery is disclosed where required;
- background removal/extension cannot make condition or included accessories misleading;
- image-quality assistance never invents item detail.

---

## 7. Catalogue import intelligence

### 7.1 The correct role

The concierge promise is “we build the first draft; you verify.” ML should reduce seller effort while increasing structured-data quality. The model is a junior catalogue assistant, not the source of truth.

### 7.2 Field-level proposal contract

```ts
type FieldSuggestion = {
  fieldName: CanonicalField;
  sourceValue: unknown;
  suggestedValue: unknown;
  modelId: string;
  modelVersion: string;
  promptVersion?: string;
  taxonomyVersion: string;
  confidenceBand: 'high' | 'medium' | 'low';
  evidence: Array<{ type: 'source_text' | 'image' | 'taxonomy' | 'comparable'; ref: string }>;
  reasonCode: string;
  requiresSellerConfirmation: boolean;
};
```

Never make a product decision from a floating-point confidence alone. Confidence bands are derived from calibrated, field-specific validation thresholds.

### 7.3 Suggested implementation sequence

1. **Deterministic maps remain champion.** Measure unresolved and corrected fields by source.
2. **Text classification shadow.** Propose taxonomy leaves from title/description/source category.
3. **Entity normalisation.** Match brands and categories through canonical dictionaries and fuzzy/embedding retrieval.
4. **Multimodal attribute extraction.** Propose colour/material/pattern only where image/text evidence agrees.
5. **Learned duplicate candidate score.** Combine exact identities, hashes, text embeddings, image embeddings, brand/size/price—but never auto-merge.
6. **Title/description assistance.** Constrained structured generation from verified facts, with diff review and prohibited-claim filters.
7. **Active learning.** Prioritise uncertain/high-impact fields and diverse examples for operator annotation; do not simply sample the lowest score.

### 7.4 Acceptance metrics

- seller minutes per 40-item import;
- items ready without correction;
- per-field acceptance and correction rates;
- critical hallucination rate;
- condition overstatement rate, target effectively zero;
- price/currency mutation errors, target zero;
- duplicate review precision/recall;
- operator minutes per batch;
- source/category/language slice parity;
- seller abandonment and time-to-first-publish;
- rollback/appeal frequency.

An 85% accepted category suggestion with a 2% condition-overstatement rate is not acceptable merely because its average looks good. Critical fields require separate gates.

---

## 8. Pricing, auction, fraud, and moderation boundaries

### 8.1 Risk tiers

| Tier | Examples | Automation ceiling |
|---|---|---|
| Low | feed ranking, similar items, crop suggestion | automated with rollback and controls |
| Medium | catalogue attributes, duplicate suggestion, moderation triage, price range | human confirmation/review for material outcomes |
| High | fraud restriction, reserve/escrow, auction integrity, KYC/AML, payout, account enforcement | model may provide evidence/priority only; authoritative policy and accountable review own action |

### 8.2 Price intelligence

Target response:

```json
{
  "estimate": {
    "lowGbp": 68,
    "midGbp": 76,
    "highGbp": 86,
    "coverage": 0.8,
    "method": "comparable_quantile_v1"
  },
  "evidence": {
    "comparableCount": 24,
    "category": "...",
    "conditionMatched": true,
    "marketWindowDays": 90
  },
  "warnings": ["Sparse exact-size comparables"],
  "requiresHumanReview": true
}
```

Use quantile or conformal intervals and evaluate empirical coverage by category and price band. The interval is not decoration; it communicates market uncertainty. Models that are well calibrated in-distribution can become miscalibrated under dataset shift, so calibration and drift are production metrics.[^google-uncertainty]

### 8.3 Auction intelligence

Safe uses:

- detect bid velocity/account/device anomalies;
- retrieve comparable auction histories;
- forecast clearance probability and suggested reserve range;
- prioritise suspicious auctions for review;
- detect collusive graphs in offline investigation;
- generate operator summaries from factual event timelines.

Unsafe uses:

- bidder-specific urgency manipulation;
- raising reserves or extending time based on inferred willingness to pay;
- opaque automatic bid cancellation;
- price steering that exploits protected or sensitive profiles;
- using current bidders’ private actions to personalise another bidder’s price.

### 8.4 Fraud correction before ML

Replace the semantic lie:

```ts
{ riskScore: 0, riskLevel: 'low', action: 'allow' }
```

on infrastructure failure with:

```ts
{
  evaluationStatus: 'unavailable',
  riskScore: null,
  riskLevel: 'unknown',
  policyAction: 'allow_low_risk_flow' | 'step_up' | 'hold_for_review',
  reasonCode: 'fraud_service_unavailable'
}
```

The policy action depends on the event type. Browsing or ordinary messaging may continue; a high-value payout or ownership transfer may require step-up or an explicit hold. Unknown is not low risk.

### 8.5 Moderation learning loop

Add durable tables for:

- provider inference with taxonomy/model version;
- automated decision;
- review assignment;
- reviewer decision and reason;
- appeal and appeal outcome;
- policy version;
- sampled quality-control cases;
- media/content checksum;
- timestamps and actor IDs;
- disagreement and resolution.

Measure:

- precision/recall by policy class;
- high-severity false-negative rate;
- false-positive and appeal-overturn rate;
- reviewer disagreement;
- queue age;
- provider failure/fallback rate;
- category, language, skin-tone/context, and image-quality slices where appropriate and lawfully evaluated;
- drift after provider/model updates.

Do not train directly on unreviewed provider outputs as ground truth. That only teaches the next model to reproduce the current provider.

---

## 9. MLOps architecture

### 9.1 Proportional target

```text
Mobile clients
  → authenticated API
  → authoritative writes + append-only decision/product events
  → transactional outbox
  → BullMQ workers
      → object storage (partitioned Parquet training snapshots)
      → feature materialisation
      → embedding generation
      → moderation/import review queues

Training job
  → point-in-time dataset manifest
  → baseline + challenger training
  → offline/segment/safety evaluation
  → signed artifact + model card
  → registry candidate alias

Decision service
  → champion + shadow challenger
  → score/rerank
  → prediction and latency telemetry
  → API attribution

Experiment controller
  → deterministic assignment
  → limited exposure
  → guardrails + sequential decision rules
  → promote / rollback
```

Use the existing Postgres, outbox, BullMQ, Redis, S3-compatible storage, FastAPI service, and CI before adding a streaming platform.

### 9.2 Model registry

The current `decision_policy_versions` table is a good policy registry but not a complete artifact registry. Extend or pair it with:

```text
model_id
model_version
task
owner
criticality
artifact_uri
artifact_sha256
container_digest
training_code_commit
training_dataset_manifest
feature_schema_version
preprocessing_version
framework/runtime versions
evaluation_report_uri
model_card_uri
approval actor/time
status / aliases
rollback_model_version
retention/deletion metadata
```

Meta’s 2025 account of scaling Instagram ranking emphasises a model registry as the source of truth for business function and criticality, automated launch tooling, and predictive-health SLOs—not just service uptime.[^meta-1000-models] MLflow’s current registry supports model versions, aliases, tags, signatures, and environment-oriented promotion workflows, making it a reasonable later adoption if operating it is justified.[^mlflow-registry]

Recommendation:

- Phase 1: extend the existing Postgres policy registry and use signed object-store artifacts;
- Phase 2: adopt MLflow when experiment/artifact volume makes the home-grown registry costly;
- never deploy a mutable `latest` URI;
- load a pinned digest at process start and report it on health/decision responses.

### 9.3 Training orchestration

Do not begin with Airflow/Kubeflow by default. A versioned Python CLI run from CI/scheduled workers can initially:

1. resolve an immutable dataset time window;
2. materialise a manifest and checksums;
3. run leakage/schema checks;
4. train seeded models;
5. evaluate champion and challenger;
6. generate a model card and metrics JSON;
7. upload artifacts;
8. register candidate;
9. require approval for shadow deployment.

Move to a workflow orchestrator only when backfills, dependencies, retries, compute scheduling, and multiple pipelines exceed this model.

### 9.4 Serving

For the first ranker:

- keep FastAPI;
- load the artifact once at startup;
- validate feature schema exactly;
- bound request sizes;
- expose readiness only after artifact validation;
- return model, feature, preprocessing, and policy versions;
- keep deterministic baseline in process or as immediate fallback;
- shadow asynchronously where possible without extending user latency;
- never log raw feature vectors containing personal data;
- record score distribution, calibration aggregates, missing-feature rates, and latency by version.

For embeddings:

- batch/offline inference first;
- CPU or modest GPU worker based on measured throughput;
- export to ONNX only after numerical-parity tests;
- benchmark quantisation on retrieval quality, not only latency;
- use ONNX Runtime mobile only for privacy/latency use cases that truly benefit from device inference. Its own guidance requires measuring binary/model size, latency, power, and device-specific execution providers.[^onnx-mobile]

### 9.5 Observability

Service SLOs:

- availability and timeout rate;
- p50/p95/p99 latency;
- fallback/circuit-open rate;
- candidate count and feature missingness;
- cache hit rate by surface;
- artifact load/hash failures;
- queue delay and embedding freshness.

Prediction SLOs:

- calibration and normalised entropy/log loss for action heads;
- score distribution/drift;
- top-K overlap/stability against champion;
- retrieval recall against exact or labelled truth;
- cold-start and sparse-segment quality;
- seller/category concentration;
- catalogue and new-item coverage;
- negative-feedback rate;
- long-session/revisit guardrails;
- safety/moderation false negatives and appeal reversals.

Reliability is not HTTP 200. A ranker can be available while returning irrelevant or collapsed results. Meta explicitly describes prediction calibration and normalised entropy as model-stability inputs for this reason.[^meta-1000-models]

---

## 10. Evaluation and experimentation

### 10.1 Offline dataset

Build rolling time splits:

```text
train:       T0 → T1
validation:  T1 → T2
test:        T2 → T3
label close: T3 + maximum outcome window
```

Keep users/listings grouped where leakage requires it. Include explicit slices:

- brand-new users;
- users with 1–2, 3–10, 11–100, and 100+ meaningful actions;
- new listings and new sellers;
- sparse categories;
- high/low price bands;
- media missing/low quality;
- regions/languages;
- content type and surface;
- returning-after-inactivity;
- exploration candidates;
- imported versus native listings.

### 10.2 Metrics

Relevance:

- NDCG@K;
- Recall@K;
- MRR where a first relevant result is meaningful;
- log loss/AUC for calibrated action heads;
- expected calibration error and reliability plots.

Marketplace/system:

- unique catalogue coverage;
- new-item exposure;
- seller exposure Gini/HHI or concentration;
- category/style entropy;
- intra-list visual similarity;
- exploration yield;
- stale/sold/quarantined leakage, target zero;
- p95/p99 inference latency and fallback rate.

User/product:

- qualified detail views, saves, messages/offers, purchases;
- `not_interested` and rapid-skip rate;
- session depth without compulsive repetition;
- return/revisit at 7/28 days;
- search reformulation and zero-result rate;
- time to first seller success;
- buyer dispute/refund guardrails.

### 10.3 Bias correction

Historical implicit feedback is policy-biased. Items at the top are more likely to be seen and clicked. Google reports production use of propensity-based correction across ranking contexts, and research shows even non-click assumptions require care.[^google-propensity][^google-prs]

Required controls:

- qualified viewability rather than response-time “impression”;
- logged exploration probability/propensity;
- inverse propensity or doubly robust evaluation where assumptions hold;
- clipping and effective-sample-size reporting;
- randomised or interleaved traffic only within a safe exposure budget;
- separate organic relevance from paid/business re-ranking;
- preserve deterministic holdouts to detect long-term feedback loops.

### 10.4 Shadow and online stages

```text
offline candidate
  → replay evaluation
  → production shadow (0% decisions)
  → prediction parity/drift/latency gate
  → 1% experiment
  → 5% / 10% / 25% with guardrails
  → majority champion
  → long-lived holdout
```

Automatic rollback triggers should include:

- integrity/schema mismatch;
- fallback or timeout breach;
- calibration instability;
- sold/quarantined eligibility leak;
- negative-feedback spike;
- seller/category concentration breach;
- purchase/dispute/refund guardrail breach;
- segment regression even when global averages improve.

### 10.5 LLM evaluation is supplementary

LLM judges can help label search intent, explanation quality, or catalogue-description consistency, but they do not replace users or domain review. Spotify’s 2026 engineering account warns that offline LLM judges need calibration to online outcomes, and its August 2026 study found raw LLM predictions recovered only part of observed human treatment effects in its test setting.[^spotify-eval-funnel][^spotify-llm-ab]

Use LLMs to reduce annotation cost, then measure judge agreement, drift, and subgroup error against human-labelled gold sets.

---

## 11. Privacy, law, and security as of August 2026

This section is engineering guidance, not legal advice. Product counsel/DPO review remains required.

### 11.1 Recommendation transparency

The EU Digital Services Act requires online platforms using recommender systems to explain the main parameters and user options in plain language; where several recommender options exist, the selection functionality must be directly and easily accessible in the relevant interface.[^dsa]

Engineering consequences:

- version plain-language parameter descriptions with policy releases;
- make “Why this” faithful to recorded reason codes;
- provide accessible preference controls;
- retain a non-profiled/recency option where applicable;
- log which recommendation option was active;
- never use special-category personal data for ad targeting and avoid inferring it for organic ranking without an exceptional, reviewed purpose.

### 11.2 UK data protection

The ICO’s automated-decision and profiling guidance is being updated following the Data (Use and Access) Act 2025; its March–May 2026 consultation is closed and final guidance is scheduled for winter 2026.[^ico-adm] This moving guidance increases the need for a data-protection impact assessment, purpose limitation, meaningful human intervention on material decisions, and a reviewable model/data inventory.

### 11.3 EU AI Act

From 2 August 2026, enforcement powers and new transparency requirements apply for certain AI systems, including disclosure for chatbot interaction and labelling/machine-readable marking for specified generated or altered content.[^eu-ai-enforcement] ThryftVerse’s relevance ranking will often be low/minimal risk, but generative catalogue/media features, profiling, fraud/enforcement uses, and third-party general-purpose models require use-case-specific classification and documentation.

Do not respond with AI labels on every recommendation card. Apply disclosure where the user is interacting with an AI system or content has been materially generated/altered under the applicable rule.

### 11.4 AI risk and security

Adopt NIST AI RMF’s govern/map/measure/manage structure and maintain a use-case risk register.[^nist-airmf] NIST’s 2025 adversarial-ML taxonomy covers poisoning, evasion, privacy, and misuse attacks across predictive and generative systems.[^nist-aml]

Threats relevant to ThryftVerse:

- sellers manufacture clicks/saves to manipulate ranking;
- coordinated accounts poison price or fraud labels;
- adversarial images evade moderation or visual duplicate detection;
- prompt injection in imported descriptions or OCR text affects an LLM workflow;
- model extraction through repeated search/recommendation queries;
- membership/property inference from personalised output;
- embedding poisoning via malicious media/text;
- dependency/model artifact substitution;
- training data leakage into generated copy;
- denial of service through oversized image/model requests.

Controls:

- signed artifacts and locked dependencies;
- allow-listed, typed feature/event schemas;
- server-verified outcome labels;
- robust rate limiting and bounded payloads;
- data/source reputation and anomaly checks;
- quarantine before indexing;
- no direct tool/action access for generative models;
- red-team evaluation by modality;
- canary and rollback;
- secret/PII scanning;
- separate training, registry, and serving permissions;
- immutable audit trails for high-risk actions.

---

## 12. Stack decisions

### 12.1 Adopt now

| Capability | Choice | Reason |
|---|---|---|
| First trained ranker | LightGBM LambdaRank or XE-NDCG-MART | Fast CPU inference, structured features, strong baseline, inspectable |
| Dataset format | Partitioned Parquet + immutable manifest in object storage | Reproducible, portable, efficient |
| Event source | Postgres append-only table + transactional outbox + BullMQ export | Matches current scale and infrastructure |
| Serving | Existing FastAPI service | Already isolated, versioned, health-checked, and integrated |
| Registry v1 | Extend Postgres policy/artifact metadata + signed S3 artifact | Lowest operational cost |
| Search | Meilisearch lexical/hybrid pilot | Existing adapter and deployed service |
| Embeddings | Offline Python worker; benchmark SigLIP 2/CLIP candidates | No synchronous media decode; model-agnostic evaluation |
| Experiment assignment | Server-side deterministic hashing with persisted config | Reproducible and hard to spoof |
| Observability | Existing metrics/logging plus model-specific aggregates | Avoid a parallel telemetry universe |

LightGBM’s current documentation supports both `lambdarank` and `rank_xendcg`; the latter is documented as faster with similar performance, so both should be benchmarked rather than chosen by fashion.[^lightgbm-ranking]

### 12.2 Defer until justified

| Technology | Defer because |
|---|---|
| Feast | One trained model does not yet justify online/offline feature-store operations |
| Kafka/Pulsar | Postgres outbox/BullMQ can provide durable early-stage capture/export |
| Airflow/Dagster/Kubeflow | A versioned scheduled CLI is sufficient for the first pipeline |
| KServe/Seldon/Ray Serve | One FastAPI decision service already owns inference |
| Dedicated vector DB | Meilisearch or pgvector can cover initial evaluated needs |
| GPU online ranker | The first learned ranker should meet CPU latency budgets |
| Graph neural recommender | Interaction graph scale and lift are not yet established |
| Large generative model in request path | Cost, latency, unpredictability, and weak necessity |
| On-device general ML runtime | Add only for measured privacy/latency wins |

### 12.3 Remove or rename misleading abstractions

- rename product-facing “conversational search” until it is genuinely semantic/conversational;
- do not call `semanticSearch` successful when the embedder is unconfigured—return capability metadata and emit an alert;
- remove or implement the Elasticsearch placeholder rather than keeping a future adapter that silently behaves as in-memory search;
- rename response-time recommendation rows to served candidates if viewability is not proven;
- represent fraud-check failure as unknown;
- propagate `trained_model` from the decision response instead of hardcoding false when the contract expands.

---

## 13. Prioritised implementation programme

### Phase 0 — truth and containment (0–4 weeks)

**P0.1 Correct semantic defects**

- add `unknown/unavailable` fraud evaluation status;
- define event-type-specific failure policies;
- change recommendation cache key to include user, surface, policy/contract, and relevant session-intent epoch;
- propagate trained-model capability truth end to end;
- distinguish served, rendered, and viewable recommendation rows;
- stop treating capped Redis analytics as a training source;
- add capability metadata to search/visual results.

**P0.2 Freeze authoritative boundaries**

- document that payments, KYC/AML, auction ordering, settlement, escrow, and account restriction remain non-ML authorities;
- require human confirmation for importer facts, duplicate resolution, and pricing advice;
- prohibit unreviewed generated copy/media publication.

**Exit gate:** no failure returns a fabricated low-risk/AI/success state; every intelligence surface declares its true method/version.

### Phase 1 — learning data foundation (2–8 weeks)

- migration for canonical decision/product events;
- client viewability contract with idempotency;
- candidate-source and propensity fields;
- durable negative feedback;
- event validation and privacy allow-list;
- partitioned export to object storage;
- deletion/retention propagation;
- point-in-time dataset builder;
- dataset manifest and leakage tests;
- representative evaluation sample and annotation protocol.

**Exit gate:** a served request can be reconstructed from eligible candidates through actual viewability and delayed outcomes without future-data leakage.

### Phase 2 — ranking challenger (6–12 weeks)

- implement LightGBM training/evaluation CLI;
- compare LambdaRank/XE-NDCG-MART with heuristic champion;
- calibrate outcome heads or score interpretation as needed;
- add model artifact table/signature/digest;
- load pinned challenger in decision service;
- shadow on real traffic;
- dashboards for latency, feature missingness, score drift, calibration, cold start, coverage, and concentration;
- limited experiment and rollback.

**Exit gate:** challenger wins predeclared relevance and user-value metrics without safety, latency, concentration, or segment regression.

### Phase 3 — multimodal retrieval and heterogeneous discovery (8–16 weeks)

- build ThryftVerse visual/text retrieval benchmark;
- add versioned media embedding worker/schema;
- benchmark encoder and index options;
- configure lexical/semantic/image retrieval sources;
- build hybrid fusion and exact/ANN recall gate;
- add near-duplicate suppression;
- return heterogeneous discovery units;
- implement constrained final-list composition;
- expose faithful “Why this” and user controls.

**Exit gate:** visual/hybrid retrieval beats the heuristic and lexical baselines on human-labelled tasks, with measured latency and no policy-media leakage.

### Phase 4 — importer assistance (8–20 weeks, can overlap Phase 3)

- source/category-labelled field dataset;
- category/brand/attribute suggestion models;
- structured suggestion contract and review UI;
- per-field correction events;
- learned duplicate candidate shadow score;
- active-learning operator queue;
- constrained description/title assistance with factual validation.

**Exit gate:** materially lower seller/operator time with critical hallucination and condition/price/currency error gates satisfied.

### Phase 5 — calibrated trust and commerce support (12–28 weeks)

- durable fraud/moderation case outcomes and appeals;
- price comparable dataset with temporal splits;
- quantile/conformal interval evaluation;
- shadow fraud/risk prioritisation model;
- moderation provider calibration and sampled human QA;
- auction anomaly detection in operator-only mode;
- fairness, attack, and drift evaluation.

**Exit gate:** models improve review efficiency or advice quality without autonomously owning irreversible outcomes.

### Phase 6 — advanced models only after evidence

- two-tower learned retrieval;
- multi-task ranker;
- session transformer;
- graph/item embeddings;
- continual or frequent retraining;
- dedicated feature store or streaming platform;
- model distillation and specialised serving.

**Entry gate:** Stage 2–5 systems are stable, interaction volume supports the model, latency/cost budgets are measured, and a simpler model cannot achieve the desired lift.

---

## 14. Detailed backlog by repository area

### `backend/api/src/routes/recommendations.ts`

- split candidate retrieval, feature hydration, decision call, attribution, and response projection into owned modules;
- include `surface` and intent epoch in the cache key;
- record served candidates separately from client-qualified impressions;
- include candidate source/retrieval rank/version;
- propagate capability/trained status instead of hardcoding;
- add negative and qualified engagement events;
- add propensity/exploration selection data;
- queue durable analytics writes rather than Redis-only storage;
- avoid serialising full text when precomputed features suffice;
- make `recordServe` non-destructive to response availability while retaining an integrity alert/retry path.

### `backend/ml-service/`

- add model-loader interface with heuristic and learned implementations;
- pin artifact digest and feature schema;
- preserve deterministic v2 fallback;
- add batch scoring/vectorised feature matrix;
- add challenger shadow endpoint or internal dual-score mode;
- add calibration and prediction-stability metrics;
- add training/evaluation scripts and data manifests;
- expand evaluation beyond handcrafted cases;
- keep classification 501 until artifact/eval/monitoring are real.

### `backend/api/src/routes/feed.ts`

- define heterogeneous candidate objects and source lineage;
- stop treating chronology and event velocity as the whole home/discover decision;
- keep following/chronological as explicit selectable policies;
- add stable request/session pagination;
- move final diversity/type constraints server-side;
- preserve media aspect ratio and type-specific render metadata.

### Search files

- verify Meilisearch production settings and index sync health;
- add query/result/viewability/action evaluation;
- version embedder configuration and indexed vectors;
- return method and fallback reason;
- test hybrid fusion ratios per query class;
- add exact facet semantics after semantic retrieval;
- rename conversational route/product until capability changes;
- never generate unsupported filter values from an LLM.

### Visual-search files

- retain the heuristic as baseline/fallback;
- move feature generation to media-processing jobs;
- bind features/embeddings to asset checksum and model/preprocess version;
- add persisted query embedding/request outcome records with consent/retention;
- benchmark domain slices;
- implement ANN/hybrid retrieval;
- do not return raw internal model confidence as consumer certainty.

### Catalogue-import files

- wire `ai_suggestion` provenance only through a typed suggestion service;
- preserve source fact and deterministic mapping separately;
- store model/prompt/taxonomy versions;
- emit per-field review outcomes;
- use shadow suggestion before showing sellers;
- never auto-upgrade condition, convert price, or merge duplicates;
- evaluate by source and category;
- keep disabled connectors disabled until legal/API capability gates are real.

### Fraud/risk files

- add evaluation status distinct from risk;
- move durable cases/audit from expiring Redis to Postgres while retaining Redis for velocity;
- make high-risk failure policy explicit by event type;
- store investigator/chargeback/appeal outcomes;
- rotate/minimise device fingerprints and document retention;
- calibrate thresholds before trained model use;
- keep rule IDs available to reviewers, not as accusatory consumer copy.

### Moderation files

- queue/idempotently trigger provider calls;
- persist provider/model/taxonomy versions and raw response in controlled storage;
- persist review/appeal decisions;
- add video/keyframe pipeline;
- sampled human QA across confidence bands;
- provider-update shadow comparison;
- user-facing reasons mapped to policy language, not vendor labels.

---

## 15. Acceptance scorecard

No ML capability is flagship-ready until all applicable columns pass.

| Dimension | Required evidence |
|---|---|
| Truth | UI/API identifies heuristic, learned, fallback, unavailable, and unknown states accurately |
| Data | point-in-time lineage, consent/purpose, deletion, retention, schema checks |
| Relevance | predeclared offline and online lift against champion |
| Calibration | reliability by segment and under recent shift |
| Marketplace health | coverage, diversity, concentration, new-item/seller exposure |
| Safety | policy leakage zero; moderation/fraud critical error gates |
| Fairness | defined cohorts/slices, justified metrics, mitigation and review |
| Security | artifact integrity, rate limits, poisoning/evasion/privacy assessment |
| Reliability | latency, fallback, circuit, load, queue freshness, rollback |
| Explainability | reason is faithful and useful to its audience |
| Agency | negative feedback, undo, preference/reset, alternate policy as applicable |
| Accessibility | controls and explanations are screen-reader/large-text usable |
| Cost | inference/training/index cost measured per useful outcome |
| Operations | owner, criticality, runbook, on-call alert, incident and rollback path |

### Recommendation promotion gate

Suggested minimum—not universal numeric targets:

- zero ineligible/sold/quarantined results in contract tests and sampled production audit;
- no global or critical-segment regression versus champion;
- p95 latency within the API’s allocated budget, not merely below the current 2.5-second timeout;
- fallback and circuit-open rates below an agreed SLO;
- calibrated action probabilities within segment thresholds;
- seller/category concentration no worse than champion and within product limits;
- new-item/catalogue coverage target met;
- negative feedback and long-term guardrails non-inferior;
- deterministic rollback demonstrated;
- model/data/code/artifact lineage reproducible.

### Importer suggestion gate

- seller can inspect source versus suggestion;
- all suggestions are reversible;
- critical-fact hallucination gate passes;
- condition is never silently upgraded;
- price/currency is never silently mutated;
- field correction is durably attributed;
- model unavailable path returns deterministic mapping/review, not fabricated completion;
- source data retention and deletion deadlines remain enforced.

### Fraud/moderation gate

- unknown is never low-risk/approved;
- irreversible action has authoritative policy and accountable review;
- appeal/correction data exists;
- false-positive/negative metrics are measured by relevant slice;
- provider/model updates are versioned and shadowed;
- audit evidence outlives ephemeral Redis as policy requires;
- adversarial and abuse cases are tested.

---

## 16. Decisions that should not be made yet

The following would be premature:

1. Choosing a deep recommender before trustworthy exposure/outcome data exists.
2. Adding a vector database without benchmarking existing Meilisearch or pgvector options.
3. Adding an LLM to “conversational search” before typed filter parsing and hybrid retrieval are evaluated.
4. Using VLM-generated descriptions as publishable seller facts.
5. Automating price, reserve, payout, fraud restriction, or auction enforcement.
6. Training moderation on provider labels without human-reviewed truth.
7. Calling response rows impressions when the client never proved viewability.
8. Optimising only CTR, saves, or gross merchandise value.
9. adopting a feature store, streaming platform, orchestration cluster, or GPU fleet to signal seriousness.
10. showing AI badges, percentages, and chat surfaces as visual proof of intelligence.

---

## 17. Final architecture judgment

The repository is closer to a credible ML platform than the rendered product quality may suggest, because it has already adopted several correct primitives: a bounded decision service, truthful capability labels, versioned policy contracts, deterministic fallback, serve attribution, human-review boundaries, importer provenance, and transactional/outbox foundations.

Its immediate risk is the opposite of being “not advanced enough”: it could add sophisticated models before the evidence system is strong enough to know whether they help.

The flagship path is disciplined:

1. fix semantic truth defects;
2. make exposures and outcomes durable and reconstructable;
3. train the simplest serious challenger;
4. shadow and measure it;
5. add multimodal retrieval to solve a real visual-discovery gap;
6. compose heterogeneous feeds with constrained re-ranking;
7. use catalogue provenance to deliver high-value human-in-the-loop assistance;
8. treat pricing, fraud, moderation, and auctions as calibrated decision-support domains with accountable authority;
9. expose intelligence as relevance, control, clarity, and recovery—not decorative AI theatre.

If executed in that order, ThryftVerse can build a backend that supports Pinterest-class discovery principles, Instagram-class ranking operations, eBay-class marketplace semantics, and Snapchat-class media responsiveness without copying their surfaces or pretending to have their scale.

---

## 18. Primary research sources

[^meta-1000-models]: Meta Engineering, [Journey to 1000 models: Scaling Instagram’s recommendation system](https://engineering.fb.com/2025/05/21/production-engineering/journey-to-1000-models-scaling-instagrams-recommendation-system/), 21 May 2025.

[^meta-explore]: Meta Engineering, [Scaling the Instagram Explore recommendations system](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/), 9 August 2023.

[^pinterest-moo-2026]: Pinterest Engineering, [Evolution of Multi-Objective Optimization at Pinterest Home Feed](https://medium.com/pinterest-engineering/evolution-of-multi-objective-optimization-at-pinterest-home-feed-06657e33cd10), 7 April 2026.

[^pinterest-modules]: Pinterest Engineering, [Module Relevance on Homefeed](https://medium.com/pinterest-engineering/module-relevance-on-homefeed-ae76f8b545b2), 19 March 2025.

[^pinterest-preranking]: Pinterest Engineering, [Modernizing Home Feed Pre-Ranking Stage](https://medium.com/pinterest-engineering/modernizing-home-feed-pre-ranking-stage-e636c9cdc36b), 29 May 2025.

[^youtube-two-stage]: Covington, Adams, and Sargin, [Deep Neural Networks for YouTube Recommendations](https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/), RecSys 2016.

[^pinsage]: Ying et al., [Graph Convolutional Neural Networks for Web-Scale Recommender Systems](https://arxiv.org/abs/1806.01973), KDD 2018.

[^google-propensity]: Qin et al., [Attribute-based Propensity for Unbiased Learning in Recommender Systems](https://research.google/pubs/attribute-based-propensity-for-unbiased-learning-in-recommender-systems-algorithm-and-case-studies/), KDD 2020.

[^google-prs]: Wang et al., [Non-Clicks Mean Irrelevant? Propensity Ratio Scoring As a Correction](https://research.google/pubs/non-clicks-mean-irrelevant-propensity-ratio-scoring-as-a-correction/), WSDM 2021.

[^clip]: OpenAI, [CLIP: Connecting text and images](https://openai.com/index/clip/), 5 January 2021.

[^siglip2]: Tschannen et al., [SigLIP 2: Multilingual Vision-Language Encoders with Improved Semantic Understanding, Localization, and Dense Features](https://arxiv.org/abs/2502.14786), 2025.

[^meili-multiple-embedders]: Meilisearch, [Multiple embedders](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/multiple_embedders), accessed 24 August 2026.

[^pgvector]: pgvector, [Official README: exact/approximate and hybrid vector search](https://github.com/pgvector/pgvector/blob/master/README.md), accessed 24 August 2026.

[^lightgbm-ranking]: LightGBM, [Parameters: LambdaRank and XE-NDCG-MART objectives](https://lightgbm.readthedocs.io/en/stable/Parameters.html#objective), accessed 24 August 2026.

[^mlflow-registry]: MLflow, [Model Registry Workflows](https://mlflow.org/docs/latest/ml/model-registry/workflow), accessed 24 August 2026.

[^feast-pit]: Feast, [Point-in-time joins](https://docs.feast.dev/getting-started/concepts/point-in-time-joins), accessed 24 August 2026.

[^onnx-mobile]: ONNX Runtime, [Deploy on mobile](https://onnxruntime.ai/docs/tutorials/mobile/), accessed 24 August 2026.

[^ebay-bert-ranker]: eBay, [How eBay Created a Language Model With Three Billion Item Titles](https://innovation.ebayinc.com/stories/how-ebay-created-a-language-model-with-three-billion-item-titles/), 2023.

[^ebay-ad-rate]: eBay, [Customized Ad-Rate Recommendations Now Available for Promoted Listings](https://innovation.ebayinc.com/stories/customized-ad-rate-recommendations-now-available-for-promoted-listings-on-ebay/), 2020.

[^google-uncertainty]: Google Research, [Can You Trust Your Model’s Uncertainty?](https://research.google/blog/can-you-trust-your-models-uncertainty/), 15 January 2020.

[^aws-moderation]: Amazon Web Services, [Moderating content with Amazon Rekognition](https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html), accessed 24 August 2026.

[^nist-explainability]: NIST, [Psychological Foundations of Explainability and Interpretability in Artificial Intelligence](https://www.nist.gov/publications/psychological-foundations-explainability-and-interpretability-artificial-intelligence), NISTIR 8367, 2021.

[^algorithm-control]: Dietvorst, Simmons, and Massey, [Overcoming Algorithm Aversion: People Will Use Imperfect Algorithms If They Can (Even Slightly) Modify Them](https://faculty.wharton.upenn.edu/wp-content/uploads/2016/08/Dietvorst-Simmons-Massey-2018.pdf), Management Science, 2018.

[^dsa]: European Union, [Regulation (EU) 2022/2065 — Digital Services Act, Article 27](https://eur-lex.europa.eu/eli/reg/2022/2065), current consolidated access 24 August 2026.

[^ico-adm]: UK Information Commissioner’s Office, [Consultation on draft guidance about automated decision-making, including profiling](https://ico.org.uk/about-the-ico/ico-and-stakeholder-consultations/2026/03/ico-consultation-on-the-draft-guidance-about-automated-decision-making-including-profiling/), 2026.

[^eu-ai-enforcement]: European Commission, [Commission starts enforcing AI Act rules and new transparency requirements on 2 August](https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august), 31 July 2026.

[^nist-airmf]: NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), current access 24 August 2026.

[^nist-aml]: NIST, [Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations](https://www.nist.gov/publications/adversarial-machine-learning-taxonomy-and-terminology-attacks-and-mitigations-0), NIST AI 100-2e2025, 2025.

[^spotify-eval-funnel]: Spotify Engineering, [Better Experiments with LLM Evals — A funnel, not a fork](https://engineering.atspotify.com/2026/5/better-experiments-with-llm-evals-a-funnel-not-a-fork), 18 May 2026.

[^spotify-llm-ab]: Spotify Engineering, [When Can LLMs Replace Humans in A/B Tests?](https://engineering.atspotify.com/2026/8/when-can-llms-replace-humans-in-a-b-tests), August 2026.

---

## 19. Repository evidence index

| Area | Canonical evidence |
|---|---|
| Decision-service truth and promotion gates | `backend/ml-service/README.md` |
| Ranking algorithm | `backend/ml-service/app/ranking.py` |
| Inference contract | `backend/ml-service/app/schemas.py`, `backend/ml-service/app/main.py` |
| Baseline evaluation | `backend/ml-service/evaluation/recommendation_baseline_v2.json`, `backend/ml-service/app/evaluation.py` |
| API serving/feedback | `backend/api/src/routes/recommendations.ts` |
| Policy/serve/impression schema | `backend/api/src/db/migrations/077_decision_system_observability.sql` |
| Personalisation preferences | `backend/api/src/db/migrations/105_user_personalisation.sql` |
| Home/trending/following feeds | `backend/api/src/routes/feed.ts` |
| Related-product heuristic | `backend/api/src/lib/productRecommendationPolicy.ts` |
| Search abstraction | `backend/api/src/lib/searchAdapter.ts`, `backend/api/src/lib/vectorSearch.ts` |
| Search routes/config/sync | `backend/api/src/routes/search.ts`, `backend/api/src/routes/searchExtended.ts`, `backend/api/src/lib/meilisearchConfig.ts`, `backend/api/src/lib/searchSync.ts` |
| Conversational parser | `backend/api/src/routes/conversationalSearch.ts` |
| Visual heuristic | `backend/api/src/lib/visualSimilarity.ts`, `backend/api/src/routes/visualSearch.ts` |
| Visual request telemetry | `backend/api/src/db/migrations/032_visual_search_requests.sql` |
| Catalogue import domain | `backend/api/src/domain/catalogImports/`, `backend/api/src/routes/catalogImports.ts` |
| Connector capability gates | `backend/api/src/integrations/catalogSources/` |
| Import normalisation | `backend/api/src/workers/handlers/catalogImportNormalisationHandler.ts` |
| Import provenance | `backend/api/src/db/migrations/137_catalog_import_foundation.sql`, `138_catalog_import_provenance.sql`, `139_catalog_import_publication.sql` |
| Duplicate detection | `backend/api/src/mapping/catalog/deduplication.ts` |
| Moderation | `backend/api/src/lib/moderation/`, `backend/api/src/routes/moderation.ts` |
| Fraud | `backend/api/src/lib/fraudDetection.ts`, `backend/api/src/routes/fraudDetection.ts` |
| Seller risk | `backend/api/src/db/migrations/100_seller_risk_tiers.sql` |
| Pricing | `backend/api/src/lib/pricingEngine.ts`, `backend/api/src/routes/price.ts` |
| Media pipeline | `backend/api/src/lib/media/`, `backend/api/src/lib/mediaLifecycle.ts` |
| Queues/workers | `backend/api/src/lib/queues.ts`, `backend/api/src/workers/` |
| Transactional outbox | `backend/api/src/db/migrations/069_transactional_domain_outbox.sql` |
| Production topology | `backend/docker-compose.production.yml` |

---

## 20. Report status

```text
Workspace: C:\Users\User\Desktop\thryftverse-upgrade
Starting branch: feat/product-detail-contract-media-device-closure
Starting HEAD: ab0b99d8f8ea54c0f156fa4ae39b8c99fe6716ce
Final branch: feat/product-detail-contract-media-device-closure
Files changed: this report only
Production code changed: no
Database migrations executed: no
Models trained or deployed: no
Live endpoint validation: not applicable to a research-only report
Native validation: not applicable to a backend research-only report
Final status: RESEARCH COMPLETE — IMPLEMENTATION BLUEPRINT READY
```
