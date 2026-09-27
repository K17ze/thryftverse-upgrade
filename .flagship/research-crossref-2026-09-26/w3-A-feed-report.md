# W3-A Report — Discovery / Feed (Home, Explore, Pulse)

**Date:** 2026-09-26
**Scope:** `web/` home feed, explore, pulse · dept report: `discovery.md`
**Prompt premise correction:** the task brief cited `POST /recommendations`. Verified against `backend/api/src/routes/recommendations.ts` and the mobile port (`frontend/src/hooks/useForYouFeed.ts`, `frontend/src/services/feedApi.ts`): the serve is **`GET /recommendations/:userId?surface&sessionId`**. No POST serve route exists; nothing calls it.

## Endpoint contract checked (backend `backend/api/src/routes/`)

| Endpoint | Exists | Used for |
|----------|--------|----------|
| `GET /recommendations/:userId?surface&sessionId` | YES | Live for-you serve — `items[]` carry `listing`, `score`, `model`, `policy`, `position`, `reasonCodes`, `componentScores`; `decision` block carries `requestId`, `policyVersion`, `serveMode`, `coldStart`, `trainedModel` |
| `POST /interactions` | YES | `not_interested` / `show_fewer` negative-feedback events (serve-joined via `requestId`/`position`/`model`/`policyVersion`/`surface`) |
| `POST /recommendations/intent/:userId/mutate` | YES | Durable intent-ledger writes — item `exclude`/`usual`, category/brand `less`, `idempotencyKey`, `source: 'feed_action'` |
| `POST /recommendations/impressions` | YES | Client-confirmed exposure `{ requestId, entries[{listingId,status:'rendered'}] }` (viewable upgrades deferred, same as mobile) |
| `GET /recommendations/intent/:userId/profile` | YES | Intent topics → dynamic signal chips |
| `GET /recommendations/intent/:userId/status`, `…/reset` | YES | Read for contract completeness; not wired (no web surface needs them yet) |
| `GET /feed/home?limit&cursor` | YES | Baseline feed — keyset `nextCursor` drives infinite scroll |
| `GET /feed/following|trending|looks|discover` | YES | Inspected; home uses `/feed/home` cursor contract |
| `POST /recommendations` | **NO** | Cited in brief; route does not exist — serve is GET by user id |
| Pulse live/trending rails | **NO** | No backend trending/live-rail service found — Pulse stays fixture, errors no longer blank populated content |

## Status by task

