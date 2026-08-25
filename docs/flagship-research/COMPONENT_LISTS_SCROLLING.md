# ThryftVerse Flagship Upgrade — Lists, Scrolling & Collection Patterns

> Flagship upgrade research for ThryftVerse list, scrolling and collection systems.
> Benchmark date: August 2026. Canonical references: `AGENTS.md` §4 (density target 4–6 rows, first-viewport usefulness, deliberate spacing, consistent alignment, native interaction patterns, state coverage), §16 (performance — virtualization, stable keys, memoization, reduced-motion), `Design.md` (Component A infinite vertical feed, Component B Pinterest masonry board, adaptive discovery modules, the `Space` scale, masonry card micro spec, feed post micro spec, sticky action dock micro spec, perceived-performance surface contracts).
> Runtime source of truth: `frontend/src/theme/designTokens.ts` (`Space`, `Radius`, `Duration`, `DockConstants`), `frontend/src/components/discover/PinterestMasonryGrid.tsx`, `frontend/src/components/product/DiscoveryGrid.tsx`, `frontend/src/components/product/RecommendationRail.tsx`, `frontend/src/components/product/SeenInLooksRail.tsx`, `frontend/src/components/explore/LooksTab.tsx`, `frontend/src/screens/HomeScreen.tsx`, `frontend/src/screens/NotificationsScreen.tsx`, `frontend/src/components/wallet/WalletTransactionHistory.tsx`.

---

## 1. 2026 Competitor Benchmark — How the Leaders Handle Lists and Scrolling

The 2026 list-and-scroll landscape has converged on a small set of principles: **virtualization is mandatory, recycling beats remounting, scroll position is memory, and the list itself is a designed surface — not a dumping ground for rows.** The strongest marketplace and social apps treat their feeds, grids and rails as performance subsystems with explicit contracts, not as a `FlatList` someone tuned until it stopped janking.

### Pinterest — masonry as the endless-discovery engine

Pinterest remains the benchmark for visual-discovery scrolling. In 2026 the mobile feed is a two-column staggered masonry grid where **every image keeps its real aspect ratio** and nothing is cropped to fit. The neutral white canvas and 8pt gutters do all the separation work; there is no visible card frame around each pin. The masonry layout is powered by shortest-column-first placement, server-supplied `{ url, width, height }` metadata, and a fixed-size placeholder (colour or blurhash) rendered at the known aspect ratio so the grid never jumps when images decode. Infinite scroll uses cursor pagination and triggers the next-page fetch *before* the sentinel is on screen, so new pins are ready by the time the user reaches the bottom. For very long boards, Pinterest virtualises — only tiles in or near the viewport are mounted, with a height index per tile so scroll position maps to the visible range.

The lesson for ThryftVerse: masonry quality comes from **layout stability, image bytes, and pagination discipline** — not from beige backgrounds or decorative containment. `Design.md` §Component B already encodes this ("Use server/media dimensions. Fallback to 4:5 only when dimensions are unavailable. Never derive height from item ID/hash/random render values."). The flagship gap is enforcement: every masonry surface must prove it has zero cumulative layout shift.

Sources:
- Frontend Interviews, "Design Pinterest (Masonry Feed, Infinite Scroll)" — https://frontendinterviews.dev/frontend-system-design/pinterest
- techinterview, "Frontend System Design: Build a Pinterest-Style Infinite Grid" — https://www.techinterview.org/post/3233475025/frontend-system-design-pinterest-grid/
- VP0 Journal, "Pinterest App Design Inspiration: The Masonry Feed" — https://vp0.com/blogs/pinterest-app-design-inspiration
- InterviewLane, "How would you design a product like Pinterest?" — https://interviewlane.com/questions/design-a-product-like-pinterest

### Instagram — the feed as a stable action grammar

Instagram's 2026 feed is a vertical scroll where each post occupies 70%+ of the viewport. Media (4:5 or 1:1) fills the card width edge-to-edge with no card padding. The action row (like, comment, share, save) sits below the media as flat 44pt hit targets with 24pt glyphs — no pill backgrounds. Stories sit as a horizontal rail above the feed with seen/unseen ring states. The profile grid, since the 2024–2025 redesign, previews each post as a 3:4 portrait thumbnail rather than a square, and Instagram now supports free profile-grid rearrangement for all users. Scroll-to-top is triggered by tapping the active tab in the bottom bar — the canonical "tap active tab to scroll to top" native pattern.

The lesson: **one post should own at least 70% of the viewport** (`Design.md` §Component A). Media loads with crossfade; skeletons match final aspect ratio exactly. Action feedback is instant and optimistic only when persistence is real. The feed is not a decorated rectangle — it is a media unit with a stable, restrained action grammar.

Sources:
- GenDesigns, "Mobile UI Patterns 2026: 19 Patterns and When to Use Them" — https://gendesigns.ai/blog/mobile-ui-patterns-2026
- React Navigation docs, "useScrollToTop" — https://reactnavigation.org/docs/use-scroll-to-top

### eBay Evo — marketplace density with recycling discipline

eBay's Evo design system (2024–2026) is the marketplace benchmark for dense product grids. The `ItemCard` surfaces image, title, price, condition and seller signal in a compact unit that works in both lists and grids. Elevation is disciplined: a single `card` shadow token is used, not a proliferation of ad-hoc shadows. Filter and refinement patterns use stacked groups with applied-chip review and a sticky apply bar — a single dominant panel, not a cascade of grey surfaces. eBay's grids use native `RecyclerView`-style recycling semantics: a small, fixed pool of views is kept alive and rebound with new data as the user scrolls, which is exactly the model Shopify's FlashList v2 brings to React Native.

The lesson for ThryftVerse commerce: **density and trust clarity matter more than decoration**, and **lists are a performance subsystem, not a component**. The recycling contract — stable keys, memoised `renderItem`, idempotent item components, no inline objects/functions in the render path — is what separates a 60 FPS grid from a janky one on mid-range Android.

Sources:
- Shopify Engineering, "FlashList v2: A ground-up rewrite for React Native's New Architecture" — https://shopify.engineering/flashlist-v2
- Shopify/flash-list, "Performant Components" — https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md
- React Native Relay, "FlashList v2 Migration Guide: Expo 2026" — https://reactnativerelay.com/article/react-native-flashlist-v2-expo-high-performance-lists-migration

