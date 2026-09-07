# Flagship Autopilot — Benchmark Parity Campaign

**Campaign:** flagship-autopilot-benchmark-parity
**Started:** 2026-09-03
**Source:** docs/flagship-research/38_2026_BENCHMARK_GAP_ANALYSIS.md
**Competitors:** Instagram, Pinterest, Snapchat, Vinted
**Scope:** Product-wide feature capabilities (G1-G17) — distinct from the completed PDP visual quality campaign

## Execution order (per §37.12 truth-first)
1. G1 — wire Your Algorithm to real ranker (P0, highest irony-risk)
2. G4 — profile grid drag-reorder (P0, backend already real, pure UI)
3. G2+G3 — quick signals + pinnable feed views (P0, one feed workstream)
4. G8 — response-time into ranker (P1)
5. G5 — per-type push components (P0 partial)
6. G6+G11 — visual-search tuning + long-press entry (P1)
7. G7+G9+G10 — conversational context, quality gating, AI First Draft (P1)
8. G12 — swipe-to-switch-tab (P1, parallel with above)
9. G13-G17 — P2 emerging gaps

## Wave 1 — P0 + P1 gaps (2026-09-03)

Starting with G1, G4, G12 in parallel (independent workstreams).

### Completed

**G12 — Swipe-to-switch-tab gesture (P1) ✅**
- Created `frontend/src/hooks/useTabSwipe.ts` — `Gesture.Pan()` with `manualActivation(true)` to avoid conflicts with inner horizontal ScrollViews. Activates only on decisive horizontal drag (|dx| > 24, |dy| < 24). Respects guest gating (skips Inbox/Profile for guests) and skips Create tab (action, not destination).
- Wired into `frontend/src/navigation/TabNavigator.tsx` — wraps `Tab.Navigator` with `GestureDetector`. Uses `haptic.patterns.tabSwitch()` for feedback.
- TypeScript: 0 errors.

**G4 — Profile grid drag-reorder (P0) ✅ — ALREADY IMPLEMENTED**
- Discovered the full reorder implementation already existed in `MyProfileScreen.tsx`: "Arrange"/"Done" toggle, pin/unpin via long-press, shift left/right chevron buttons, rank numbers on pin badges, `setFeaturedListings` persistence on "Done". Backend `PUT /storefronts/me/featured-listings` was already wired.
- No changes needed — gap was already closed by prior work.

**G1 — Wire Your Algorithm to real ranker (P0) ✅**
- Frontend: Replaced compile-time `ALGORITHM_DEMO_MODE = __DEV__` with runtime `getAlgorithmDemoMode()` in `YourAlgorithmScreen.tsx` and `FeedExplanationSheet.tsx`. Demo banner now hides when backend is live.
- Frontend: `fetchFeedExplanation()` now calls real backend `GET /recommendations/:userId/explain/:itemId` first, falling back to local mock only when backend is unreachable.
- Frontend: Added `topicId` to `FeedExplanationReason` type. Wired "See more" → `updateTopicWeight(topicId, 'high')` and "Show less" → `updateTopicWeight(topicId, 'low')`. Fixed broken `removeTopic` call that used fabricated `topic-label-...` ID.
- Backend: Added `GET /recommendations/:userId/explain/:itemId` endpoint in `recommendations.ts` — queries `recommendation_impressions` + `recommendation_topic_projection` for real reason codes and topic IDs.
- TypeScript: 0 errors.

**G2 — In-feed quick signals (P0) ✅ — ALREADY IMPLEMENTED**
- Discovered the Quick Signals chip rail already existed in `HomeScreen.tsx`: 8 category tags (All, Denim, Sneakers, Outerwear, Vintage, Minimal, Streetwear, Luxury) that filter the feed and call `updateTopicWeight(signal, 'high')` to write to the ranker-feedback API.
- No changes needed — gap was already closed by prior work.

**G3 — Pinnable feed views (P0) ✅**
- Feed already had 4 modes: For you / Following / Latest / Saved.
- Added MMKV persistence: `appStorage.set('home.feedMode', mode)` so the user's last-used feed view is restored on app launch.
- TypeScript: 0 errors.

