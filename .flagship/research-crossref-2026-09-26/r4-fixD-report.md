# r4-fixD — Parity repair report (feed sheet, highlights rail, sort honesty, tile states, live dock, scroll lock)

Date: 2026-09-26. Branch: `feat/product-detail-contract-media-device-closure`.
Scope: workstream D ownership only. `FeedItemMenu.tsx` untouched (concurrent editor).

## 1. Explanation sheet — missing native actions [MEDIUM] — FIXED

Native (`frontend/src/components/algorithm/FeedExplanationSheet.tsx`) offers
"See more like this" (`updateTopicWeight` high → intent `more`), "Show less like
this", and "Remove this topic" (`removeTopic` → intent `remove`). Web offered only
"Show less" + "Not interested".

Backend contract verified (`backend/api/src/routes/recommendationIntent.ts:16-26`,
`recommendations.ts:991-1038`): the intent mutate endpoint accepts
`scope: topic|brand|category|seller|item|session` ×
`direction: more|usual|less|exclude|add|remove`, and the serve path resolves
`more`/`less` on brand/category/item scope into real ranking directives and
`remove`/`exclude` into hard exclusions. Both durable paths exist — no
fabrication needed.

Changes:

- `web/src/lib/api/services/recommendations.ts`
  - Added `dominantFacet(listing)` — shared category→brand→item resolver (same
    resolution `showFewerLikeThis` used; that function now delegates to it,
    identical semantics).
  - Added `showMoreLikeThis(userId, listing)` — intent mutation
    `direction: 'more'` on the dominant facet. The `/interactions` contract has
    no positive event, so the ledger is the only write (same as mobile).
  - Added `removeFeedTopic(userId, listing)` — intent mutation
    `direction: 'remove'` on the dominant facet; resolves to an `excluded`
    directive server-side (facet scope) or listing suppression (item scope).
  - Both return `FeedControlResult` honestly (`anonymous`/`unavailable`).