### Snapchat / TikTok — horizontal rails, carousels and the "one more swipe" hook

Snapchat and TikTok popularised the horizontal rail as a discovery module inside a vertical feed. The 2026 consensus on horizontal rails is clear: **scroll-snap is the right tool for horizontal carousels** (it gives the "one card per stop" feel of a native view pager), but it should be a hint, not a constraint — the user must still be able to stop between snaps if they want. Each card should be visually distinct and self-contained, the first visible card carries the most responsibility (it may be the only one a user sees), and a partial view of the next card is the clearest cue that the row moves. Pagination indicators or progress dots track position live. Accessibility requires `role="region"`, `aria-label`, and `aria-live="polite"` so screen readers announce slide changes.

The lesson: horizontal rails work when the items are **closely related, visual, and browseable/comparable**. They fail when used for long copy, forms, pricing, docs, settings, or dense comparison. The first card must offer value even if the user never swipes.

Sources:
- Richard Lemon, "Scroll-snap in 2026: when it helps vs hurts UX" — https://richardlemon.com/scroll-snap-2026-right-call-vs-fights-user/
- Chrome for Developers, "Make accessible carousels" — https://developer.chrome.com/blog/accessible-carousel
- lirunning, "How to Plan Mobile Carousels That Help Users Browse, Compare, and Discover" — https://lirunning.com/how-to-plan-mobile-carousels/
- Interface Lab, "Horizontal Portfolio Rail" — https://www.interfacelab.design/en/skills/horizontal-portfolio-rail

### Cross-platform convergence

Across all benchmarks, the 2026 consensus on lists and scrolling is:

1. **Virtualization/recycling is mandatory** for any list that can exceed ~100 items. FlatList's mount/unmount virtualization is the floor; FlashList v2's cell recycling is the ceiling on the New Architecture.
2. **Scroll position is memory.** Returning to a list must restore the user's exact position. Losing scroll position is "stupid behaviour" that destroys the interaction flow.
3. **Tap-active-tab-to-scroll-to-top is expected native behaviour.** React Navigation's `useScrollToTop` is the canonical implementation.
4. **Pull-to-refresh must not punish the user.** Previously loaded data stays visible during refresh; only the refresh indicator shows. Skeletons/fullscreen loaders are for initial load only.
5. **Infinite scroll needs an escape hatch.** A "way to jump to top," a loading indicator when fetching more, and an honest end-of-list state when there is no more.
6. **Horizontal rails use scroll-snap**, with a peeking next card as the affordance cue.
7. **List item entrance animation is dangerous with recycling.** Staggered entrance animations replay on every recycled cell and break the recycling contract. They must be feature-gated or omitted on recycling lists.

Sources:
- GenDesigns, "Mobile UI Patterns 2026" — https://gendesigns.ai/blog/mobile-ui-patterns-2026
- kt.academy, "How to correctly implement Pull-to-refresh on mobile" — https://kt.academy/article/pull-to-refresh
- cr0x.net, "Pagination vs Infinite Scroll: UI Patterns That Don't Annoy Users" — https://cr0x.net/en/pagination-vs-infinite-scroll/
- VP0 Journal, "Build Infinite Scroll in React Native with TanStack Query" — https://vp0.com/blogs/tanstack-query-infinite-scroll-ui-react-native-free-ios-template-vibe-coding-gui
- Coder Legion, "Preserving Scroll Position and Cursor State During Navigation Transitions" — https://coderlegion.com/10439/preserving-scroll-position-and-cursor-state-during-navigation-transitions
- Filip Němeček, "Implementing double tap tab bar to scroll to top" — https://nemecek.be/blog/185/implementing-double-tap-tab-bar-to-scroll-to-top
- Swift Discovery, "How to tap again on tab bar item to scroll top in iOS" — https://onmyway133.com/posts/how-to-tap-again-on-tab-bar-item-to-scroll-top-in-ios/

---

## 2. Psychology & Principles — The Flow of Scrolling

### Momentum as naturalism

Native scrolling feels right because it obeys physics. Touch input imparts velocity; the list decelerates with friction; a small overshoot settles back. This is **momentum as naturalism** — the screen behaves like a physical object, not a web page. Any list that breaks momentum (a `ScrollView` that snaps too aggressively, a `FlatList` with `removeClippedSubviews` that flashes blank cells, a masonry grid that re-measures and jumps when images decode) reads as broken even when it is technically functional. The 2026 performance bar is not "does it scroll" but "does it scroll like a native view" — 60 FPS, no blank areas, no layout shift, no position jumps.

`AGENTS.md` §16 is explicit: "Preserve or improve FlashList, FlatList, or equivalent virtualization; stable keys; memoized expensive derived data; smooth typing; limited rerenders; efficient image rendering; stable keyboard transitions; deterministic skeletons; reduced-motion behaviour." The prohibited list includes "render large data sets inside unvirtualized Views," "reanimate entire lists for small updates," and "remount large screens unnecessarily."

### The rhythm of list items

A list is a rhythm instrument. The cadence of spacing between items is what makes it feel authored rather than dumped. `Design.md` §Layout defines the rhythm: 8pt gutters in dense media/discovery, 16pt within a group, 24pt between groups, 32–48pt for major composition breaks. The masonry card micro spec locks gutters at 8pt. The feed post micro spec locks action-row spacing at 8pt with 44pt hit areas. When these rhythms drift — a 6pt gutter here, a 12pt gutter there, a 20pt section break — the list reads as assembled rather than designed.

The **density target** (`AGENTS.md` §4, `Design.md` §visual-geometry) is the rhythm's tempo: a normal list viewport should expose roughly **4–6 useful rows**, and a discovery viewport should expose at least two meaningful media objects or the beginning of the next module. Too sparse wastes the viewport; too cramped makes content fight for room. The density target is not a suggestion — it is the calibration point for row height, gutter size, and chrome weight on every list surface.

### The "endless discovery" hook

