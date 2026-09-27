# Audit — HOME/FEED/PULSE (mobile) — 2026-09-26

## Verdict
HomeScreen is genuinely good: a personalized two-feed masonry with real aspect ratios, focal points, authored featured-tile rhythm, tile quick-actions, and exemplary state coverage — comfortably at Pinterest/Depop grammar for the grid itself. The gaps are parity-shaped: the web's authored feed canvas (Recently viewed → Fresh drops → feed → Trending/Member edits → Featured sellers → Galleria) has no mobile counterpart beyond a single Looks rail, and the web's like/follow re-rank loop (`rankFeedUnits`) is absent. PulseFeedScreen is the weakest surface in scope — a label-heavy event list that reads as a generic dashboard next to the web's full-bleed short-form Pulse feed, and it silently swallows errors as "the marketplace is quiet".

## Findings

### HF-01 — PulseFeed renders as a generic event list, not a media surface [P1]
- Screens: `frontend/src/screens/PulseFeedScreen.tsx`
- Evidence: `EventCard` (lines 44–91) renders a 68pt square thumb (`cardImage`, `Space.xxl + Space.xl`, line 279) beside a 4-line text column (type label + title + subtitle + meta, lines 77–88) separated by hairlines (line 276) — the classic generic-dashboard silhouette: identical rows, equal weight, label-everything (LIVE AUCTION chip + title + brand + price all on one row item). At thumbnail scale the screen is a stack of grey text rows, not a product.
- Web parity: `web/src/app/pulse/page.tsx` renders `PulseFeed` → `PulseCard` (`web/src/components/pulse/PulseCard.tsx`): full-bleed media fills the card, creator row + kind chip on a top scrim, like/save/share action rail on the right edge, shoppable chips on the bottom scrim — Instagram/TikTok short-form grammar.
- Competitor: Instagram Reels / TikTok / Pinterest idea pins — vertical media-first snap feed; the object is the label.
- Root cause: mobile Pulse was built as an activity log over `listings`/`customAuctions`; web later re-authored it as media-first. Mobile never got the upgrade.
- Fix: rebuild `EventCard` as a full-bleed snap-paging card (FlashList `pagingEnabled`/`snapToInterval`): media fills card, creator/type chip on top scrim, price/countdown meta on bottom scrim, right-edge save/share rail. Reuse `CanonicalMediaPreview` for video.
- Acceptance: at 25% scale the Pulse screen reads as stacked media slides; ≥1 full card + hint of next per viewport; text budget ≤3 sizes per card.

### HF-02 — Guests get an always-empty For-you feed on the default tab [P1]
- Screens: `frontend/src/screens/HomeScreen.tsx`, `frontend/src/hooks/useForYouFeed.ts`
- Evidence: `useForYouFeed.loadForYouFeed` returns early with `setPage(null)` when `!userId` (lines 181–186); `feedMode` defaults to `'foryou'` (HomeScreen line 128); `forYouIsEmpty` (line 456) then renders `EmptyState` "Nothing picked for you yet … Browse all" (HomeFeedHeader lines 353–361). A signed-out user's first viewport is a persistent empty state even though `listings` (general catalogue) loaded fine.
- Web parity: `web/src/app/page.tsx` renders the same `useFeed` units for guests; `rankFeedUnits` simply no-ops without signals — the feed is never empty by identity.
- Competitor: Pinterest/Vinted/Depop all serve a populated baseline feed to signed-out users.
- Root cause: personalization endpoint is identity-gated and there is no baseline/cold-start substitution — the code comment (lines 451–454) explicitly refuses to fall back to `listings`.
- Fix: when `!userId` or `serveMode === 'cold_start'`, compose `forYouExploreData` from the already-loaded `listings` store (deduped, newest-first) rather than rendering empty; keep the honest "personalized feed builds as you browse" affordance inside the feed, not as a wall.
- Acceptance: guest cold-start shows ≥1 full media row in the first viewport; For-you empty state only reachable when the catalogue itself is empty.