- `web/src/lib/feedPrefs.ts` — additive `unDownweightKey(key)` (lifts a prior
  local facet penalty; mirrors the ledger's latest-mutation-wins reversal).
- `web/src/lib/hooks/feed-queries.ts` — `useFeedActions` gains `seeMore`
  (local: lift prior downweight; live: `showMoreLikeThis`) and `removeTopic`
  (local: `downweightKey` immediate demote; live: `removeFeedTopic`).
- `web/src/components/feed/FeedControls.tsx` — `canTuneTopics =
  DATA_MODE === 'live' && user != null`; the two topic controls are passed to
  the sheet only then. Honest toast ladders kept (`persisted`/`fixture_mode`/
  `anonymous`/`unavailable`). Remove toast names the removed facet:
  `Removed “<topic>” — it won’t shape your feed`.
- `web/src/components/feed/FeedExplanationSheet.tsx` — optional `onSeeMore` /
  `onRemoveTopic` props; buttons render only when provided (no fake controls).
  Order: See more (primary, `plus` icon) → Show less (secondary) →
  Not interested (quiet, danger) → Remove this topic (quiet, `trash`, danger) —
  destructive rows last, matching native weight ordering.

**Fixture/guest honesty decision:** the two topic controls are *not* rendered in
fixture or anonymous sessions. A fixture "see more" cannot reach the local
ranker — `rankFeed.ts` (`web/src/components/home/`, outside this ownership) has
no upweight signal, so a feedPrefs-only "local weight" would be a dead write.
"Remove this topic" locally could only demote (a "show less"), which would
mislabel the control. The sheet's fixture honesty note already discloses the
sample catalogue. **Follow-up for main agent:** if fixture parity is wanted, add
an `upweightedKeys` consumer in `rankFeed.ts`/`FeedRankSignals` — the feedPrefs
side is ready to extend.

## 2. Highlights rail grammar [MEDIUM] — FIXED

Native `PosterHighlightsRail.tsx` + both callers (`UserProfileHeader.tsx:212`,
`MyProfileScreen.tsx:316`) verified: rail renders only when
`highlights.length > 0` **including for owners**; "New" tile is trailing
(after the map); multi-frame highlights carry an 18px frame-count badge;
HIGHLIGHT_SIZE = 80px.

- `web/src/components/profile/useProfileHighlights.ts` — `ProfileHighlightItem`
  gains `frameCount` (live: `h.frames.length` from `fetchPosterHighlights`;
  fixture: seeded + created `PosterHighlight.frames.length`).
- `web/src/components/profile/HighlightsRail.tsx` —
  - `if (highlights.length === 0) return null` (owner-empty → no rail; fixes the
    old `&& !isOwner` gate that leaked a lone "New" tile).
  - "New" tile moved to trailing position.
  - Frame-count badge `bottom-0 right-0` on the ring when `frameCount > 1`;
    aria-label gains ", N frames".
  - Tiles bumped 64px → 80px (column 72→88px; New tile 85px outer = 80px +
    2.5px ring ×2 so the trailing tile matches the ringed set). Self-contained
    change — layout rhythm preserved.

## 3. "Best match" honesty [MEDIUM] — FIXED

`web/src/components/search/SortDropdown.tsx` — the dropdown now reads
`usePathname`/`useSearchParams` (both already required by the subtree via
`useSortParam`/`useFacetParams` — no new Suspense constraint, no caller edits;
`RefinedResults` stays untouched):
`hasQuery = pathname === '/search' && q.trim() !== ''`.

- No query → the `relevance` option labels "Most liked" (the engagement
  fallback it actually runs — `engagementScore` in `filterTypes.ts:180`),
  matching native `CategoryDetailScreen.tsx:281-284`. The redundant
  `most-liked` row is folded out of the menu; a stored `?sort=most-liked`
  checks the folded row (native `Recommended`→"Most liked" check semantics).
- Query present → "Best match" (real match scores apply).
- Casing aligned with native: "Newest", "Price: Low to High",
  "Price: High to Low" (both `SORT_LABELS` and `SORT_OPTIONS` in
  `web/src/components/filters/filterTypes.ts`).

## 4. Paused/sold tile states [LOW] — FIXED

`web/src/components/cards/ProductTile.tsx`:

- `status === 'paused'` → quiet uppercase "Paused" chip at the promo-badge
  slot (`bg-overlay` pill, `scrim-text-primary`) — no scrim, tile stays
  browsable. Price-drop/sustainability badges suppressed while paused (a sale
  badge on an unpurchasable tile overstates it); media indicators stay.
- `isSold` → share/save/wishlist buttons suppressed (native
  `ClosetMediaMosaic.tsx:219` suppresses save/wishlist on sold; share has no
  sold-placement on native either). `FeedItemMenu` retained — feed tuning is
  still valid. Tile stays navigable (stretched link intact).

## 5. LiveLotDock backdrop blur [LOW] — FIXED

`web/src/components/live/LiveLotDock.tsx` — both cards (~line 100 lot card,
~line 172 up-next card): `bg-overlay backdrop-blur-md` →
`bg-media-overlay-scrim` (flat rgba(0,0,0,0.6) token, both modes) + kept
`border-white/10` hairline. `scrim-text-*` colors unchanged — contrast on the
live stage preserved.

## 6. CoOwnOnboardingGate scroll lock — FIXED

`web/src/components/coown/CoOwnOnboardingGate.tsx` — direct
`document.body.style.overflow` writes replaced with refcounted
`lockBodyScroll()` from `web/src/lib/a11y/scrollLock.ts` (acquire on visible,
idempotent release in the same cleanup alongside the keydown removal and focus
restore). Stacked overlays can no longer unlock the body under an open gate.

## Verification

- `tsc --noEmit` — zero errors on all owned files.
- `eslint` — clean on all 12 owned/edited files.
- **Pre-existing/concurrent:** `web/src/components/inbox/ChatPanel.tsx:376`
  reports `TS2554 Expected 2 arguments, but got 1` — that file is mid-edit by
  another workstream (heavy uncommitted diff); unrelated to this pass.

## Files changed

- `web/src/lib/api/services/recommendations.ts` (dominantFacet + showMoreLikeThis + removeFeedTopic; showFewerLikeThis delegates)
- `web/src/lib/feedPrefs.ts` (unDownweightKey, additive)
- `web/src/lib/hooks/feed-queries.ts` (seeMore/removeTopic actions)
- `web/src/components/feed/FeedControls.tsx` (gating + toasts + sheet props)
- `web/src/components/feed/FeedExplanationSheet.tsx` (two new actions)
- `web/src/components/profile/HighlightsRail.tsx` (rewrite: gate, badge, trailing New, 80px)
- `web/src/components/profile/useProfileHighlights.ts` (frameCount)
- `web/src/components/search/SortDropdown.tsx` (query-aware relevance label, casing)
- `web/src/components/filters/filterTypes.ts` (SORT_OPTIONS label casing + note)
- `web/src/components/cards/ProductTile.tsx` (Paused chip, sold action suppression)
- `web/src/components/live/LiveLotDock.tsx` (blur → flat scrim)
- `web/src/components/coown/CoOwnOnboardingGate.tsx` (lockBodyScroll)