Infinite scroll works for browsing-to-be-entertained surfaces (feeds, inspiration galleries, social timelines) because the "next" is less important than the "now." The psychological hook is **endless discovery**: the user never reaches a hard boundary that forces a decision. But endless discovery has a cost — it is hostile to accessibility, it makes footer content unreachable, and it destroys the user's sense of progress. The 2026 consensus is that infinite scroll must always provide: (1) a loading indicator when fetching more, (2) a way to jump to top, (3) saved scroll position when navigating away, and (4) an honest end-of-list state when the data is actually finite.

For ThryftVerse, this maps directly to the surface contracts in `Design.md` §Perceived Performance. The Home/Explore surface is "Visually Complete when above-fold media is decoded or represented by matching skeletons; no masonry card jumps position." The infinite-scroll contract is: cursor pagination, `onEndReachedThreshold` of ~0.5 (trigger a screen before the end so the next page arrives before the user hits empty space), a `ListFooterComponent` loading indicator, and a truthful end-of-list state (not a silent stop, not a fake "Load more" that fetches nothing).

### Scroll position as memory

Users don't know terms like "controller lifecycle" or "memory unloading," but they feel when an app behaves stupidly. Losing scroll position when navigating away and back — being thrown to the top of a feed you scrolled through 200 items of — is one of the most reliable signals of a non-flagship app. **Scroll position is memory.** Preserving it across navigation transitions, tab switches, and background/foreground cycles is what separates a native-feeling app from a web dashboard inside a phone.

The 2026 best practice is anchored infinite scroll: as the user scrolls, the app stores the current anchor (cursor or offset) and scroll position in navigation/history state. Back returns the user to the exact place. React Navigation's `useScrollToTop` handles the tap-active-tab case; scroll-position restoration requires explicit ref management and `scrollToOffset` on mount/focus. `UserProfileScreen.tsx:401` already does this (`listRef.current.scrollToOffset?.({ offset: saved, animated: false })`), but it is not a system-wide contract.

### The "one more swipe" principle

The best feeds make the user want one more swipe. This is not about dopamine manipulation — it is about **visual continuity**. The masonry grid works because nothing is cropped to fit: every image keeps its shape, so the eye keeps wandering. A horizontal rail works because the peeking next card promises more without demanding it. A sectioned list works because each section header is a landmark that says "here is the next thing to explore." The "one more swipe" principle is the product of three things: (1) media dominance (chrome recedes), (2) stable rhythm (spacing is predictable), and (3) no dead ends (there is always a next action — save, similar, board, shop, see-all).

`Design.md` §Pinterest gate encodes the dead-end rule: "the user reaches a dead end with no save/similar/board/shop continuation." A list that ends without a next action is a list that fails discovery.

### List item appear animation — the recycling trap

Entrance animation (staggered fade-in, slide-up, scale-up) is the most common way teams try to make a list feel premium. It is also the most common way they break recycling. When a list recycles cells, the recycled cell is re-bound with new data — and if the cell has an entrance animation, the animation replays on every recycled cell as it scrolls into view. The result is a list that shimmers constantly, which reads as broken and burns CPU.

The 2026 consensus, confirmed by Shopify's FlashList v2 documentation, is: **do not animate entrance on recycling lists.** `PinterestMasonryGrid.tsx:34-39` already encodes this correctly — `enableEntranceAnimation` is "silently ignored" because "staggered entrance animations are intentionally NOT rendered (they break recycling and replay on every recycled cell)." This is the right call. Entrance animation is allowed only on non-recycling lists (a short `ScrollView` with a fixed number of items) or behind a feature flag with a reduced-motion fallback.

Sources:
- Shopify/flash-list, "Performant Components" — https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md
- John Hambardzumian, "React Native Performance: List Views and Re-renders" — https://hambardzumian.com/blog/react-native-performance-list-views
- vinicius.io, "React Native Lists - Treat Them as a Performance Subsystem, Not a Component" — https://vinicius.io/blog/react-native-lists-treat-them-as-a-performance-subsystem-not-a-component/
- OneUptime, "How to Implement FlatList Optimization for Large Lists in React Native" (2026-01-15) — https://oneuptime.com/blog/post/2026-01-15-react-native-flatlist-optimization/view
- Sujeet Jaiswal, "Design an Infinite Feed" — https://sujeet.pro/articles/design-infinite-feed

---

## 3. Current ThryftVerse Audit — Concrete Defects

The codebase has made a strong architectural choice: **FlashList v2 is the dominant list primitive** (196 matches for `FlashList` across `frontend/src`), with raw `FlatList` reduced to only 2 files (`AIEffectGrid.tsx:18`, `EditorialImageRow.tsx:2`). `SectionList` is used in 3 files (`NotificationsScreen.tsx:833`, `WalletTransactionHistory.tsx:180`, `SellerAuctionCentreScreen.tsx:714`). This is the right foundation. The flagship gap is **systemisation and state coverage**, not primitive selection.

### Defect L1 — No canonical FlatList/FlashList wrapper for vertical lists

There is no shared `FlagshipList` (vertical list) wrapper in `frontend/src/components/ui/` or `frontend/src/components/flagship/`. Every screen wires its own `FlashList` with its own `onEndReached`/`onEndReachedThreshold`/`ListFooterComponent`/`ListEmptyComponent`/`refreshControl` combination. The thresholds are inconsistent across screens:

- `HomeScreen.tsx:1168` — `onEndReachedThreshold={0.5}`
- `NotificationsScreen.tsx:848` — `onEndReachedThreshold={0.3}`
- `MyOrdersScreen.tsx:571` — `onEndReachedThreshold={0.3}`
- `AuctionHomeScreen.tsx:1172` — `onEndReachedThreshold={0.25}`
- `FollowingScreen.tsx:198` / `FollowersScreen.tsx:198` — `onEndReachedThreshold={0.4}`
- `UserProfileScreen.tsx:801` — `onEndReachedThreshold={0.5}`

This is a P1 flagship defect: the scroll-edge detection contract is not systematised. A shared wrapper would enforce a single threshold, a single loading-footer treatment, a single empty-state treatment, and a single end-of-list state.

### Defect L2 — Inconsistent `ListEmptyComponent` coverage

`ListEmptyComponent` is wired in only ~15 of the 40+ list surfaces. Notable gaps:

- `HomeScreen.tsx` — no `ListEmptyComponent` on the main feed FlashList (line 1155). An empty feed relies on the `ListHeaderComponent` error banner path, but a true empty-feed state (no items, no error) is not rendered as a list empty component.
- `DiscoveryGrid.tsx:73` — `if (items.length === 0) return null;` — the grid silently disappears instead of showing an empty state. This is a dead-end violation (`Design.md` §Pinterest gate: "the user reaches a dead end").
- `RecommendationRail.tsx` / `SeenInLooksRail.tsx` — both `return null` on empty (`SeenInLooksRail.tsx:61`). Rails that vanish silently are acceptable *only* when the rail is a secondary module; a primary discovery rail that vanishes is a dead end.

### Defect L3 — Inconsistent `ListFooterComponent` loading state

The loading-more footer is inconsistent:

- `PinterestMasonryGrid.tsx:128-136` — correct: `ActivityIndicator` in a `paddingVertical: Space.md` container, only when `isLoadingMore`.
- `DiscoveryGrid.tsx:107-113` — correct but uses `hasMore` instead of `isLoadingMore`, so the spinner shows whenever there *might* be more, not only when fetching.
- `HomeScreen.tsx:1267` — has `ListFooterComponent` but the implementation is screen-local, not shared.
- `PortfolioScreen.tsx:846` — `ListFooterComponent={<View style={{ height: Space.xxl }} />}` — a spacer, not a loading indicator. No `isLoadingMore` state.
- Several screens (`MyOrdersScreen.tsx:569`, `FollowingScreen.tsx:243`, `FollowersScreen.tsx:243`) wire `ListFooterComponent` but with screen-local implementations.

### Defect L4 — Inconsistent separator grammar

`ItemSeparatorComponent` is used in ~15 surfaces with at least four different patterns:

- Vertical hairline: `PublicProfileConnectionsSheet.tsx:202` — `<View style={styles.rowDivider} />`
- Vertical space: `AuctionsScreen.tsx:783` — `<View style={{ height: Space.sm }} />`
- Horizontal space: `RecommendationRail.tsx:202` — `<View style={{ width: Space.sm }} />`
- Inline style objects: `DiscoveryGrid.tsx:102` — `<View style={{ height: Space.sm }} />` (inline, not memoised)

Inline separator components (`() => <View style={{ ... }} />`) create a new component identity on every render, which can cause FlashList to treat the separator as changed. The separator should be a stable, memoised component or a shared `ListSeparator` primitive. This is a P2 polish gap that compounds across the app.

### Defect L5 — `scrollToTop` coverage is partial

`useScrollToTop` is wired in only 5 screens:

- `HomeScreen.tsx:460`
- `BrowseScreen.tsx:424`
- `InboxScreen.tsx:149`
- `DiscoverScene.tsx:63`
- `MyProfileScreen.tsx:145`

Missing: `NotificationsScreen`, `UserProfileScreen`, `AuctionHomeScreen`, `ExploreScreen`, `FollowingScreen`, `FollowersScreen`, `MyOrdersScreen`, `MyBidsScreen`, `PortfolioScreen`, `MarketLedgerScreen`, `SyndicateHubScreen`, and every other list-heavy screen. This is a P1 flagship defect: tap-active-tab-to-scroll-to-top is expected native behaviour, and its absence on major list surfaces is immediately noticeable to native users.

### Defect L6 — Pull-to-refresh coverage is partial and inconsistent

`RefreshControl` is wired in ~10 screens, but with inconsistent `tintColor`/`colors`:

- `AuctionDetailScreen.tsx:813` — `refreshing={refreshing}` (no tint color specified → platform default)
- `UserProfileScreen.tsx:761` — `tintColor={MUTED} colors={[MUTED]}` (uses a local `MUTED` constant, not `colors.textMuted`)
- `NotificationsScreen.tsx:843` — `tintColor={colors.brand} colors={[colors.brand]}`
- `WalletTransactionHistory.tsx:185` — `tintColor={colors.brand}` (no `colors` array)
- `ResolutionCentreScreen.tsx:196` — `tintColor={colors.brand}`

The tint color should be a single token (`colors.textMuted` for subtle, `colors.brand` for emphasis) applied consistently. Several major list surfaces have no `refreshControl` at all: `HomeScreen.tsx` (the main feed — relies on a custom refresh path), `DiscoveryGrid.tsx`, `RecommendationRail.tsx`, `SeenInLooksRail.tsx` (rails are exempt, but the main feed is not). This is a P1 defect: "every screen that loads data should give an option to reload it" (kt.academy).

### Defect L7 — No end-of-list state

No surface renders an honest "you've reached the end" state. `onEndReached` fires, `isLoadingMore` shows a spinner, and then the spinner disappears silently when there is no more data. The user has no way to distinguish "loading" from "done." This violates the 2026 infinite-scroll contract ("an end-of-list state when applicable") and `Design.md` §state-coverage. This is a P1 defect on every infinite-scroll surface.

### Defect L8 — Masonry implementation is strong but not system-wide

`PinterestMasonryGrid.tsx` is a high-quality FlashList v2 masonry implementation: `masonry` prop, `numColumns`, stable `keyExtractor`, memoised `renderItem`, `overrideItemLayout` for future full-span units, `recyclingKey` on tiles, correct rejection of entrance animation, and a `MasonrySkeleton` with aspect-ratio parity. This is the best-in-codebase list component.

However, `LooksTab.tsx:333` re-implements the same FlashList masonry pattern independently (lines 333-349) rather than reusing `PinterestMasonryGrid`. The two implementations have diverged: `PinterestMasonryGrid` accepts a `refreshControl` prop and `testIDPrefix`; `LooksTab` wires `refreshControl` inline and has no testID support. This is a P2 DRY violation that should be resolved by making `PinterestMasonryGrid` the canonical masonry wrapper and having `LooksTab` consume it.

### Defect L9 — Horizontal rails are ad-hoc, not a system

Horizontal rails are implemented per-surface with no shared wrapper:

- `RecommendationRail.tsx:195-203` — FlashList `horizontal`, `ItemSeparatorComponent` inline, no snap.
- `SeenInLooksRail.tsx:86-94` — FlashList `horizontal`, `ItemSeparatorComponent` inline, no snap.
- `RelatedItemsRail.tsx:179` — FlashList `horizontal`, `ItemSeparatorComponent` inline, no snap.
- `CuratedCollectionsRail.tsx:71` — `snapToInterval={cardWidth + Space.sm}` (has snap).
- `HeroCarousel.tsx:145-158` — `pagingEnabled` + `snapToInterval={SCREEN_W}` (full-page carousel).
- `EditorialDiscoveryHero.tsx:127-135` — same full-page carousel pattern.
- `CoOwnMarketHighlightsCarousel.tsx:169-170` — `snapToInterval` + `snapToAlignment="start"`.