| # | Task | Status | Where |
|---|------|--------|-------|
| 1 | Recommendations serve (P0) | **DONE** | `lib/api/services/recommendations.ts::fetchForYouRecommendations` calls `GET /recommendations/:userId` in live+signed-in; `lib/hooks/feed-queries.ts::useHomeFeed` maps items → feed units with `metaByListing` (score/policy/position/reasonCodes/componentScores), `requestId`, `serveMode`. Guests and fixture mode keep `/feed/home` baseline. `FeedSource` ('recommendations' \| 'feed' \| 'fixture') is threaded to UI so copy is honest about what ordered the feed. |
| 2 | Per-card feedback controls (P0) | **DONE** | `components/feed/FeedItemMenu.tsx` — anchored overflow menu (portal, Escape/pointer-out/scroll close, arrow-key roving, focus returns to trigger, 44px targets) on every `ProductTile` inside a `FeedControlsProvider`. `FeedControls.tsx` applies the choice locally at once (`lib/feedPrefs.ts` persisted store) and reports the durable write honestly: persisted → "won't show this again"; `anonymous`/`unavailable`/`fixture_mode` → session/device-local copy, never claims a server write that didn't land. Live writes: `markItemNotInterested` (interaction + item-scope `exclude` mutation), `showFewerLikeThis` (interaction + facet-scope `less` on category→brand→item), `undoItemNotInterested` (compensating `usual`). Toast carries Undo. |
| 3 | Explanation surface (P1) | **DONE** | `components/feed/FeedExplanationSheet.tsx` — existing `Sheet` primitive (focus trap/restore). Serve items show real `componentScores`/`reasonCodes` mapped to reason copy + confidence banded from the actual serve score; baseline/fixture items show only local signals that genuinely applied (saved brand/category, followed seller) and a mechanism note that says fixture = "sample catalogue… editorial plus your saves and follows on this device" / baseline = "standard feed — sign in for recommendations". `serveMode` notes for cold_start/non_profiled/degraded_baseline. |
| 4 | Refresh grammar + last-good (P1) | **DONE** | Refresh `IconButton` in the sticky control bar; "N new drops" pill counts only head-of-feed newcomers vs the served set (pagination appends don't count). `isRefetchError` vs initial-load error split: refresh failure on populated content renders an inline retry banner above intact units (`HomeFeed.refreshError`); page-append failure renders an inline tail retry (`loadMoreError`); only a failed initial load shows the full error panel. |
| 5 | "Made for you" honesty (P0) | **DONE** | `app/explore/page.tsx` — unranked authored feed no longer labelled personalised; heading now describes the editorial/inspiration surface it is. |
| 6 | Dynamic signal chips (P1) | **DONE** | `components/home/homeSignals.ts::deriveHomeSignals` — chips derive from serve facets weighted by item score, 'more'/'usual' intent-ledger topics (`useIntentTopics`), and wishlist brand/category affinity; `personalized` chips get a small dot. Curated baseline fills the tail only where a chip actually matches feed content — no chip can open an empty feed and nothing is labelled personal without a real signal. |
| 7 | Infinite scroll (P2) | **DONE** | `useInfiniteQuery` + `getNextPageParam: last.nextCursor`; `HomeFeed` IntersectionObserver sentinel (600px rootMargin) → `fetchNextPage`; end-of-feed renders a quiet end marker. Recommendations serves have no cursor in the contract — `hasNextPage` correctly false there (documented, not faked). A failed append suspends auto-loading until manual retry. |
| 8 | Pulse (P2) | **DONE (bounded)** | No trending/live-rail backend exists — Pulse stays fixture and `app/pulse/page.tsx` + `components/pulse/PulseFeed.tsx` preserve populated cards on refresh failure (last-good posture). No fake "Trending now" rail added. |

## Supporting fixes inside owned paths

- `components/cards/ProductTile.tsx` — overflow trigger slot; `visualOnly` tiles (recommendation breaks) render media without interactive chrome.
- `components/feed/MasonryGrid.tsx` — `useMasonryColumns` export, recommendation-break force-span.
- `components/feed/FeedUnits.tsx` — `RecommendationBreak` restyled to flat-canvas band grammar (hairline, no card chrome), hides on empty; tile `priority`/`pressable`/`media-zoom` consistency.
- `components/feed/SegmentedControl.tsx` — corrected semantics (`aria-pressed` option buttons, not tablist); 44px pad-out.
- `components/feed/StoryRail.tsx`, `home/modules/EntryBand.tsx`, `home/modules/LooksRail.tsx`, `pulse/*` — pressable/hairline/radius grammar alignment and pulse last-good plumbing from the earlier pass in this thread.
- `components/home/rankFeed.ts` — serve-order is authoritative in live (`likedIds`/`followingIds` boosts disabled on recommendation units so position stays joined to the logged impression); like/follow ordering only applies to baseline/fixture.
- `lib/api/services/index.ts` — exports the recommendations service.

## Files changed

- `web/src/app/page.tsx` — serve hook, control bar (tabs + dynamic chips + refresh), N-drops pill, hidden/downweight hydration-gated filtering, FeedControlsProvider wiring.
- `web/src/app/explore/page.tsx` — honest label; hidden-listing suppression applied.
- `web/src/app/pulse/page.tsx` — last-good on refresh error.
- `web/src/lib/api/services/recommendations.ts` — **new** service: serve, impressions, interactions, intent mutate/profile.
- `web/src/lib/api/services/index.ts` — export.
- `web/src/lib/hooks/feed-queries.ts` — **new**: `useHomeFeed` (infinite), `useFeedActions`, `useIntentTopics`, `FeedSource`/`ServeItemMeta`.
- `web/src/lib/feedPrefs.ts` — **new** persisted local mirror (hidden ids, facet down-weights).
- `web/src/components/feed/FeedControls.tsx`, `FeedItemMenu.tsx`, `FeedExplanationSheet.tsx` — **new** control loop + sheet.
- `web/src/components/feed/FeedUnits.tsx`, `MasonryGrid.tsx`, `SegmentedControl.tsx`, `StoryRail.tsx`
- `web/src/components/cards/ProductTile.tsx`
- `web/src/components/home/HomeFeed.tsx`, `homeSignals.ts`, `rankFeed.ts`, `modules/EntryBand.tsx`, `modules/LooksRail.tsx`
- `web/src/components/pulse/PulseCard.tsx`, `PulseFeed.tsx`, `PulseFeedSkeleton.tsx`, `pulseModel.ts`

## Tests / checks

- `cd web && npx eslint <all changed files>` — **clean, zero warnings** (two prior warnings in `FeedItemMenu` fixed: unused `close`, ref-capture in cleanup).
- `cd web && npx tsc --noEmit` — **zero errors in any W3-A file**; remaining repo errors are concurrent workstreams' files (`components/visualsearch/VisualSearchClient.tsx`, `lib/hooks/collections-queries.ts`, `lib/hooks/seller-queries.ts`).

## Concerns for orchestrator

- **Repo-wide `tsc --noEmit` does not pass** — residual errors belong to other agents' in-flight files; do not report global green.
- **Serve pagination**: `GET /recommendations/:userId` returns a single ranked page (no cursor in the verified contract). Infinite scroll works on the `/feed/home` baseline path only; live serve is one page, as on mobile.
- **`feedPrefs` persistence vs server**: local hidden/downweight mirror is device-scoped; live writes also post to the intent ledger so suppression survives server-side, but a device-local hide made while the backend was unreachable stays local (toast copy says so).
- **Impressions**: confirmed as `'rendered'` once per `requestId` when units mount; per-cell viewability upgrade is a later iteration (same as mobile's current posture).
- **`FeedItemMenu` trigger sits in the tile's quick-actions cluster** — verify no z-index conflict with the wishlist heart if another agent restyles `ProductTile` hover chrome.
- `useHydrated`-gated stores (wishlist/follows/feedPrefs) keep SSR and first client render identical; any new consumer of these stores on this page must follow the same gate.