### HF-03 — No authored module rhythm — feed is flat masonry + one Looks rail [P1]
- Screens: `frontend/src/screens/HomeScreen.tsx`, `frontend/src/components/home/HomeMasonryFeed.tsx`
- Evidence: the only injected band is `LOOKS_INJECT_INDEX = 12` → `LookFeedMarker` (HomeScreen lines 530–541); `HomeMasonryFeed` supports exactly two item types (`getItemType`, line 104). No Fresh-drops rail, Trending rail, Featured-sellers strip, members/edits rail, or editorial banner; no entry band between story rail and grid.
- Web parity: `web/src/components/home/HomeFeed.tsx` lines 48–53, 117–130 — `RecentlyViewedRail` + `FreshDropsRail` lead, then module bands after chunks 8/16/24/32 (`LooksRail`, `MemberEditsRail`, `FeaturedSellersRail`, `GalleriaBanner`), plus `EntryBand` above the feed (`web/src/app/page.tsx` line 101). Bands self-omit on short/filtered feeds.
- Competitor: Vinted curated-selections rhythm; Pinterest smart feed mixes sources at different rates.
- Root cause: mobile feed rhythm predates the web wave upgrades; the marker mechanism exists but only one marker type was ever built.
- Fix: extend `FeedDataItem` with `freshDrops`/`sellers`/`editorial` marker types fed by existing stores (`listings` sorted by createdAt, `followingFeed.followingUsers`, a Galleria/Editorial static module) and splice at cadence [8, 16, 24, 32] the same way Looks is spliced.
- Acceptance: a 40-item feed shows ≥3 distinct full-width bands interleaved; filtered/short feeds show no orphaned rails.

### HF-04 — No like/follow-driven re-rank or recently-viewed session memory (Depop loop missing) [P1]
- Screens: `frontend/src/screens/HomeScreen.tsx` (feed derivation lines 428–472), `frontend/src/hooks/useForYouFeed.ts`
- Evidence: `forYouExploreData` maps server order verbatim — the only local transform is dedupe + featured rhythm + signal-chip *filter*. `dismissListing` exists (useForYouFeed line 273) but is never called from the feed. Recently-viewed exists only in creator pickers (`RECENTLY_VIEWED_KEY` in `creator/surfaces/pickers/ProductPicker.tsx:41`, `ProductBrowserSheet.tsx:94`) — never surfaced on Home.
- Web parity: `web/src/components/home/rankFeedUnits` (rankFeed.ts) resolves wishlist likes → brand/category/subcategory affinity and follows → seller affinity, dealing boosted listings every 4th slot while authored units hold position; `RecentlyViewedRail` sits atop the feed even on empty results (HomeFeed.tsx lines 101–118).
- Competitor: Depop like→suggest loop; Pinterest best-first mixing.
- Root cause: mobile personalization is fully server-delegated; the web added a local deterministic re-rank layer that mobile never ported.
- Fix: port `rankFeedUnits` to `frontend/src/presentation/` — derive affinity from `wishlist` + `followedSellerIdsSet` against `Listing` fields, rewrite only listing slots at a fixed stride; add a `RecentlyViewedRail` marker after the story rail backed by the existing `@thryftverse_recently_viewed_listings` store (unify the key).
- Acceptance: saving a liked-brand item reorders subsequent serves deterministically (boosted item in every 4th slot); recently-viewed rail appears above the grid after ≥1 PDP visit and omits itself when empty.

### HF-05 — PulseFeed has no error state; failures render as "quiet" [P2]
- Screens: `frontend/src/screens/PulseFeedScreen.tsx`
- Evidence: `useBackendData()` destructure (line 138) drops `lastError`; `events.length === 0` after a failed sync renders EmptyState "The marketplace is quiet" (lines 230–246) with only a "Browse All" CTA — a load failure is indistinguishable from a genuinely empty marketplace, violating honest-state coverage the Home screen handles correctly.
- Web parity: web `/pulse` uses react-query (`isLoading`/data) and also lacks a dedicated error branch — but mobile already has `SyncRetryBanner`/`OfflineBanner` primitives used on Home.
- Fix: accept `lastError` from `useBackendData`, render `SyncRetryBanner` (populated) or an error `EmptyState` with Retry (empty) when set.
- Acceptance: forcing a fetch failure with empty listings shows an error state with retry, not "The marketplace is quiet".

