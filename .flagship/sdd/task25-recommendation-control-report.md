# Task 25 — Recommendation Control (P1, medium)

**Status:** DONE_WITH_CONCERNS (one Python-side caveat: no pytest in env; verified via unittest + manual ranking runs)
**Scope:** Give users real, durable control over the recommendation feed — hide / not interested / show less like this — and make that feedback actually propagate into ranking.

---

## 1. What existed before

### Frontend
- `YourAlgorithmScreen` already offered topic tuning (More / Usual / Less / Remove) via `algorithmTransparencyApi` → `POST /recommendations/intent/:userId/mutate`.
- `FeedExplanationSheet` (`components/algorithm/FeedExplanationSheet.tsx`) existed with "See more / Show less like this / Remove this topic" — **but was dead code, never rendered anywhere** (no entry point on any feed tile).
- `DiscoverScene`/`PinterestMasonryGrid`/`ProductDiscoveryTile` exposed only press + save/bookmark. **No "not interested", "hide", or "show less" affordance existed on the recommendation surface.**
- No frontend code called `POST /interactions` at all.

### Backend
- `POST /interactions` already accepted `not_interested`, `show_fewer`, `report_content`, `rapid_skip`, `unsave`, etc. and forwarded the user's last 200 interactions to the decision service as `recent_interactions`.
- The intent ledger (`user_intent_mutations`, `recommendation_topic_projection`, migration 185) already supported `direction ∈ {more, usual, less, exclude, add, remove}` across scopes `topic/brand/category/seller/item/session`.
- **Critical gap #1:** `ml-service/app/schemas.py` defined `Action = Literal["view","wishlist","purchase"]`. Any recorded `save`/`not_interested`/etc. interaction made the decision-service request fail pydantic validation → HTTP 422 → fallback ranking (and circuit-breaker pressure). Recording feedback actively *broke* personalization.
- **Critical gap #2:** `exclude_listing_ids` was supported by the decision-service contract but never populated by the API.
- **Critical gap #3:** topic bands (`less`/`excluded`/`more`) and non-topic intent mutations were persisted but **never read by `GET /recommendations/:userId`** — tuning "Less" in Your Algorithm changed nothing in the feed. This was the "like button that doesn't affect the feed" problem.

---

## 2. Changes made

### `backend/ml-service/app/schemas.py`
- `Action` extended to the full `INTERACTION_ACTIONS` set (19 actions) matching the API contract — fixes the 422 poisoning.
- New `TopicDirective` model `{label, band: more|less|excluded}` and `topic_directives: list[TopicDirective]` field on `RecommendationRequest`.

### `backend/ml-service/app/ranking.py`
- `ACTION_WEIGHTS` / `ACTION_HALF_LIFE_DAYS` now cover all 19 actions with **signed** weights (`not_interested` −4.0, `report_content` −5.0, `show_fewer` −2.5, `rapid_skip` −0.8, `unsave` −1.2, `unfollow_seller` −1.5; positive weights for save/share/basket/offer/checkout/etc.).
- `_event_weight` clamped symmetrically to ±8.
- `HARD_EXCLUDE_ACTIONS = {not_interested, report_content}` — those listings are removed from eligibility in both `extract_candidate_features` and `rank_recommendations`. `show_fewer` deliberately stays a ranking signal only (less ≠ never show, per report §22).
- Negative events add negative token mass into `profile_weights`/`sequence_weights`, so similar items are genuinely down-ranked, not just the dismissed item.
- Only positive events contribute to `interacted_prices`; `meaningful_events` uses `abs(weight)` so a feedback-only user isn't misclassified as cold-start.
- Topic directives: `_directive_match` (compound prefixed token match, e.g. `brand:acne_studios`, plus per-token match against free text and `category:`/`brand:`/`size:`/`condition:` tokens). `excluded` labels drop decisively-matching candidates; `less` applies `−0.18 × match` utility penalty; `more` applies `+0.10 × match`.

### `backend/api/src/routes/recommendations.ts`
- `GET /recommendations/:userId` now resolves user feed controls before serving:
  - `recommendation_topic_projection` bands `more|less|excluded` → `topic_directives`.
  - Latest-per-(scope,target) unexpired `user_intent_mutations`: item `exclude|remove` → excluded listing ids; seller `exclude|remove` → excluded seller ids; brand/category `exclude|remove|less|more` → topic directives. A later `usual`/`add` reverses an earlier `exclude`.
  - `not_interested`/`report_content` interactions → excluded listing ids (immediate suppression, no ledger dependency).
- `eligibleListingRows` (exclusion-filtered) is now the single candidate source for the decision-service payload, the fallback ranker, cache validation, and the response item map — **exclusions hold on every serve path**, including degraded fallback.
- `topic_directives` forwarded in the decision-service request body.
- `decision.diagnostics.user_control_suppressed` reports how many candidates the user's own controls removed.
- Cache correctness was already sound: `intentEpoch` (bumped by every interaction write and intent mutation) is part of the recommendation cache key, so feedback invalidates cached serves.