The snap behaviour is inconsistent: some rails snap, some don't. Some use `pagingEnabled`, some use `snapToInterval`. The `ItemSeparatorComponent` is always an inline arrow function. There is no shared `FlagshipRail` wrapper that enforces: (1) a consistent peeking-next-card affordance, (2) optional scroll-snap, (3) a stable memoised separator, (4) `showsHorizontalScrollIndicator={false}`, (5) accessibility (`role="region"`, `aria-label`). This is a P1 flagship defect for the rail system.

### Defect L10 — `SectionList` surfaces lack a shared wrapper

The 3 `SectionList` surfaces (`NotificationsScreen.tsx:833`, `WalletTransactionHistory.tsx:180`, `SellerAuctionCentreScreen.tsx:714`) each wire their own `renderSectionHeader`, `ItemSeparatorComponent`, `refreshControl`, and `ListEmptyComponent`. `NotificationsScreen.tsx:862-867` is the only one that tunes performance props (`removeClippedSubviews`, `windowSize={7}`, `maxToRenderPerBatch={6}`, `initialNumToRender={8}`). The other two use defaults. There is no shared `FlagshipSectionList` wrapper that enforces section-header styling, separator grammar, and performance tuning. This is a P2 defect.

### Defect L11 — No index bar / alphabetical quick-jump

No surface implements an index bar (alphabetical quick-jump sidebar, like iOS Contacts). This is acceptable for ThryftVerse's current information architecture (the app is media-first, not contact-list-first), but becomes relevant if/when a seller directory, follower list, or category browser grows beyond a few hundred items. Log as a future capability, not a current defect.

---

## 4. Micro Improvements — Per-List-Pattern Fixes

### Vertical list (feed, inbox, orders, bids, ledger)

- **Fix L1:** Introduce `FlagshipList` wrapper that accepts `data`, `renderItem`, `keyExtractor`, `onEndReached`, `hasMore`, `isLoadingMore`, `isRefreshing`, `onRefresh`, `emptyState`, `errorState`, and a `scrollRef` forwarding. The wrapper enforces `onEndReachedThreshold={0.5}`, a shared `ListFooterComponent` (spinner when `isLoadingMore`, "You're all caught up" when `!hasMore`), a shared `ListEmptyComponent`, a themed `RefreshControl` (`tintColor={colors.textMuted}`), and `useScrollToTop(ref)` wired automatically.
- **Fix L5:** Every screen using `FlagshipList` gets scroll-to-top for free.
- **Fix L6:** Every `FlagshipList` gets pull-to-refresh for free.
- **Fix L7:** The wrapper renders an end-of-list footer ("You've reached the end" / "No more results") when `!hasMore && !isLoadingMore && data.length > 0`.

### Masonry grid (discovery, explore, looks, boards)

- **Fix L8:** Make `PinterestMasonryGrid` the canonical masonry wrapper. `LooksTab` should consume it instead of re-implementing the FlashList masonry pattern. Add `ListEmptyComponent` and end-of-list support to `PinterestMasonryGrid`.
- **Fix L2:** `DiscoveryGrid.tsx:73` — replace `return null` with a `ListEmptyComponent` or delegate to the parent to render a discovery empty state. A silently vanishing grid is a dead end.

### Horizontal rail (recommendations, seen-in-looks, related items, curated collections)

- **Fix L9:** Introduce `FlagshipRail` wrapper that accepts `data`, `renderItem`, `keyExtractor`, `cardWidth`, `gap` (default `Space.sm`), `snap` (boolean, default `false` for rails, `true` for carousels), `ariaLabel`. The wrapper enforces: `horizontal`, `showsHorizontalScrollIndicator={false}`, a stable memoised `ItemSeparatorComponent` (`<View style={{ width: gap }} />`), optional `snapToInterval={cardWidth + gap}` + `snapToAlignment="start"`, and `accessibilityRole="region"` with the provided label.
- **Peek affordance:** The rail's `contentContainerStyle` should include horizontal padding that reveals a partial next card (~16-24pt peek) as the scroll cue.

### Carousel (hero, editorial, media gallery)

- Carousels are a specialised rail where `snap=true` and `pagingEnabled=true` (one card per stop). `HeroCarousel.tsx` and `EditorialDiscoveryHero.tsx` already implement this correctly. The `FlagshipRail` wrapper with a `mode="carousel"` variant can unify these.

### Sectioned list (notifications, wallet history, auction centre)

- **Fix L10:** Introduce `FlagshipSectionList` wrapper that accepts `sections`, `renderItem`, `renderSectionHeader`, `keyExtractor`, and the same state props as `FlagshipList`. The wrapper enforces section-header styling (eyebrow `Type.label` + optional count badge), `stickySectionHeadersEnabled` as a prop (default `false` for notifications, `true` for wallet), performance tuning (`removeClippedSubviews`, `windowSize={7}`, `maxToRenderPerBatch={6}`, `initialNumToRender={8}`), and shared empty/error/refresh.

### Index list (future)

- No current surface needs an index bar. If a seller directory or category browser exceeds ~200 items, introduce `FlagshipIndexList` with a `SectionList` + a floating alphabetical `LetterIndex` overlay that calls `scrollToLocation`. Log as a future capability.

---

## 5. Macro Improvements — The List System

### The list system contract

The flagship list system is four wrappers plus one carousel mode:

1. **`FlagshipList`** — vertical virtualized list (FlashList v2 under the hood). Owns: scroll-to-top, pull-to-refresh, loading-more footer, end-of-list footer, empty state, error state, separator, `onEndReachedThreshold`, performance tuning.
2. **`FlagshipMasonryGrid`** (evolved from `PinterestMasonryGrid`) — masonry grid (FlashList v2 `masonry`). Owns: column count from viewport width, gutter enforcement, aspect-ratio parity, skeleton, empty state, end-of-list, refresh, scroll-to-top.
3. **`FlagshipRail`** — horizontal rail (FlashList v2 `horizontal`). Owns: peek affordance, optional snap, stable separator, accessibility, `showsHorizontalScrollIndicator={false}`. `mode="carousel"` variant adds `pagingEnabled` + page dots.
4. **`FlagshipSectionList`** — sectioned list (RN `SectionList`). Owns: section-header styling, sticky-section toggle, performance tuning, shared state components.