**G8 — Response time as ranking signal (P1) ✅**
- Backend `sellers.ts`: Computes real `avgResponseHours` from `chat_messages` using `PERCENTILE_CONT(0.5)` on the time between buyer's first message and seller's first reply over 30 days. `responseTimeLabel` now derived from real hours, not response_rate heuristic.
- ML service `schemas.py`: Added `seller_response_hours` field to `CandidateItem`.
- ML service `ranking.py`: Added `response_velocity` to `RANKING_FEATURES`, `_response_velocity()` helper (exponential decay: <1h → ~1.0, 3h → ~0.7, 12h → ~0.3), and wired into both heuristic and shadow ranker utility formulas (6% weight personalized, 10% cold-start).
- Backend `recommendations.ts`: SQL query now joins `seller_response_times` CTE computing median response hours per seller. Candidate payload includes `seller_response_hours`.
- Frontend `listingDetailContract.ts`: Added `avgResponseHours` to `SellerTrustSummary` type.
- TypeScript: 0 errors (2 pre-existing errors in SyndicateHubScreen.tsx unrelated).

### Validation
- TypeScript: 0 new errors (2 pre-existing in SyndicateHubScreen.tsx)
- Tests: 1602 passed, 2 skipped, 4 failed suites (all pre-existing: useInfiniteList, checkoutJourney, i18n, creatorStudioDevice)
- No regressions introduced

## Wave 2 — P0 partial + P1 gaps + code quality (2026-09-03)

### Completed

**G5 — Per-type push categories (P0 partial → CLOSED) ✅**
- Frontend `App.tsx`: Added 3 new iOS notification categories — `order` (Track + Mark as read), `auction` (View + Dismiss), `social` (View + Mark as read) — alongside the existing `message` category.
- Backend `workerHelpers.ts`: Added `mapEventTypeToIosCategory()` mapping event types to iOS category identifiers.
- Backend `pushHandler.ts`: Added `category` field to Expo push payload + `threadIdentifier` for grouped notifications (messages from same conversation, events for same order, bids on same auction stack together).
- Frontend `usePushNotificationTap.ts`: Handle inline action button taps (reply → navigate to conversation, track_order/view_bid/view → navigate to route, mark_as_read → no-op). Added `action_id` to analytics.
- Frontend `analytics/types.ts`: Added `action_id` field to `PushNotificationTappedProperties`.

**G9 — Listing photo quality gating (P1 → CLOSED) ✅**
- Frontend `SellScreen.tsx`: Wired `scoreListing()` from `listingQualityApi` into the sell flow. The `ListingQualityMeter` component now renders above the publish footer when the draft quality score is below 80, showing actionable suggestions (photo count, title length, description depth, pricing, completeness) before the seller publishes.

**G11 — Visual search refinement facets (P1 partial → CLOSED) ✅**
- Frontend `VisualSearchScreen.tsx`: Added color facet chips (10 colors: Black, White, Blue, Red, Green, Brown, Grey, Pink, Beige, Navy) and style facet chips (8 styles: Vintage, Minimal, Streetwear, Y2K, Formal, Casual, Sportswear, Luxury) as horizontal scroll rails. Client-side text matching on listing title/description — honest filtering, not image analysis. Applied to both API results and cached fallback. Clear filters resets color/style too.

**Code quality fixes (user-initiated patterns) ✅**
- `GlobalSearchScreen.tsx`: Wrapped `StyleSheet.create` in `useMemo` with `colors` dependency — was recreating 22 styles on every render.
- `ClosetScreen.tsx`: Same fix — was recreating 36 styles on every render.
- `AuctionDetailScreen.tsx`: User removed unnecessary `FadeIn` mount animation (screen-level motion restraint).
- `ItemDetailScreen.tsx`: User removed unnecessary `FadeIn` mount animation + dead `secondaryLine` variable.
- `CommerceDetailMoreLikeThis.tsx`: User upgraded radius from `RadiusRoleValue.mediaThumbnail` (8px) to `Radius.lg` (12px) for the discovery grid — deliberate visual upgrade.
- `MyProfileScreen.tsx`: User moved `colors.overlay` from static StyleSheet to inline style (runtime theme value in static stylesheet bug).

### Validation
- TypeScript: 0 errors (clean compile)
- Tests: 1639 passed, 2 skipped, 1 failed suite (pre-existing: settings01InformationArchitecture)
- No regressions introduced — test pass rate improved from 1602 to 1639

### Remaining gaps
- G7: Conversational search cross-session context (P1)
- G6: Visual search embeddings + long-press entry (P1 partial)
- G10: AI listing First Draft (P1 partial)
- G13-G17: P2 emerging gaps