### `frontend/src/services/recommendationFeedbackApi.ts` (new)
- `postRecommendationInteraction(listingId, action, attribution)` → `POST /interactions` with serve attribution (requestId/position/model/policyVersion/surface).
- `markItemNotInterested(listing, attribution)` → `not_interested` interaction **+** item-scope `exclude` intent mutation (`source: 'feed_action'`).
- `showFewerLikeThis(listing, attribution)` → `show_fewer` interaction **+** `less` intent mutation on the item's category (brand / item fallback).
- Both are best-effort-honest: return `{persisted}`, never throw; guests get local-only hide.

### `frontend/src/hooks/useForYouFeed.ts`
- Added `dismissListing(listingId)` — removes the item from the served page so suppression is visible immediately.

### `frontend/src/components/ProductCard.tsx` (`ProductDiscoveryTile`)
- New optional `onLongPress` prop — gesture-only affordance (no visual chrome added; layout unchanged).

### `frontend/src/components/discover/PinterestMasonryGrid.tsx`
- New optional `onListingLongPress` prop threaded through `renderUnit` ctx and the legacy `Listing[]` path to `ProductDiscoveryTile`.

### `frontend/src/scenes/discovery/DiscoverScene.tsx`
- Long-press a listing tile → compact feed-control sheet (same Modal idiom as `YourAlgorithmScreen`'s topic sheet; no layout change to the feed itself) with three honest actions:
  - **Not interested** — hides the tile immediately (`hiddenListingIds` + `dismissListing`), writes `not_interested` + item `exclude`.
  - **Show less like this** — writes `show_fewer` + category `less` directive, then refreshes the personalised feed so the down-ranking is visible.
  - **Why am I seeing this?** — opens the previously dead `FeedExplanationSheet`; its See-more/Show-less/Remove-topic controls now refresh the feed after mutating the intent profile.
- Hidden ids are filtered from both feed sources (personalised For You items and the legacy listings cursor).

---

## 3. How feedback affects the algorithm (end-to-end)

| User action | Immediate (client) | Durable (server) | Ranking effect |
|---|---|---|---|
| Not interested | Tile removed from feed | `not_interested` interaction + item `exclude` mutation | Listing dropped from candidates on all paths; −4.0 token weight on similar items |
| Show less like this | Sheet dismisses; feed refetches | `show_fewer` interaction + `less` directive on category | −0.18 × match utility penalty + −2.5 token signal |
| Your Algorithm "Less" | Chip re-renders faded | projection band `less` | `less` directive → down-rank |
| Your Algorithm "Remove" | Chip removed | topic row deleted | topic no longer ranks |
| See more / explanation sheet | Feed refresh | `more`/`high` band | +0.10 × match utility boost |

Every write bumps `recommendations:intent:{userId}` epoch → cache key changes → next serve is fresh.

Verified functionally (manual run against `rank_recommendations`):
- baseline order `[denim2, coat1, denim1]` → after `not_interested` on denim1 + `show_fewer` on a denim item → `[coat1, denim2]` (denim1 gone, denim2 down-ranked)
- `excluded` directive "denim" → `[coat1]`
- `less` directive "denim" → denim scores drop ~35% but remain served (less ≠ never)

## 4. Verification

- **Frontend tsc:** `0` errors (`tsc --noEmit -p tsconfig.json`, exit 0)
- **Backend tsc:** `0` errors (exit 0)
- **Backend API tests:** `recommendations.test.ts` + `recommendationReranking.test.ts` — 7/7 pass
- **ml-service:** `test_decision_baselines.py` — 8/8 pass via `python -m unittest`
- **ml-service functional check:** verified above (suppression, exclusion, down-ranking all real)

## 5. Concerns / follow-ups

1. **pytest absent in this env** — ml-service tests ran via `unittest`; all passed. CI should re-run the full pytest suite.
2. **Home feed (`/feed/home`) does not consume intent controls** — it is a separate pipeline (listings + posters + looks). The Discover tab's personalised canvas (`/recommendations/:userId`) is fully covered; if the home feed should also honour "not interested"/mutes, a follow-up should apply the same exclusion query there.
3. **Long-press discoverability** — the control surface is a gesture with an a11y hint ("Long-press for feed controls"), chosen deliberately to avoid changing tile visuals per task constraints. If the report intends a visible overflow affordance, that's a design call for the parent agent.
4. **`show_fewer` on items with no category/brand** falls back to an item-scope `less` mutation, which is recorded in the ledger but currently maps to no directive (item-level 'less' is meaningless) — the `show_fewer` interaction still contributes the negative signal. Harmless, noted.
5. **Guest users** cannot persist feedback (no user id); local hide still applies for the session — honest degradation, not fake persistence.
6. `FeedExplanationSheet`'s `itemTitle`/`itemThumbnail` are empty strings (backend provides none); the sheet renders reasons + controls correctly. Fetching real item metadata is a possible follow-up.