All four wrappers consume a shared **`ListStateComponents`** module: `ListLoadingFooter`, `ListEndOfResults`, `ListEmptyState`, `ListErrorState`. This ensures state coverage is identical across every list surface.

### The scroll behavior contract

Every scrollable surface in ThryftVerse must define:

- **Momentum:** native physics, no JS-driven scroll simulation, no `scrollTo` during user gesture.
- **Snap:** horizontal rails may snap (`snapToInterval`); vertical feeds never snap (except modal page viewers); carousels page-snap.
- **Scroll-to-top:** `useScrollToTop(ref)` wired on every tab-level list surface. Tapping the active tab scrolls to offset 0 with `animated: true`.
- **Scroll-position restoration:** on focus/navigation-back, restore saved offset with `animated: false`. `UserProfileScreen.tsx:401` is the reference implementation.
- **Reduced motion:** all scroll animations respect `useReducedMotion()`. Scroll-to-top uses `animated: !reducedMotion`.
- **Content inset:** sticky docks never cover the last scroll item. `contentContainerStyle.paddingBottom` derives from `DockConstants` variant + safe-area inset, never a guessed spacer `View`.

### The list state contract

Every list surface must render one of these states, and only one at a time:

| State | Condition | Component |
|---|---|---|
| **initial-loading** | `isLoading && data.length === 0` | Skeleton matching final geometry |
| **populated** | `data.length > 0 && !error` | The list itself |
| **loading-more** | `isLoadingMore && data.length > 0` | `ListLoadingFooter` (spinner) in `ListFooterComponent` |
| **end-of-list** | `!hasMore && !isLoadingMore && data.length > 0` | `ListEndOfResults` ("You're all caught up" / "No more results") in `ListFooterComponent` |
| **empty** | `!isLoading && data.length === 0 && !error` | `ListEmptyState` (icon + title + subtitle + next action) |
| **error** | `error && data.length === 0` | `ListErrorState` (user-safe message + Retry) |
| **partial-error** | `error && data.length > 0` | Inline error banner above/within the list; data stays visible |
| **offline** | `isOffline` | `OfflineBanner` + retry; previously loaded data stays visible |

The 2026 pull-to-refresh rule is non-negotiable: **previously loaded data stays visible during refresh.** Skeletons/fullscreen loaders are for `initial-loading` only. Showing a skeleton during refresh is "punishing the user for refreshing" (kt.academy).

### The list item animation system

- **Recycling lists (FlashList v2):** no entrance animation. `enableEntranceAnimation` is silently ignored, as `PinterestMasonryGrid.tsx:34-39` already does. This is the correct behaviour.
- **Non-recycling lists (short `ScrollView`):** optional staggered fade-in (`Duration.fast`, opacity 0 → 1, translateY 8pt → 0), gated on `!useReducedMotion()`.
- **Item update animation:** press scale `0.97–0.985` on tappable items, never on the whole list.
- **Like/save feedback:** immediate, spring scale 1.2 → 1.0 over `Duration.fast`, haptic light. Reduced motion: simple fade to filled state.
- **Media load:** crossfade (`Duration.normal`), never pop. Skeleton matches exact final aspect ratio.

---

## 6. Flagship Acceptance Criteria

### Density target

- A normal list viewport exposes **4–6 useful rows** (`AGENTS.md` §4, `Design.md` §visual-geometry).
- A discovery viewport exposes at least **two meaningful media objects** or the beginning of the next module.
- Empty space supports focus; it does not compensate for oversized chrome.

### List state coverage

Every list surface renders all eight states from the list state contract (§5). A surface with only `populated` and `initial-loading` is not flagship. `empty`, `error`, `loading-more`, `end-of-list`, `partial-error`, and `offline` are all required.

### Scroll behavior

- **Momentum:** 60 FPS on mid-range Android, no blank cells, no layout shift.
- **Snap:** horizontal rails snap when `snap=true`; vertical feeds never snap.
- **Scroll-to-top:** `useScrollToTop` wired on every tab-level list surface.
- **Scroll-position restoration:** on focus/back, offset restored with `animated: false`.
- **Reduced motion:** all scroll animations respect `useReducedMotion()`.

### List item animation

- No entrance animation on recycling lists.
- Press scale 0.97–0.985 on tappable items.
- Media crossfade on load (`Duration.normal`), never pop.
- Like/save spring scale 1.2 → 1.0, haptic light, reduced-motion fade fallback.

### Separator grammar

- Vertical lists: hairline (`StyleSheet.hairlineWidth`) or `Space.sm` gap, never both.
- Masonry: `Space.sm` (8pt) gutter, no hairline.
- Horizontal rails: `Space.sm` (8pt) gap via stable memoised separator.
- Sectioned lists: hairline between items within a section; `Space.md`–`Space.lg` between sections.
- No inline `() => <View style={{ ... }} />` separators — use a stable component.

### Performance (virtualization, recycling)

- FlashList v2 for all lists > 20 items (`AGENTS.md` §16, `Design.md` §Native Platform Contract).
- Stable `keyExtractor` (stable string IDs, not array indices).
- Memoised `renderItem` (`useCallback`), memoised item component (`React.memo`).
- No inline objects/functions in `renderItem` (breaks `React.memo`).
- No `key` prop inside item nested components (degrades FlashList recycling).
- `overrideItemLayout` for full-span units in masonry/mixed feeds.
- `getItemType` for heterogeneous lists (multiple recycling pools).
- `removeClippedSubviews` + tuned `windowSize`/`maxToRenderPerBatch`/`initialNumToRender` for `SectionList`.
- Image `recyclingKey={item.id}` on recycled cells (already in `PinterestMasonryGrid`).
- No per-item service subscriptions or network calls inside the item component.

---

## 7. Priority & Sequencing

### Phase 1 — System primitives (P1, unblocks everything)