### HF-06 — Dead 'sold' event type + stale countdown in PulseFeed [P2]
- Screens: `frontend/src/screens/PulseFeedScreen.tsx`
- Evidence: `ActivityType` includes `'sold'` (line 30) with icon/accent maps (lines 50–60) and the empty-state copy promises "recent sales" (line 240), but the `events` builder (lines 144–206) never pushes a `sold` event — dead branch + dishonest copy. Also `const now = Date.now()` (line 142) is captured once per render; `formatCountdown(endsAtMs - now)` (line 158) never ticks — an auction's "Ends in" text is frozen until data changes re-render.
- Fix: either emit sold events from a real sales source or delete the `sold` type and fix the empty copy; drive countdowns with a 1s/30s interval tick (like `tradeHub` consumers) scoped to visible auction rows.
- Acceptance: no unreachable `ActivityType`; countdown text updates without a data refresh.

### HF-07 — First-viewport chrome stack can bury the first media row [P2]
- Screens: `frontend/src/components/home/HomeFeedHeader.tsx`, `frontend/src/screens/HomeScreen.tsx`
- Evidence: stacked above the grid: collapsed header (58 + insets), tab bar (~44, lines 177–213), signal chip rail (40, line 436), optional editorial header (lines 254–263), story rail (line 265), optional new-drops banner (lines 115–142), optional offline/sync/degraded banner (lines 272–294). Worst case ~380–430pt before the first tile — below the "≥2 media objects in a discovery viewport" density target on smaller devices.
- Web parity: web pins tabs+chips into one sticky row (page.tsx lines 78–94) — one chrome line, then StoryRail → EntryBand → feed.
- Fix: merge tab bar + signal rail into a single row on ≤375pt widths (or collapse signal rail behind scroll); cap simultaneous banner+story+editorial to two chrome blocks before media.
- Acceptance: on a 667pt-tall device the first media row is fully visible above the fold with all banners suppressed.

### HF-08 — PulseFeed accent grammar inconsistency + missing a11y labels [P3]
- Screens: `frontend/src/screens/PulseFeedScreen.tsx`
- Evidence: `price_drop` icon accent is `colors.warningText` (line 59) but its meta accent uses `cardMetaAccent` → `colors.dangerText` (line 312) — two different accent semantics on one row; also `EventCard`'s `AnimatedPressable` has no `accessibilityLabel`/`accessibilityHint` (line 74) unlike the labelled tiles on Home; `index` prop is accepted but unused (line 44).
- Fix: one accent per event type; add `accessibilityLabel={`${type} ${title} ${meta}`}`; drop the unused prop.
- Acceptance: screen reader announces card purpose; price-drop colour is consistent icon-to-meta.

## Non-findings (verified good)
- State coverage on Home is exemplary: geometry-matched skeleton (HomeFeedHeader 144–173), per-mode empty/error/offline/degraded branches (296–379), single consolidated status banner with priority ordering (269–294), refresh keeps last-good content (useForYouFeed 217–225).
- Tile quick-actions match Pinterest grammar: 22pt save glyph on a 44pt transparent hit area (HomeDiscoveryCard 217–230), double-tap save that never un-saves (94–102), long-press peek modal (HomeScreen 701–773).
- Masonry uses real media ratios + category focal points (`resolveListingMediaHeightRatio`, `getCategoryFocalPoint`; homeDiscoveryViewModel 293–305), not uniform cards.
- Authored asymmetry: featured-tile rhythm [7,9,6,10,8] with full-span breaks (HomeScreen 402–411, HomeMasonryFeed 155–162); honest finite-feed end marker (HomeScreen 671–682); within-page dedupe (415–425).
- Feed plumbing is sound: epoch-guarded request identity + in-flight dedupe + last-good refresh semantics (useForYouFeed 146–237); impression confirmation loop wired (useRecommendationImpressions); viewability-driven single-video playback; scroll-driven header collapse via shared values.
- Signal chips + For you/Following tabs are at parity with the web control bar (sticky segmented control + `HOME_SIGNALS` chips).