1. Build `ListStateComponents` module: `ListLoadingFooter`, `ListEndOfResults`, `ListEmptyState`, `ListErrorState`.
2. Build `FlagshipList` wrapper (vertical FlashList v2) with scroll-to-top, pull-to-refresh, loading-more, end-of-list, empty, error, separator.
3. Evolve `PinterestMasonryGrid` → `FlagshipMasonryGrid` (add end-of-list, ensure empty state, forward ref for scroll-to-top).
4. Build `FlagshipRail` wrapper (horizontal FlashList) with peek affordance, optional snap, stable separator, accessibility.
5. Build `FlagshipSectionList` wrapper with section-header styling, performance tuning, shared state components.

### Phase 2 — Screen migration (P1, surface-by-surface)

6. Migrate `HomeScreen.tsx` main feed to `FlagshipList` (or `FlagshipMasonryGrid` if masonry). Wire `useScrollToTop` (already present). Add end-of-list state.
7. Migrate `NotificationsScreen.tsx` to `FlagshipSectionList`. Wire `useScrollToTop`.
8. Migrate `UserProfileScreen.tsx` grid to `FlagshipMasonryGrid` or `FlagshipList`. Preserve existing scroll-position restoration (`UserProfileScreen.tsx:401`).
9. Migrate `MyOrdersScreen`, `MyBidsScreen`, `FollowingScreen`, `FollowersScreen`, `MarketLedgerScreen`, `SyndicateOrderHistoryScreen`, `PortfolioScreen` to `FlagshipList`.
10. Migrate `WalletTransactionHistory.tsx` to `FlagshipSectionList`.
11. Migrate `SellerAuctionCentreScreen.tsx` to `FlagshipSectionList`.
12. Migrate `RecommendationRail`, `SeenInLooksRail`, `RelatedItemsRail`, `CuratedCollectionsRail` to `FlagshipRail`.
13. Migrate `LooksTab.tsx` to consume `FlagshipMasonryGrid` (remove the duplicate FlashList masonry at `LooksTab.tsx:333`).

### Phase 3 — Polish (P2)

14. Standardise `RefreshControl` tint color to `colors.textMuted` across all surfaces.
15. Replace all inline `ItemSeparatorComponent` arrow functions with a stable `ListSeparator` component.
16. Add `useScrollToTop` to remaining tab-level list surfaces (`AuctionHomeScreen`, `ExploreScreen`, `NotificationsScreen`, etc.).
17. Add end-of-list state to every infinite-scroll surface.
18. Add `accessibilityRole="region"` + `aria-label` to every horizontal rail.
19. Add `accessibilityLiveRegion="polite"` announcement for end-of-list state.

### Phase 4 — Future capabilities (P3, log only)

20. `FlagshipIndexList` for seller directory / category browser if/when needed.
21. Anchored infinite scroll (cursor in navigation state) for very long feeds.
22. "Load more" explicit button alternative for accessibility on infinite feeds.

---

## 8. Token-Level Spec Table

| Pattern | Item spacing | Separator | Animation | Scroll behavior | State components |
|---|---|---|---|---|---|
| **Vertical list** (feed, inbox, orders) | `Space.sm`–`Space.md` between rows | Hairline (`StyleSheet.hairlineWidth`) OR `Space.sm` gap; stable memoised component | No entrance animation (recycling); press scale 0.97–0.985 on rows; media crossfade `Duration.normal` | Native momentum; no snap; `useScrollToTop`; scroll-position restoration on focus; `onEndReachedThreshold={0.5}`; `contentContainerStyle.paddingBottom` from `DockConstants` + safe area | Skeleton (initial) → populated → `ListLoadingFooter` (loading-more) → `ListEndOfResults` (end) → `ListEmptyState` (empty) → `ListErrorState` (error) → `OfflineBanner` (offline) |
| **Masonry grid** (discovery, explore, looks, boards) | `Space.sm` (8pt) row/column gutters | No hairline; gutter only | No entrance animation (recycling); press scale 0.97–0.985 on tiles; media crossfade `Duration.normal`; skeleton aspect-ratio parity | Native momentum; no snap; `useScrollToTop`; `onEndReachedThreshold={0.5}`; `numColumns` from viewport width (2 phone, 3+ tablet from min card width) | `MasonrySkeleton` (initial) → populated → `ListLoadingFooter` → `ListEndOfResults` → `ListEmptyState` (icon + "Nothing here yet" + next action) → `ListErrorState` |
| **Horizontal rail** (recommendations, seen-in-looks, related items) | `Space.sm` (8pt) between cards | `Space.sm` gap via stable memoised `ListSeparator`; no hairline | Press scale 0.97–0.985 on cards; media crossfade `Duration.normal`; no entrance animation | Native momentum; optional `snapToInterval={cardWidth + gap}` + `snapToAlignment="start"`; `showsHorizontalScrollIndicator={false}`; peek next card (~16-24pt); `accessibilityRole="region"` + `aria-label` | No list-level empty state (rail returns null if empty and is a secondary module); if rail is primary, `ListEmptyState` |
| **Carousel** (hero, editorial, media gallery) | `Space.sm` between cards or full-page | `snapToInterval={SCREEN_W}` or `pagingEnabled`; page dots (`role="tablist"`, `aria-live="polite"`) | Press scale 0.97–0.985; media crossfade; page-dot active state transition `Duration.fast` | `pagingEnabled` + `snapToAlignment="center"`; `showsHorizontalScrollIndicator={false}`; `accessibilityRole="region"` + `aria-label` + `aria-live="polite"` | Page dots track position; no list-level empty/error (carousel is always populated or not rendered) |
| **Sectioned list** (notifications, wallet history, auction centre) | `Space.sm` within section; `Space.md`–`Space.lg` between sections | Hairline within section; `Space.md`–`Space.lg` between sections; stable memoised component | No entrance animation (recycling); press scale 0.97–0.985 on rows; section-header fade on sticky | Native momentum; `stickySectionHeadersEnabled` (prop, default per surface); `useScrollToTop`; `removeClippedSubviews` + `windowSize={7}` + `maxToRenderPerBatch={6}` + `initialNumToRender={8}` | Skeleton (initial) → populated → `ListLoadingFooter` → `ListEndOfResults` → `ListEmptyState` → `ListErrorState`; section header = `Type.label` eyebrow + optional count badge |
| **Index list** (future: seller directory, category browser) | `Space.sm` within section; `Space.lg` between sections | Hairline within section; `Space.lg` between sections | No entrance animation; press scale 0.97–0.985 | Native momentum; `stickySectionHeadersEnabled`; floating `LetterIndex` overlay → `scrollToLocation`; `useScrollToTop` | Same as sectioned list + `LetterIndex` active-letter highlight |

---

## 9. Reference Implementation Pointers

The following files are the strongest existing implementations and should be the reference points for the wrapper system:

- **`PinterestMasonryGrid.tsx`** (lines 65-183) — the canonical masonry wrapper. Correct recycling contract, correct rejection of entrance animation, correct skeleton/empty fallback, correct `overrideItemLayout` for future full-span units. Evolve this into `FlagshipMasonryGrid`.
- **`HomeScreen.tsx`** (lines 1155-1179) — the most complex FlashList in the app (`numColumns=2`, `getItemType`, `overrideItemLayout` for full-span posters/looks, viewability-based playback, `onEndReached`). Reference for heterogeneous-feed architecture.
- **`NotificationsScreen.tsx`** (lines 833-867) — the strongest `SectionList` implementation (tuned performance props, section headers with count badges, `refreshControl`, `onEndReached`, `ListEmptyComponent`). Reference for `FlagshipSectionList`.
- **`UserProfileScreen.tsx`** (lines 401, 420) — the only screen with explicit scroll-position restoration. Reference for the scroll-position-memory contract.
- **`HeroCarousel.tsx`** (lines 145-158) — the canonical full-page carousel (`pagingEnabled` + `snapToInterval={SCREEN_W}`). Reference for `FlagshipRail` carousel mode.

---

## 10. Sources

- Shopify Engineering, "FlashList v2: A ground-up rewrite for React Native's New Architecture" — https://shopify.engineering/flashlist-v2
- Shopify/flash-list, GitHub README — https://github.com/Shopify/flash-list/
- Shopify/flash-list, "Performant Components" — https://github.com/Shopify/flash-list/blob/main/documentation/docs/fundamentals/performant-components.md
- React Native Relay, "FlashList v2 Migration Guide: Expo 2026" — https://reactnativerelay.com/article/react-native-flashlist-v2-expo-high-performance-lists-migration
- John Hambardzumian, "React Native Performance: List Views and Re-renders" — https://hambardzumian.com/blog/react-native-performance-list-views
- John Hambardzumian, "FlashList vs FlatList: React Native Lists" — https://hambardzumian.com/blog/react-native-flashlist-recycling-flatlist-performance
- vinicius.io, "React Native Lists - Treat Them as a Performance Subsystem, Not a Component" — https://vinicius.io/blog/react-native-lists-treat-them-as-a-performance-subsystem-not-a-component/
- OneUptime, "How to Implement FlatList Optimization for Large Lists in React Native" (2026-01-15) — https://oneuptime.com/blog/post/2026-01-15-react-native-flatlist-optimization/view
- React Native docs, "Optimizing FlatList Configuration" — https://reactnative.dev/docs/optimizing-flatlist-configuration
- React Native docs, "SectionList" — https://reactnative.dev/docs/sectionlist
- GenDesigns, "Mobile UI Patterns 2026: 19 Patterns and When to Use Them" — https://gendesigns.ai/blog/mobile-ui-patterns-2026
- kt.academy, "How to correctly implement Pull-to-refresh on mobile" — https://kt.academy/article/pull-to-refresh
- cr0x.net, "Pagination vs Infinite Scroll: UI Patterns That Don't Annoy Users" — https://cr0x.net/en/pagination-vs-infinite-scroll/
- Sujeet Jaiswal, "Design an Infinite Feed" — https://sujeet.pro/articles/design-infinite-feed
- VP0 Journal, "Build Infinite Scroll in React Native with TanStack Query" — https://vp0.com/blogs/tanstack-query-infinite-scroll-ui-react-native-free-ios-template-vibe-coding-gui
- VP0 Journal, "Pinterest App Design Inspiration: The Masonry Feed" — https://vp0.com/blogs/pinterest-app-design-inspiration
- Frontend Interviews, "Design Pinterest (Masonry Feed, Infinite Scroll)" — https://frontendinterviews.dev/frontend-system-design/pinterest
- techinterview, "Frontend System Design: Build a Pinterest-Style Infinite Grid" — https://www.techinterview.org/post/3233475025/frontend-system-design-pinterest-grid/
- InterviewLane, "How would you design a product like Pinterest?" — https://interviewlane.com/questions/design-a-product-like-pinterest
- That HTML Blog, "Masonry Layout Solved! Hello CSS Grid Lanes" (2026-04) — https://thathtml.blog/2026/04/masonry-now-css-grid-lanes/
- Richard Lemon, "Scroll-snap in 2026: when it helps vs hurts UX" — https://richardlemon.com/scroll-snap-2026-right-call-vs-fights-user/
- Chrome for Developers, "Make accessible carousels" — https://developer.chrome.com/blog/accessible-carousel
- lirunning, "How to Plan Mobile Carousels That Help Users Browse, Compare, and Discover" — https://lirunning.com/how-to-plan-mobile-carousels/
- Interface Lab, "Horizontal Portfolio Rail" — https://www.interfacelab.design/en/skills/horizontal-portfolio-rail
- CodeFronts, "Mobile Horizontal Swipe Carousel" — https://codefronts.com/components/css-pricing-tables/mobile-horizontal-swipe-carousel/
- React Navigation docs, "useScrollToTop" — https://reactnavigation.org/docs/use-scroll-to-top
- Filip Němeček, "Implementing double tap tab bar to scroll to top" — https://nemecek.be/blog/185/implementing-double-tap-tab-bar-to-scroll-to-top
- Swift Discovery, "How to tap again on tab bar item to scroll top in iOS" — https://onmyway133.com/posts/how-to-tap-again-on-tab-bar-item-to-scroll-top-in-ios/
- Coder Legion, "Preserving Scroll Position and Cursor State During Navigation Transitions" — https://coderlegion.com/10439/preserving-scroll-position-and-cursor-state-during-navigation-transitions
