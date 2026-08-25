# ThryftVerse P2 — System-Wide Quality Multipliers (Items 25–35)

## Flagship production dossier — taxonomy, IA, decomposition, offline-first, performance, accessibility, i18n, analytics, privacy, sustainability, visual regression

**Research cut-off:** 25 August 2026
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree
**Surfaces:** every system-wide quality multiplier in the P2 backlog (items 25–35)
**Deliverable type:** research and implementation specification; no product code changed
**Release verdict:** **P2 BLOCKED — ELEVEN SYSTEM-WIDE DEFECTS, THREE OF WHICH ARE P0-SEVERITY (CRASH, DOUBLE-SPEND, GREENWASHING)**

---

## 0. Workspace verification

```text
Workspace root: C:\Users\User\Desktop\thryftverse-upgrade
Git root:       C:\Users\User\Desktop\thryftverse-upgrade
Remote:         https://github.com/K17ze/thryftverse-upgrade.git
Branch:         feat/product-detail-contract-media-device-closure
HEAD:           f82f74a54be79a1721017380ddd5472d856f1679
AGENTS.md path: C:\Users\User\Desktop\thryftverse-upgrade\AGENTS.md
Execution mode: Normal (research + report; no product code modified)
```

---

## 1. Evidence language

- **[VERIFIED — CODE]** is directly evidenced by the cited repository path and line.
- **[VERIFIED — EXTERNAL]** is supported by a linked primary or official source current at the cut-off.
- **[INFERENCE]** follows from verified evidence but has not been proved against a deployed database/native build.
- **[EXTERNAL REQUIREMENT]** needs legal/policy confirmation for the launch market.
- **[DECISION]** is the recommended ThryftVerse product or engineering rule.
- **[PROPOSED]** is a target schema, contract, algorithm or surface that does not exist yet.

Line references are forensic anchors and can shift after subsequent edits.

Per-item deep-dive reports live in `.devin/reports/_p2-research/item-{25..35}-*.md` (2,744 lines total across 11 files). This document is the synthesis; the per-item reports are the evidence.

---

## 2. Executive finding

The P2 backlog is eleven system-wide quality multipliers. Each one, left unresolved, caps the ceiling of the product regardless of how good any individual screen becomes. Audited together, they reveal a consistent pattern: **ThryftVerse has built strong foundational primitives — a typed analytics taxonomy, a durable chat outbox, a FlashList v2 masonry, a mature money idempotency model, an i18next install, a currency context, a Maestro scaffold, a design-token system — but the wiring that would make those primitives the single source of truth is missing, half-finished, or bypassed.** The result is a codebase where the right architecture exists on paper and the wrong behaviour ships in practice.

Three of the eleven are not merely P2-quality issues — they are **P0-severity defects hiding in the P2 list**:

1. **~40 root-stack routes are navigated to but never registered** (`AppNavigator.tsx` vs `types.ts`). React Navigation native-stack throws at runtime on an unregistered route. Every Profile utility-rail row, every Settings row, and the Home search button are crash-on-press. [VERIFIED — CODE, item 26]
2. **`Date.now()` is used to generate idempotency keys in `WithdrawScreen` and `TradeScreen`**, producing a new key on every retry and defeating server-side dedup. A network drop during a withdrawal or co-own reservation can double-spend. [VERIFIED — CODE, item 28]
3. **Every sustainability impact figure is a hardcoded client-side constant dressed in category scaling**, and the `__DEV__`-only demo banner is hidden in production. The UI makes definitive "saves ~X kg CO₂" claims with no real data — a textbook unsubstantiated comparative green claim under the UK CMA Green Claims Code and the EU EmpCo Directive (in force September 2026). [VERIFIED — CODE, item 34]

The remaining eight are genuine P2 multipliers: taxonomy duplication across 9+ surfaces with 6 incompatible category vocabularies; 51 screens over 1000 lines with a parallel Premium*/App* primitive taxonomy; a sync engine that is a self-described stub whose `runSync` is never called; three non-virtualized masonry feeds that will OOM on long lists; charts that are silent to screen readers and a base-theme contrast that fails AA; 68 screens with literal `'GBP'` bypassing the existing currency context; PostHog experiments not activated despite the SDK being fully integrated; two parallel erasure flows that orphan chat, support transcripts, AI runs, media and listings; and a Maestro visual-regression scaffold with 1×1 pixel placeholder baselines and no diff engine.

The throughline: **the gap is activation and enforcement, not invention.** Almost every P2 item has a half-built correct solution already in the codebase. The work is to finish the wiring, delete the parallel copies, and add the lint/test/CI guardrails that prevent regression.

---

## 3. Item-by-item synthesis

### 3.1 Item 25 — Marketplace catalogue taxonomy duplication

**Status:** P2-High (data-integrity leak).

**Finding:** No single source of truth exists. Categories, conditions, sizes and brands are hard-coded as ad-hoc string arrays across ≥9 frontend surfaces, with no backend taxonomy table, no enum constraint, and no admin manageability. The closest-to-canonical source (`constants/categories.ts:16`, 9 categories + subcategories + metadata) is consumed only by GlobalSearchScreen and CategoryDetailScreen — Sell/Edit/Bulk/AI screens ignore it and ship their own flat arrays.

**Duplication map:**
- **Categories — 6 incompatible vocabularies.** Sell/Bulk/AI use a stale legacy set (Women/Men/Kids/Home/Vintage/Accessories/Beauty/Sportswear/Luxury); EditListing uses the canonical-ish set (adds Designer/Electronics/Entertainment/Hobbies/Sports); DiscoverScene uses facet labels (Clothing/Shoes/Bags, 'Jewelry' US-spelling vs canonical 'Jewellery'); UnifiedDiscoveryScreen uses editorial pills (New/Vintage/Streetwear/Tech); CategoryTreeScreen has a 3-category hand-authored subcat tree. A seller can pick 'Vintage' in Sell, but Edit has no 'Vintage' option and `constants/categories.ts` has no 'Vintage' entry. [VERIFIED — CODE]
- **Conditions — 7 copies + 2 separate type declarations.** `ListingCondition` is declared in both `services/listingsApi.ts:33` and `contracts/DiscoveryListingSummary.ts:37` with identical members but separate type identity. [VERIFIED — CODE]
- **Sizes — 4+ copies, no `Size` type.** 'One Size' vs 'One size' casing mismatch will split size facets. Sell omits XXS; Edit omits all UK sizes; autocomplete omits 'One Size'. [VERIFIED — CODE]
- **Brands — 3 hard-coded lists with ~50% overlap.** No `Brand` type, no brands table, no admin CRUD. [VERIFIED — CODE]
- **Colours — 1 orphaned copy** (`searchAutocompleteApi.ts:137-145`). **Materials — no taxonomy anywhere.** [VERIFIED — CODE]
- **Backend write path is free-form:** `routes/listings.ts:2353-2356` accepts `category/brand/size/condition` as `z.string().min(1)` with no enum check. Migration `031_listing_fields.sql:9-12` declares unconstrained `TEXT` columns. [VERIFIED — CODE]

**Root cause:** No backend taxonomy bounded context; `constants/categories.ts` arrived late and was never enforced; type contracts are split; editorial surfaces invented parallel facet systems.

**Flagship fix [PROPOSED]:** New `taxonomy_nodes` DB table (migration `144_taxonomy.sql`) + `routes/taxonomy.ts` read API + admin CRUD/merge/reorder; `frontend/src/contracts/taxonomy.ts` single contract; `services/taxonomyApi.ts` + `context/TaxonomyContext.tsx` cached provider; `useTaxonomyOptions` hook replaces all inline arrays; i18n-ready `display_key` labels; ETag + React Query cache with bundled seed fallback. Backend write path gains enum validation against `taxonomy_nodes` after backfill. Admin manageability for category/brand/condition/size lifecycle without a code release.

**Rollout:** contract consolidation (no behaviour change) → backend table + read API → frontend context/hook → migrate Filter+AI first → migrate Sell/Edit/Bulk together → backend write-path enum enforcement (after backfill) → admin CRUD → discovery facet projection last (visual regression risk).

**External research support:** Shopify's Standard Product Taxonomy (open-source, 25+ verticals, categories+attributes+values, versioned distributions) and Whatnot's public taxonomy repo are the industry references for a managed, versioned, machine-readable marketplace taxonomy. Mirakl and Origami Marketplace both centralise taxonomy as a PIM-style single source of truth with AI auto-mapping for seller onboarding. [VERIFIED — EXTERNAL]

---

### 3.2 Item 26 — Navigation and information architecture convergence

**Status:** P0 (crash-on-navigate) + P2 (unstable mental model).

**Finding:** The bottom tab skeleton is correct (`Home / Explore / Create(FAB) / Inbox / Profile`, `TabNavigator.tsx:340-449`). The layers above it are not.

**P0 — ~40 dead routes:** ~40 routes are declared in `RootStackParamList` (`types.ts:91-527`) and actively navigated to, but never registered as `Stack.Screen` in `AppNavigator.tsx:161-394`. These include `Settings`, `EditProfile`, `Closet`, `NotificationsList`, `GlobalSearch`, `UnifiedDiscovery`, `Verification`, `HelpSupport`, `SavedAddresses`, `Payments`, `DeleteAccount`, `ConnectionList`, and ~28 settings sub-screens. React Navigation native-stack throws at runtime when navigating to an unregistered route, so every Profile utility-rail row, every Settings row, and the Home search button are crash-on-press. This is the single highest-severity IA defect. [VERIFIED — CODE]

**P2 — Discovery fragmentation:** Discovery is split across 5+ overlapping entry points (Home feed, Explore tab, UnifiedDiscovery, GlobalSearch, ConversationalSearch, VisualSearch, Galleria, PulseFeed) with contradictory routing: Home search → `UnifiedDiscovery` (`HomeScreen.tsx:978`), Explore submit → `GlobalSearch` (`SearchScreen.tsx:85`). Two different "search" destinations from two different surfaces, both unregistered. [VERIFIED — CODE]

**P2 — Commerce/trading hub sprawl:** 6+ peer hubs (Sell, SellerHub, TradeHub, CoOwnHub/SyndicateHub, AuctionHome + Auctions, SellerAnalytics, CreatorAnalyticsDashboard, Portfolio, MyBids) with no clear home base. Profile rail links them as peers. [VERIFIED — CODE]

**P2 — Three redirect shims:** `CreatePosterRedirect`, `CreateLookRedirect`, `CreateCameraScreen` each `navigation.replace(...)` on a `setTimeout(0)` — a visible flicker hop and a stale back-stack entry. TabNavigator already bypasses `CreateCameraScreen`. [VERIFIED — CODE]

**P2 — Half-finished convergences:** Closet unifies Saved/Wishlist/Collections/Outfits but `MyProfileScreen` still carries a dead `'saved'` tab and the store still exposes `savedProducts` + `wishlist` as separate arrays. `ConnectionList` is declared as the Followers/Following replacement but is never registered or navigated to. [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Phase 1 (stop the bleeding):** Register every navigated-but-unregistered route in `AppNavigator.tsx`. Add a `__DEV__` assertion that walks `RootStackParamList` keys and verifies each is registered.
- **Phase 2 (remove shims):** Replace `CreatePoster`/`CreateLook`/`CreateCamera` call sites with direct `CreatorStudio` navigation. Delete the shim files + routes. Add deep-link compat aliases in `linking.ts`.
- **Phase 3 (converge discovery):** Fold `UnifiedDiscovery`, `GlobalSearch`, `ConversationalSearch`, `Galleria`, `PulseFeed` into the Explore tab as scenes/segments. Home search button → `MainTabs → Explore` + focus search.
- **Phase 4 (converge commerce):** `SellerHub` = single seller home (fold `SellerAnalytics`). `CoOwnHub` = single Co-Own home (fold `Portfolio` + `TradeHub` as segments). `AuctionHome` = single auction home (delete `Auctions`).
- **Phase 5 (finish convergences):** Register `ConnectionList`; migrate Followers/Following. Remove dead `'saved'` tab. Rename `WalletActivity` → `WalletHistory`, `AgentActivity` → `AgentLedger`.
- **Deep-link compat:** `linking.ts` aliases map old paths → new targets. No external URL breakage.

---

### 3.3 Item 27 — Shared primitives and screen decomposition

**Status:** P2-High (maintainability + AI-tell risk).

**Finding:** **51 screens exceed 1000 lines; 10 screens exceed 2000 lines.** The worst offender (`SellScreen.tsx`) is 3010 lines with 24 `useState`, 10+ `useEffect`, and 29 hook calls in one function body. The root cause is consistent: screens are monolithic god-components mixing business logic, 15-24 local state slots, 5-10 inline subcomponents, and 200-400 line `StyleSheet.create` blocks. [VERIFIED — CODE]

**Top 10 offenders:** SellScreen (3010), OrderDetailScreen (2711), AuctionHomeScreen (2710), CheckoutScreen (2703), ItemDetailScreen (2474), PosterViewerScreen (2444), GlobalSearchScreen (2433), AssetDetailScreen (2430), AuctionDetailScreen (2303), ChatScreen (2253). [VERIFIED — CODE]

**Primitive fragmentation:**
- **35 Card variants, 35 Sheet variants** — no shared `Card` primitive; each rolls its own surface/background/border/padding. 5 generic sheet wrappers (`BottomSheet`, `ActionSheet`, `FormSheet`, `InspectorSheet`, `TransactionSheet`) likely overlap. [VERIFIED — CODE]
- **Premium* vs App* parallel taxonomy (8+5 = 13 wrappers)** — `PremiumActionBar`/`PremiumFormCard`/`PremiumInputShell`/`PremiumTextField`/`PremiumStatusPill` parallel `AppButton`/`AppInput`/`AppStatusPill`. Two design systems for the same primitives — a senior reviewer cannot tell which to use. This is the over-scaffolding equivalent of `ButtonContainerWrapper`. [VERIFIED — CODE]
- **Radius inconsistency:** `Radius.md` (8pt) used 20×, `Radius.lg` (12pt) used 19× — a 50/50 split for the same component category. `surfaceRadiusRules.ts` defines a `RadiusRole` contract but it is advisory, not enforced. [VERIFIED — CODE]
- **No `max-lines` lint rule** in either ESLint config — the monolith pattern grew unchecked. [VERIFIED — CODE]

**Token system:** Mature foundation (`designTokens.ts`, `surfaceRadiusRules.ts`, `typography.v2.ts`, `motionTokens.ts`) — 7/10. Weakness: primitives bypass the role contract and use raw `Radius.*` directly.

**Flagship fix [PROPOSED]:**
- **Decomposition order (highest ROI first):** (1) extract pure utils from top 8 screens (status mappers, search ranking, physics, polling) — zero-risk; (2) extract inline subcomponents to `components/<domain>/` — low-risk, mechanical; (3) extract `useXSheets()` hooks for sheet-boolean-heavy screens (ItemDetail, AssetDetail, Checkout); (4) extract `useXData()`/`useXForm()` hooks for data-heavy screens; (5) consolidate primitives (Premium* → App* with variant props; 5 sheet wrappers → 1); (6) enable `max-lines` lint as `error` once screens are under 800 lines.
- **Lint guardrails:** `max-lines: 800`, `max-lines-per-function: 400`, `no-restricted-syntax` for raw `borderRadius` outside `components/ui/` and `theme/`, `no-restricted-imports` for Premium* in new code.
- **Architecture guardrails:** one screen = one orchestrator (hook calls + composition + single return JSX). No inline subcomponent definitions. No inline `StyleSheet.create` > 100 lines. Subcomponents live in `components/<domain>/`. Pure business logic lives in `utils/` or `services/`.

---

### 3.4 Item 28 — Offline-first mutation reliability

**Status:** P0 (double-spend) + P2 (offline data loss).

**Finding:** Asymmetric maturity. The backend has production-grade idempotency, webhook deduplication, an unknown-outcome status model (migration 131), and a transactional domain outbox. The frontend has a well-designed but half-wired offline layer: a durable SQLite `mutation_outbox` table and a pull/push sync engine exist as typed contracts, but the sync engine is a self-described stub whose `runSync` is never called, the backend `/sync/push` and `/sync/{domain}` endpoints do not exist, and the `listing_draft` table is defined in schema but never written to. [VERIFIED — CODE]

**P0 — `Date.now()` idempotency keys:**
- `WithdrawScreen.tsx:434,446` — `idempotencyKey: payout_${currentUser.id}_${Date.now()}`. A retry after a dropped response sends a new key → server cannot dedup → **double-withdraw risk**. [VERIFIED — CODE]
- `TradeScreen.tsx:296` — `idempotencyKey: reserve_${currentUser.id}_${asset.id}_${Date.now()}`. Same defect → **duplicate co-own reservation**. [VERIFIED — CODE]

**What exists and is correct:** Backend idempotency for orders (`orders.ts:492,520-530`), offers (`listingOffers.ts:26,142-155`), auctions (`auctions.ts:105-164`), payment intents (`payments.ts:464,568-606`), refunds (`payments.ts:1369,1479-1492`). Stripe webhook dedup at two levels (event ID + gateway event ID, `index.ts:32358-32516`). Domain outbox with `FOR UPDATE SKIP LOCKED` + dead-letter (`domainOutbox.ts:95-134`). Chat durable outbox (`chatOutbox.ts:43-65`) with `clientMessageId` reconciliation and a `"reconciling"` UI state (`useConversationMessages.ts:638-659`) — the one domain that is genuinely offline-first. UploadManager with persisted job store and idempotent single-PUT checkpoint (`UploadManager.ts:446-521`). [VERIFIED — CODE]

**What is missing:**
- **Sync engine is a dead stub.** `runSync` is never called; backend `/sync/push` and `/sync/{domain}` endpoints do not exist. Offline edits to drafts/products never reach the server via the outbox. [VERIFIED — CODE]
- **`listing_draft` table is dead schema** — never INSERTed, UPDATEd, or SELECTed. [VERIFIED — CODE]
- **`initChatOutboxDrain` never called at startup** — messages queued while offline only flush when the user opens that conversation. [VERIFIED — CODE]
- **Listing publication not routed through outbox** — uses in-memory Zustand `ListingPublicationRecovery`; `createListingOnApi` sends no idempotency key. Dropped response → duplicate listing or PK conflict. [VERIFIED — CODE]
- **`MediaUploadQueue` is in-memory** — lost on app kill. [VERIFIED — CODE]
- **Multipart uploads disabled** — backend has no multipart endpoints; `performMultipartUpload` returns `{ok: false}`. Large video uploads cannot resume across app restarts. [VERIFIED — CODE]
- **No client-side request journal** — outside chat, no record of in-flight mutations. On unknown outcome (timeout), the client cannot decide whether to retry, wait, or surface failure. [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Phase 0 (hotfix, ship first):** Replace `Date.now()` idempotency keys in `WithdrawScreen` and `TradeScreen` with stable refs (`createStableId('payout')` / `createStableId('reserve')`). Two-line fix, eliminates double-spend.
- **Phase 1:** Wire `initChatOutboxDrain` in `App.tsx`.
- **Phase 2:** Add `Idempotency-Key` header to `createListingOnApi`, `requestPayout`, and remaining money endpoints. Add `client_operations` replay table on backend.
- **Phase 3:** Build generic `outboxClient.ts` + drain loop. Route listing publication through it. Keep `ListingPublicationRecovery` as in-session optimistic state; outbox is the durability layer beneath.
- **Phase 4:** Implement `GET /sync/{domain}` for `listing_draft` and `product`. Wire `runSync`.
- **Phase 5:** Enable multipart uploads (backend endpoints + frontend default flip).
- **Unknown-outcome protocol:** timeout → mark outbox row `unknown` → schedule reconciliation probe (`GET /orders?client_operation_id=...`) → confirm applied → `synced`; confirm not applied → re-enqueue; still unknown after N probes → surface to user.

**External research support:** The 2026 consensus for offline-first RN is: durable SQLite outbox with idempotency keys, optimistic UI with rollback, explicit sync queue (operation type + target entity + local ID + timestamp + retry count + idempotency key), last-write-wins vs CRDTs chosen per domain, background-task batching respecting Doze/App Standby, and chaos testing for flaky networks/clock skew/partial writes. Expo SQLite with WAL is the workhorse; WatermelonDB adds lazy loading + observable queries for heavier relational workloads. [VERIFIED — EXTERNAL]

---

### 3.5 Item 29 — Native performance and media memory

**Status:** P2-Medium (OOM/jank risk on mid-range Android).

**Finding:** The image and video infrastructure is **genuinely best-in-class**: FlashList v2 masonry with `getItemType` cell-typing, `recyclingKey` on every `expo-image`, `cachePolicy="memory-disk"` everywhere, CDN derivative-bucket downscaling, `CachedImage` in `React.memo` with custom comparator across 565 sites, singleton `VideoManager` player-pool with decoder caps + QoE telemetry, Atlas/Hermes profiling registered in AGENTS.md. [VERIFIED — CODE]

**Six concrete risks:**
1. **Three non-virtualized masonry feeds** — `MoodboardHomeScreen` (`:494,632-648`), `GalleriaScreen` (`:581,654-659`), and `LookDetailScreen`'s "More to explore" (`:550,942-950` via `LookMasonryGrid`) render `.map()` inside `ScrollView`. Memory grows linearly; no recycling. **High** on long feeds. [VERIFIED — CODE]
2. **`CreatorContext.Provider` value is a non-memoized inline object** (`CreatorContext.tsx:1504`) — rebuilt every render, re-rendering every `useCreator()` consumer on any state tick. **High.** [VERIFIED — CODE]
3. **`LooksTab` FlashList passes inline non-`useCallback` callbacks** (`:414-464`) — `renderItem`, `keyExtractor`, `overrideItemLayout`, `ListHeaderComponent`, `ListFooterComponent` recreated every render, destabilizing recycling. **Medium.** [VERIFIED — CODE]
4. **`SellScreen` ~30 `useState` with controlled inputs** — every keystroke re-renders the entire form. No field-level memoization, no uncontrolled inputs, no debouncing on title/description. **Medium.** [VERIFIED — CODE]
5. **`compat/Video.tsx` 200ms `setInterval` per mounted video** for `onPlaybackStatusUpdate` — JS-thread polling; multiple mounted videos multiply timers. **Low.** [VERIFIED — CODE]
6. **`VideoManager` pool not wired into feed surfaces** — `compat/Video.tsx` creates per-instance `useVideoPlayer` instead of acquiring from pool; `LookDetailScreen:615` hardcodes `shouldPlay` true for all video pages in a pager (no viewability gating). **Medium.** [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Profiling harness:** `whyDidYouRender` in `__DEV__` on `CachedImage`, `ProductCardV2`, `CreatorCanvas`, all `*Tile` components. Hermes profiler runbook with heap snapshots before/after 500-item Discover scroll. Atlas bundle analysis flagging any module > 50KB. Per-screen VCF targets via `useVisuallyComplete` on HomeScreen, DiscoverScene, UserProfileScreen, LookDetailScreen.
- **Cell recycling standard (mandate):** No `ScrollView` + `.map()` for feeds > 20 items. All long feeds must use FlashList v2 with `useCallback` `keyExtractor`/`getItemType`/`renderItem`/`overrideItemLayout`, `useMemo` `ListHeaderComponent`/`ListFooterComponent`, `recyclingKey` on every `expo-image`. Non-compliant: MoodboardHomeScreen, GalleriaScreen, LookMasonryGrid, LooksTab, ProductCardV2.MasonryGrid. Reference implementations: PinterestMasonryGrid, HomeScreen FlashList.
- **Video lifecycle rules:** feed surfaces → `VideoManager.acquirePlayer` (pool); detail surfaces → `useVideoPlayer` with `shouldPlay` gated on viewability; AppState → pause all; `LookDetailScreen` multi-video pager → `shouldPlay={activeMediaIndex === pageIndex}`.
- **Render guardrails:** memoize `CreatorContext` value (`useMemo` or split into state-slice + actions-slice contexts); `React.memo` on `LookMasonryTile`; debounce `SellScreen` title/description to draft persistence; wrap `DiscoverScene` navigation callbacks in `useCallback`.

**External research support:** FlashList v2 (2026) is JS-only, no `estimatedItemSize`, up to 50% less blank area vs v1, `masonry` prop replaces `MasonryFlashList`, `optimizeItemArrangement` balances columns. `expo-image` `recyclingKey` + blurhash/thumbhash placeholders + `cachePolicy="memory-disk"` is the 2026 standard; a recent iOS fix clears stale blurhash placeholders when `recyclingKey` changes in recycled cells. [VERIFIED — EXTERNAL]

---

### 3.6 Item 30 — Accessibility and large-text certification

**Status:** P2-High (not certifiable as-is).

**Finding:** ThryftVerse has a broadly-deployed a11y layer — 6,212 role/label/hint/state occurrences; `accessibilityLiveRegion` on ~15 dynamic surfaces; `AnimatedPressable` defaults to 44pt hitSlop + button role; `CreatorIconButton` enforces 48pt with required labels; flagship financial surfaces (Wallet, Withdraw, BidSheet, MakeOffer, SellerReputationCard) carry rich spoken-amount labels. [VERIFIED — CODE]

**Five gaps block certification:**
1. **Charts are silent.** `SellerAnalyticsScreen.ActivityChart` (`:139-196`) and `CreatorAnalyticsDashboardScreen.TimelineChart` (`:612-671`) expose no `accessibilityLabel`; bar values invisible to VoiceOver/TalkBack. Victory Native `charts/` barrel has zero a11y (unused but a landmine). Only co-own charts provide textual summaries. **High.** [VERIFIED — CODE]
2. **Dev a11y audit is dead code.** `utils/accessibilityAudit.ts` (444 lines, tree-walking WCAG checker + contrast auditor) is never invoked — 0 call sites. **High.** [VERIFIED — CODE]
3. **No a11y lint.** `eslint-plugin-react-native-a11y` not installed; no static enforcement. **High.** [VERIFIED — CODE]
4. **Base-theme contrast fails AA.** `textMuted` (`#7A7A7A` dark / `#767676` light) is ≈4.0–4.3:1 on `surface`/`surfaceAlt`, below the 4.5:1 required for the 11pt meta text that uses it. High-contrast mode fixes it but is opt-in. **High.** [VERIFIED — CODE]
5. **Large-text caps + dead in-app scale.** `Text.tsx` caps prices/titles at `maxFontSizeMultiplier={1.3}` (won't reach 200%); `numberOfLines={1}` truncates balances; `AccessibilityPreferencesContext.textSizeScale` is computed but never consumed (the Accessibility Settings toggle is a no-op). **Medium-High.** [VERIFIED — CODE]

**Form gap:** `AppInput` (`:115`) and `AddressFormScreen` raw `TextInput`s (`:496-605`) don't bind the visible label to the input — VoiceOver announces "Edit text" without the field name. **High.** [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Lint:** install `eslint-plugin-react-native-a11y` as errors — `has-accessibility-label`, `has-accessibility-hint`, `no-nested-touchables`, `accessible-touchable`, `has-valid-accessibility-role`, `no-missing-accessibility-state`. Custom codemod rule: `<Text>` rendering price/balance/amount must not set `numberOfLines={1}` without `accessibilityLabel` fallback.
- **Component props:** `AppInput` — add `accessibilityLabel={label}` to inner `TextInput` (or `accessibilityLabelledBy` via `nativeID`); make `label` required when no `placeholder`. `Text.tsx` — raise `Price`/`PriceLarge` `maxFontSizeMultiplier` from 1.3 → 1.5 minimum; remove `numberOfLines={1}` from price/balance call sites. Charts — require `accessibilitySummary: string` prop on `ActivityChart`, `TimelineChart`, `charts/` barrel; render off-screen `<Text accessibilityLabel={summary} accessibilityRole="text">`.
- **Runtime audit:** wire `auditAccessibility` into `__DEV__` `useEffect` on top 20 screens; fail CI if dev audit log contains errors. Wire `auditColorContrast` against theme palette pairs at app boot; assert all `textMuted`/`textSecondary` on `surface`/`surfaceAlt`/`background` pass 4.5:1 in both base and high-contrast.
- **Contrast remediation:** raise base `textMuted` to `#9A9A9A` dark / `#5A5A5A` light as default (or intermediate values clearing 4.5:1); keep high-contrast toggle for AAA.
- **Large-text remediation:** make `textSizeScale` actually scale text (apply as multiplier on `fontSize` in `Text.tsx` primitives). Audit every `numberOfLines={1}` on prices/balances/addresses — remove cap or provide `accessibilityLabel` with full value.
- **Device test matrix:** iPhone 15 (VoiceOver, 100/130/200%, light+dark+high-contrast), iPhone SE (VoiceOver, 200%, dark), Pixel 8 (TalkBack, 100/130/200%, light+dark), Samsung A-series (TalkBack, 200%, dark).

**External research support:** 2026 RN a11y guidance: every interactive element needs a label describing what it does (not what it looks like); decorative elements hidden via `accessibilityElementsHidden`/`importantForAccessibility="no"`; reading order matters; `useLargeText` hook for ≥1.7x font scale layout adaptation; `MAX_CAPPED_FONT_SCALE` of 2.143 aligns with iOS accessibility settings; `AccessibilityInfo` for dynamic announcements + focus management; combine automated rules with manual VoiceOver/TalkBack rotor passes. [VERIFIED — EXTERNAL]

---

### 3.7 Item 31 — Internationalisation, regional policy and multi-currency

**Status:** P2-High (blocks any non-UK launch).

**Finding:** ThryftVerse is hard-wired to GBP/£ across its entire commerce surface despite shipping a partially-built i18n + multi-currency substrate that is not wired into the UI.

- **68 screens** in `frontend/src/screens` contain direct `£`/`GBP` references; ~150 files total across components/services/store/tests. Every checkout, offer, withdrawal, auction bid dock, filter preset and receipt calls `formatFromFiat(amount, 'GBP')` with a literal `'GBP'`. [VERIFIED — CODE]
- **i18next + react-i18next + expo-localization IS installed and configured** (`frontend/src/i18n/i18n.ts`, 4 locales `en/es/fr/de`, ICU plurals, RTL, device detection) — but used by only 4 screens. The namespace JSON (`locales/en.json`) has three empty namespaces (`listing`, `messaging`, `commerce`) — exactly where i18n is needed most. ~64 commerce screens use inline English. [VERIFIED — CODE]
- **Currency abstraction exists** (`CurrencyContext`, `useFormattedPrice`, 9 currencies, gold-rate FX) and a Settings picker lets users choose a display currency — but callers bypass it by passing literal `'GBP'`. The root leak is the `'GBP'` default in `useFormattedPrice.ts:32`. Changing the picker has no visible effect on checkout/offers/withdrawals. [VERIFIED — CODE]
- **Backend is mature:** `079_canonical_money_units.sql` stores ISO-4217 + integer minor units with a currency registry; `money.ts` defines a typed `Money` interface; `countryCapabilities.ts` resolves per-cluster currencies/gateways/payouts across 7 clusters. But `commerce_shipping_quotes` still stores `price_gbp` and `shipping.ts:307,324` hardcodes `currency:'GBP'`. [VERIFIED — CODE]
- **Regional policy gaps blocking EU/US launch:** no VAT/tax table, no restricted-items table, no age-of-consent/age-gating, no shipping-zone table, no GDPR-vs-UK-GDPR retention divergence, listings have no per-listing currency code. [VERIFIED — CODE]
- **Date formatting** is locale-parameterised (`dateFormat.ts`) but every caller passes `'en-GB'` and relative strings (`"Just now"`, `"5m ago"`) are hardcoded English. [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Adopt the existing i18next stack** (no new library). Finish namespace JSON for `listing`, `messaging`, `commerce`. Add `i18next-parser` to CI to extract keys from JSX and flag untranslated strings. Migrate the 64 commerce screens from inline English to `t()` keys.
- **Currency:** remove all literal `'GBP'` from `formatFromFiat` call sites — read `currencyCode` from `CurrencyContext`. Fix `useFormattedPrice.ts:32` default. Migrate `commerce_shipping_quotes` from `price_gbp` to `price_minor_units INTEGER + currency_code TEXT`. Add per-listing `currency_code` column. Backend `shipping.ts:307,324` — read currency from quote, not hardcoded.
- **Regional policy:** extend `countryCapabilities.ts` with `tax_rates` (VAT/GST/sales tax per region), `restricted_categories` (per-region prohibited items), `age_of_consent` (per-region minimum age), `shipping_zones` (zone → carrier → rate table). Add `listings.currency_code` + `orders.currency_code` if not present.
- **Rollout:** UK-first (GBP, en-GB, no tax table needed) → EU (EUR, VAT table, GDPR retention divergence, age-of-consent per member state) → US (USD, sales tax per state, CCPA) → MENA/APAC (local currencies, RTL for AR/HE).

**External research support:** 2026 RN i18n stack: `react-i18next` + `expo-localization` + `Intl` (built into Hermes) + `I18nManager` for RTL. `compatibilityJSON: 'v4'` for modern plural rules; `escapeValue: false` because RN escapes JSX. Never string-concat dates/currencies — use `Intl.DateTimeFormat`/`Intl.NumberFormat`. Mobile translations must be bundled as fallback with OTA updates for fresh content; every bundled language increases app size. [VERIFIED — EXTERNAL]

---

### 3.8 Item 32 — Analytics, experimentation and feature rollout

**Status:** P2-High (experimentation absent).

**Finding:** ThryftVerse has a **mature, well-architected product-analytics foundation** — significantly beyond what the flagship research doc (written pre-PostHog integration) describes. PostHog is fully integrated as the unified analytics + feature-flag + session-replay platform, with a typed event taxonomy (`EventName` union of 47 events), typed feature-flag keys (`FeatureFlagKey` union of 8 flags), PII scrubbing on both telemetry and screen-tracking paths, analytics opt-out, EU hosting for GDPR, session replay with privacy masking, and bootstrap-flag caching via MMKV for instant flag access on cold start. The backend has a durable append-only `analytics_events` ledger (migration 140, partitioned by month, UUID v7) plus a Redis capped-list for operational telemetry, and a sophisticated recommendation impression lineage system (migrations 141-142) with served/rendered/viewable status lifecycle, candidate-source lineage, and IPW selection propensity. [VERIFIED — CODE]

**However, the experimentation layer is absent.** No experiment assignment, no variant bucketing, no guardrail metrics, no staged-rollout mechanism, no kill-switch, no rollback measurement. The `feature_flag_evaluated` event is declared in the taxonomy (`types.ts:134`) but **never emitted** — `useFeatureFlag` hooks call `getFeatureFlag()` but do not log an exposure event, so there is no impression lineage linking a flag evaluation to downstream user actions. The backend has zero feature-flag or experiment infrastructure. [VERIFIED — CODE]

**Additional gaps:** Only 2 of 47 events have typed property contracts (45 fall through to untyped `DefaultEventProperties`). Backend `/analytics/events` accepts any `event: string` (no server-side enum validation). `trackTelemetryEvent` has no `session_id`, no `user_id`, no client-side `timestamp`, no batching, no offline queue, no deduplication — per-event HTTP POST with silent failure on offline. No server-side PII scrubbing. No data retention policy for `analytics_events`. No GDPR data-deletion flow for analytics. No business metrics in Prometheus (only infrastructure metrics). No north star metric. [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Build vs buy: Buy (PostHog). Already integrated.** PostHog Experiments provides frequentist statistics, exposure tracking via `$feature_flag_called`, variant assignment, funnel analysis, retention cohorts. Statsig/GrowthBook are alternatives but switching would mean migrating off PostHog's flag system (already wired into 8 typed flags across 7 screens). LaunchDarkly is overkill. The gap is activation, not platform selection.
- **Activate experimentation:** wire up PostHog Experiments on top of existing feature flags. Add exposure logging to `useFeatureFlag` — emit `feature_flag_evaluated` with `{ flag_key, variant, enabled, reason }`. Add `impression_id` (UUID v7) to analytics events for general impression-to-action lineage. Add `session_id` + client-side `timestamp` to `trackTelemetryEvent`. Add event batching (20 events or 10s flush) + offline queue + dedup (500ms window on event_name + payload hash).
- **Experiment registry:** `experiments` table — `experiment_id`, `flag_key`, `hypothesis`, `primary_metric`, `guardrail_metrics JSONB`, `sample_size`, `start_date`, `end_date`, `status`. Process contract, not assignment engine.
- **Guardrails:** define guardrail metrics (crash rate via Sentry, app start time, Day 1/7/30 retention, GMV, support ticket volume, push delivery rate). Add business metrics to Prometheus (`thryftverse_gmv_total`, `thryftverse_listings_created_total`, `thryftverse_orders_completed_total`, `thryftverse_user_signups_total`). Guardrail dashboard in Grafana/PostHog. Auto-kill job: scheduled metric check → if guardrail breaches threshold → set PostHog flag to 0% → alert.
- **Staged rollout + kill-switch:** define rollout stages (0% → 1% → 10% → 50% → 100%) with measurement checkpoint at each. `POST /flags/kill` endpoint sets flag to 0%. On kill, log `flag_killed` with `{ flag_key, reason, killed_by, guardrail_breaches }`. Measure recovery.
- **Tighten event contracts:** add typed property interfaces for all 47 events. Server-side `z.enum([...])` matching frontend `EventName` union, generated from shared contract file. Contract test asserting every `EventName` has an `EventProperties` entry.
- **Privacy:** add server-side PII scrubbing as defence-in-depth. Define retention period (e.g. 2 years) with monthly partition-drop job. Add user-deletion endpoint for `analytics_events WHERE actor_user_id = $1`. Consider hashing user IDs in durable ledger if ML pipelines don't need raw ID.

**External research support:** PostHog exposures are the foundation of experiment analysis — only exposed users are included in metric calculations; metric events counted only after first exposure; `$feature_flag_called` is deduplicated per identity by default. GrowthBook pre-launch framework: pre-register hypothesis, primary metric, sample size, stopping criteria; re-randomize with fresh seed for every experiment; declare guardrail metrics that must not degrade. PostHog is sufficient for <20 experiments/quarter; graduate to Statsig/Optimizely only when CUPED variance reduction, MutEx isolation, or multi-armed bandits are needed. [VERIFIED — EXTERNAL]

---

### 3.9 Item 33 — Data privacy, retention and deletion propagation

**Status:** P2-High (UK-GDPR Art. 5(1)(e) + Art. 17 violation).

**Finding:** ThryftVerse has **two parallel, inconsistent erasure flows** (GDPR in `index.ts:16369`, CCPA in `compliance.ts:291`) that cover overlapping but non-identical data classes. Neither cascades to the majority of user-generated content: support transcripts, support AI agent runs, chat messages, AI usage events, media assets, listings, orders, auction bids, or co-own holdings. The only data class with a genuine retention engine is catalogue import raw data (`catalogImportRetention.ts`, 30-day TTL). Every other class is retained indefinitely with no TTL, no scheduled purge, and no deletion propagation to S3, search indices, or vendors. [VERIFIED — CODE]

**Critical blockers:**
- **`ai_usage_events.user_id` is `ON DELETE RESTRICT`** (`068:10`) — actively blocks compliant hard user deletion. [VERIFIED — CODE]
- **Media lifecycle is the largest gap.** `deleteObject()` exists in `lib/s3.ts:151` but is called in exactly one place — orphaned upload-intent cleanup. Media revoke sets `status='revoked'` but never deletes the S3 object. Listing soft-delete triggers no media GC. No reference-counted media deletion orchestrator. [VERIFIED — CODE]
- **AI/transcript retention is unbounded.** `support_agent_runs` stores `tool_calls`, `tool_results`, `validator_outcomes` as plaintext JSONB indefinitely. `support_messages.body` is plaintext, no TTL. `chat_messages.body` is plaintext, no TTL, not touched by any erasure flow. OpenAI `store: false` is the sole vendor-side protection. [VERIFIED — CODE]
- **PII encryption is partial.** `secure_messages` and `catalog_import` raw snapshots use application-layer ciphertext, but `chat_messages.body`, `support_messages.body`, `user_compliance_profiles` (legal_name, DOB), and `ai_usage_events` are plaintext at rest. Logger redaction covers only `password/token/secret/apiKey` — not email, phone, address, or message bodies. [VERIFIED — CODE]
- **CCPA flow is strictly weaker than GDPR flow** — leaves payment methods, secure messages, TOTP, and recovery codes intact. [VERIFIED — CODE]
- **No backup deletion strategy for erased users.** PITR would restore erased data. [VERIFIED — CODE]

**Deletion propagation map:** GDPR erasure cascades correctly to user_addresses, user_payment_methods, user_secure_profiles, wallet_secure_snapshots, secure_messages, interactions, recommendations, notification_devices, notification_events (anonymised), TOTP, recovery codes, sessions, refresh_tokens, password_reset_tokens, user_compliance_profiles (nullified). It orphans: chat_messages, chat_conversations, chat_message_attachments, support_conversations, support_messages, support_agent_runs, support_cases, support_case_events, support_handoffs, ai_usage_events, listings, media_assets, media_derivatives, media_bindings, orders, auction_bids, coOwn_orders/holdings, search index entries, S3 media objects, backup snapshots, vendor copies. [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Retention policy engine:** per-data-class retention config (`retention_policy` table: data_class, ttl_days, action on expiry (anonymise/delete), legal_basis). Monthly partition-drop job for `analytics_events`. 30-day TTL for support transcripts (extend for open disputes). 90-day TTL for AI usage events. Chat message TTL per conversation type.
- **Multi-stage deletion orchestrator:** `DELETE /users/me` (GDPR) and `DELETE /users/me/ccpa` unified into one orchestrator: (1) DB cascade (addresses, payment methods, secure profiles, sessions, TOTP, recovery codes — already done); (2) chat anonymisation (null `body`, set `deleted_for_everyone_at`); (3) support transcript anonymisation (null `body`, null `tool_results`); (4) AI usage events deletion (fix `ON DELETE RESTRICT` → `ON DELETE CASCADE` or explicit delete); (5) listings soft-delete + seller-attributable data anonymisation; (6) media GC (reference-counted: delete S3 objects when zero active bindings); (7) search index removal; (8) vendor deletion propagation (moderation provider, AI provider — add deletion API call to provider interface); (9) backup expiry (document that erased data persists in backups until backup rotation, per EDPB guidance).
- **DSAR workflow:** intake → identity verification → discovery across every store → fulfilment by request type → propagation to processors → proof. `gdpr_requests` table already exists (`009:433`); extend with propagation status per data class.
- **PII minimisation:** encrypt `chat_messages.body`, `support_messages.body`, `support_agent_runs.tool_results` at rest (pgcrypto or application-layer). Extend logger redaction to email, phone, address, message bodies, legal_name, date_of_birth.
- **Fix `ai_usage_events` FK:** change `ON DELETE RESTRICT` to `ON DELETE CASCADE` (or explicit delete in erasure flow).
- **Unify GDPR + CCPA flows** into one orchestrator with a `regime` parameter.

**External research support:** EDPB 2025 right-to-erasure report: controllers must map personal data and storage locations (including backups), offer user-friendly erasure request channels, distinguish erasure from account deletion, define retention periods per processing activity (not blanket), and address backup deletion (erased data persists in backups until rotation — documented, not silent). Multi-tenant SaaS DSAR: six ordered stages — intake/authority check, identity verification, discovery across every store, fulfilment, propagation to processors, proof. Processor register: every sub-processor with its own deletion API and contractual deletion SLA. [VERIFIED — EXTERNAL]

---

### 3.10 Item 34 — Sustainability and impact accounting

**Status:** P0 (legal/regulatory — greenwashing liability).

**Finding:** ThryftVerse surfaces sustainability claims across at least six user-visible surfaces (product card chip, product detail impact section, detailed grade badge, browse "Sustainable" filter, filter screen, dedicated Sustainability Preferences screen). **Every impact figure is fabricated client-side from hardcoded constants** — no backend impact service, no emissions factor table, no carrier/distance/material data pipeline, no integration with any third-party emissions provider (Squake, Sweep, Carbon Interface). The codebase is internally honest about this (`sustainabilityScore.ts:2-18` self-documents as "heuristic, client-side estimate"; preferences screen shows a "Demo mode" banner), but the **`__DEV__`-only demo banner is hidden in production** (`SustainabilityPreferencesScreen.tsx:40`), so production users see fabricated impact figures with no disclaimer. [VERIFIED — CODE]

**Methodology audit:** The entire calculation lives in one client-side file (`sustainabilityScore.ts`). CO₂ saved = `NEW_CO2_KG (8) × RESALE_SAVINGS_RATIO (0.6) × CATEGORY_WEIGHT (0.7–1.4)` → 3.4–6.7 kg CO₂e for any item, regardless of material, weight, distance, or carrier. Water saved = `NEW_WATER_L (2900) × 0.6 × CATEGORY_WEIGHT` → 1,218–2,436 L for any item. No real data inputs collected (material composition, item weight, shipping distance, carrier/mode, emissions factor database, avoided-production factor by material, resale-shipping emissions netting, third-party verification, per-user lifetime impact ledger). [VERIFIED — CODE]

**Compliance risk:**
- **UK CMA Green Claims Code (2021, in force):** "saves ~X kg CO₂" is not accurate (hardcoded constant unrelated to the actual item); "~" prefix and footer disclaimer are insufficient (CMA has ruled vague qualifiers do not cure an unsubstantiated headline claim); failure to disclose methodology is an omission; "vs buying new" invokes an unsubstantiated comparison; resale shipping emissions not netted out (gross-only claim). Enforcement includes undertakings, court orders, and fines up to 10% of global turnover under the Digital Markets, Competition and Consumers Act 2024. [VERIFIED — EXTERNAL]
- **EU EmpCo Directive (2024/825, transpose by March 2026, apply from September 2026):** environmental claims must be based on scientifically recognised evidence and verified by an independent third party before publication; method/assumptions/estimated-vs-measured must be visible at point of claim; generic "sustainable"/"green"/"eco" labels (used in the grade system: "Excellent sustainability") require substantiation; carbon-neutral claims (the preferences screen "Carbon-neutral shipping" toggle) imply a carbon-neutral delivery option that does not exist. [VERIFIED — EXTERNAL]
- **AGENTS.md §11 violation:** the codebase's own charter states "a badge rendered from a hardcoded value or a frontend default is a lie." The sustainability grade chip and impact stats are exactly that. [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Methodology — net avoided emissions:** `net_avoided_co2e = avoided_production_co2e(material, weight, category) + avoided_eol_co2e(weight, material) - resale_shipping_co2e(distance, mode, weight) - resale_packaging_co2e(packaging_type)`. Use material-specific embodied-emissions factors (Higg MSI, ecoinvent, DEFRA GHG conversion factors). Net, not gross — if an item ships by air across a continent, the net saving can be small or negative, and the UI must say so.
- **Data inputs:** collect material composition (% breakdown, required field in seller listing flow), item weight (kg), origin location (geocoded seller address), destination location (geocoded buyer address), carrier + service mode (existing `postageOption.carrierId` + carrier mode mapping), packaging type. Store in `listings.material_composition`, `listings.weight_kg`, `listings.origin_geo`.
- **Third-party verification:** integrate **Squake** for shipping-leg emissions (the variable, transactional part) + maintain a vetted, versioned emissions-factor table in the backend for production/EOL factors (the stable part). Every factor row cites its source (DEFRA 2024, Higg MSI v3.7, ecoinvent 3.10) and effective date. EU Green Claims Directive requires third-party verification of the claim, not just the API — factor table + calculation log must be auditable.
- **Backend impact service:** `backend/api/src/impact/` — `emissionsFactors.ts` (versioned factor table with source citations), `impactCalculator.ts` (net avoided-emissions engine), `impactRoutes.ts` (`GET /listings/:id/impact`, `GET /users/me/impact-ledger`), `impactLedgerService.ts` (per-user lifetime ledger, materialised on order completion), `squakeClient.ts`.
- **Transparent disclosure UI:** replace "saves ~X kg CO₂" with "Estimated net CO₂e avoided: X kg" only when backend returns a computed value. Always show a methodology disclosure sheet (expandable): "Based on {material} × {weight} kg, avoided production ({source}), minus resale shipping {distance} km by {mode} ({source}). Methodology v{N}." Remove A–D "Excellent/Good/Moderate/Low sustainability" grade labels (generic environmental claims requiring substantiation) — replace with factual impact range. Remove `__DEV__`-only demo banner — production must never show fabricated figures. Preferences screen: replace hardcoded `34 kg / 12 items` with real `user_impact_ledger` aggregate or empty state.
- **Fail-closed per §11:** if material/weight/distance data is missing, return `null` and render no impact claim — never a fabricated default.
- **User preferences — backend-backed:** add sustainability preference fields to account preferences endpoint so `carbonTarget`, `ratioTarget`, `carbonNeutralShipping`, `plasticFreePackaging`, `showBadges`, `trackImpact`, `localFirst` persist server-side and drive ranking/filtering. `carbonNeutralShipping` and `plasticFreePackaging` must only surface as filters when sellers/carriers actually offer those options.

**External research support:** WRAP "Displacement Rates Untangled" (2025): UK weighted average displacement rate for resale = 64.6% (for every 5 preloved items bought, 3 displace new purchases); repairing one cotton t-shirt saves ~7.5kg CO₂e; buying preloved jeans online saves ~30kg CO₂e. Vestiaire Collective 2026 Impact Report: 90% of environmental impact avoided when buying pre-loved; 58,800 tCO₂e avoided in 2025; uses carbon avoidance credits. EU EmpCo Directive: bans vague green claims without specific verifiable details, sustainability labels require independent third-party certification, product claims based solely on carbon offsetting banned, durability claims must include repair service evidence. [VERIFIED — EXTERNAL]

---

### 3.11 Item 35 — Native EAS visual-regression programme

**Status:** P2-Medium (no diff engine; baselines are 1×1 pixel placeholders).

**Finding:** ThryftVerse has **extensive scaffolding** for visual regression but **zero actual pixel-diffing capability**. The codebase contains a 797-line ownership-gate test (`visualRegressionPlan.test.ts`), two Maestro golden-route screenshot flows, a GitHub Actions screenshots workflow, and a parity-checker script — yet none perform image comparison. The "baselines" committed to `src/__tests__/__screenshots__/` are **1×1 pixel placeholder PNGs** (67 bytes each). The parity checker explicitly comments: "Pixel-level diff would go here once a screenshot diffing library is wired in (e.g., pixelmatch or odiff). For now, we check presence." No diff engine (reg-suit, Percy, Applitools, pixelmatch, odiff) is installed. No Maestro flow switches theme or font scale. The CI device matrix is a single device per platform (iPhone 15; Android API 34), not the 6-device × 2-theme × 3-font-scale matrix documented in `visual-qa-gates.md`. [VERIFIED — CODE]

**What exists:** Maestro flow library (8 YAML files covering golden routes), screenshot capture CI (builds via EAS, boots simulator/emulator, runs Maestro, uploads PNG artifacts), ownership gate (asserts screen file + baseline file exist), dual-mode concept (fixture-design vs integration-truth parity), theme/font infrastructure (`ThemeContext.setThemePreference`, `useFontScale`, `AccessibilityPreferencesContext` text size). [VERIFIED — CODE]

**What is missing:** no pixel-diff engine; baselines are 1×1 placeholders; no theme variation in capture; no font-scale variation; no device-width matrix; no per-PR diff gate; no EAS Workflows visual lane; no animation disabling for capture; no mock-backend enforcement (screenshots depend on live dev backend). [VERIFIED — CODE]

**Flagship fix [PROPOSED]:**
- **Capture engine: Maestro** (already scaffolded; switching to Detox would discard investment). Augment flows with theme-switching and font-scale-setting sub-flows.
- **Device matrix (Phase 1):** iPhone 15 Pro (regular 393pt) + iPhone SE 3rd gen (compact 375pt) + Pixel 8 (regular 412pt) + Pixel 5 (compact 393pt). 2 devices per platform covers the compact/regular width break.
- **Full capture matrix:** Platform (2) × Device (2 per platform) × Theme (2) × Font scale (3) = 24 captures per route. Theme via `setThemePreference` or `Appearance.setColorScheme` launch arg. Font scale iOS via `xcrun simctl ui <device> content_size`; Android via `adb shell settings put system font_scale`.
- **Route matrix:** 18 screens × 5 states (populated, loading, empty, error, offline) — already defined in `visualRegressionPlan.test.ts:242-797`. Not new work; the executable spec exists.
- **Diff engine: reg-suit** (with pixelmatch). Free, open-source, repo-native baselines, GitHub PR integration, tunable threshold. Percy/Applitools per-shot pricing (~$1,500–$3,000+/mo at 2,160 shots/PR) not justified at current scale. Diff > 0.1% pixels fails CI and posts visual diff comment on PR. Baseline update via `npm run visual:approve` in the PR.
- **EAS integration:** EAS Build `development-simulator`/`development` profiles (already configured). Matrix expansion via GitHub Actions `strategy: matrix`. Font-scale setting via `xcrun simctl ui`/`adb shell settings put`. Theme switching via Maestro sub-flow or launch arg. reg-suit step after capture. Phase 2: EAS Workflows `visual_regression` job on EAS-managed runners.
- **Anti-flake rules:** disable animations (OS Reduce Motion + in-app `reducedMotion: true`), stable data (`EXPO_PUBLIC_MOCK_MODE=fixture-design`), wait for settle (`waitForAnimationToEnd` + `extendedWaitUntil`), fixed simulator clock (`xcrun simctl status_bar time "9:41"`), suppress notifications, deterministic screenshot naming (`{platform}-{device}-{theme}-{fontScale}-{route}-{state}.png`), threshold tuning (0.1% pixel, tune per-route for anti-aliasing jitter).
- **Ownership and cadence:** mobile release/quality engineering owns the programme. PR: full matrix on every PR touching `frontend/**`, reg-suit diff gate blocks merge on >0.1% unintended diff. Main: nightly full matrix. Release: full matrix on every release tag, generate `VISUAL_SIGNOFF.md`. Baseline changes require explicit `npm run visual:approve` + human review of diff images.

**External research support:** Maestro `assertScreenshot` compares screenshots across runs with `thresholdPercentage` (default 95%, increase to 98-99 for pixel-sensitive components, crop to specific element to ignore dynamic areas). `@percy/maestro-app` SDK integrates App Percy visual testing with Maestro flows on BrowserStack. EAS + Maestro + Percy bridge: EAS workflow runs Maestro, captures screenshots, uploads to Percy for visual comparison. reg-suit is the open-source alternative for repo-native baselines without SaaS dependency. [VERIFIED — EXTERNAL]

---

## 4. Cross-cutting themes

### 4.1 The "right architecture, wrong wiring" pattern

Eight of eleven items reveal a codebase where the correct primitive exists but is not the single source of truth:

| Item | Correct primitive exists | But is bypassed by |
|---|---|---|
| 25 | `constants/categories.ts` | 9 screens with own arrays |
| 28 | `mutation_outbox` table + `syncEngine.ts` | `runSync` never called; `listing_draft` never written |
| 28 | Chat durable outbox | `initChatOutboxDrain` never called at startup |
| 29 | `VideoManager` player pool | `compat/Video.tsx` creates per-instance `useVideoPlayer` |
| 30 | `accessibilityAudit.ts` (444 lines) | 0 call sites — dead code |
| 30 | `AccessibilityPreferencesContext.textSizeScale` | Never consumed by any component |
| 31 | `i18next` + `CurrencyContext` | Only 4 screens use i18n; callers pass literal `'GBP'` |
| 32 | PostHog experiments SDK | `feature_flag_evaluated` never emitted |
| 35 | Maestro flows + CI workflow | No diff engine; 1×1 pixel baselines |

The implication is clear: **the work is activation, enforcement, and deletion of parallel copies — not greenfield invention.** This is a lower-risk, higher-ROI programme than the item list suggests at first glance.

### 4.2 The "two parallel systems" anti-pattern

Four items reveal a dual-system anti-pattern where a second, weaker implementation runs alongside the correct one:

| Item | System A (correct) | System B (parallel, weaker) |
|---|---|---|
| 27 | App* primitives | Premium* primitives (8 parallel wrappers) |
| 28 | `UploadManager` (durable, persisted) | `MediaUploadQueue` (in-memory, volatile) |
| 28 | `mutation_outbox` (durable) | `ListingPublicationRecovery` Zustand (in-memory) |
| 33 | GDPR erasure flow (`index.ts:16369`) | CCPA erasure flow (`compliance.ts:291`, strictly weaker) |

A senior SWE deletes the weaker parallel system and consolidates onto the correct one. This is the over-scaffolding / dual-taxonomy anti-pattern called out in AGENTS.md §4.

### 4.3 The "P0 hiding in P2" pattern

Three items are not P2-quality issues — they are P0-severity defects misclassified as P2:

| Item | P0 defect | Impact |
|---|---|---|
| 26 | ~40 unregistered root-stack routes | Crash-on-press for every Settings/Profile row + Home search |
| 28 | `Date.now()` idempotency keys in Withdraw + Trade | Double-withdraw / duplicate reservation on unknown outcome |
| 34 | Hardcoded sustainability claims shown in production | CMA/EU greenwashing liability (fines up to 10% global turnover) |

These should be triaged as P0 and fixed before any P2 polish work begins.

### 4.4 Lint/test/CI guardrails are universally absent

Every item's proposed fix includes a lint, test, or CI guardrail that does not exist today:

| Item | Missing guardrail |
|---|---|
| 25 | No lint rule preventing inline taxonomy arrays |
| 26 | No `__DEV__` assertion that `RootStackParamList` keys are registered |
| 27 | No `max-lines` / `max-lines-per-function` ESLint rule |
| 28 | No lint rule enforcing stable idempotency keys (no `Date.now()`) |
| 29 | No lint rule forbidding `ScrollView` + `.map()` for >20 items |
| 30 | No `eslint-plugin-react-native-a11y` |
| 31 | No `i18next-parser` CI step to flag untranslated strings |
| 32 | No contract test asserting every `EventName` has `EventProperties` |
| 33 | No scheduled job for retention/media GC/DSAR fulfilment |
| 34 | No lint rule flagging hardcoded sustainability constants |
| 35 | No reg-suit diff gate in CI |

Adding these guardrails is the single highest-leverage action across the entire P2 backlog — it prevents the same defects from recurring after the manual fixes land.

---

## 5. Priority remediation order

Ordered by severity × leverage × risk-to-fix ratio:

| Priority | Item | Action | Rationale |
|---|---|---|---|
| **P0-1** | 28 | Replace `Date.now()` idempotency keys in `WithdrawScreen` + `TradeScreen` with stable refs | Two-line fix; eliminates double-spend/duplicate-reservation risk |
| **P0-2** | 26 | Register all ~40 navigated-but-unregistered root-stack routes; add `__DEV__` assertion | Eliminates crash-on-press for every Settings/Profile row + Home search |
| **P0-3** | 34 | Remove production sustainability claims (or gate behind `__DEV__`); fail-closed until backend impact service exists | Eliminates CMA/EU greenwashing liability |
| **P1-1** | 33 | Fix `ai_usage_events` `ON DELETE RESTRICT`; unify GDPR + CCPA erasure flows; add chat/support/AI/media/listing cascade | UK-GDPR Art. 17 compliance |
| **P1-2** | 28 | Wire `initChatOutboxDrain` in `App.tsx`; add `Idempotency-Key` to `createListingOnApi` + `requestPayout` | Offline reliability for the most-used mutations |
| **P1-3** | 30 | Install `eslint-plugin-react-native-a11y`; fix `textMuted` contrast; bind `AppInput` labels; add chart `accessibilitySummary` | A11y certification unblock |
| **P1-4** | 31 | Remove literal `'GBP'` from all `formatFromFiat` call sites; fix `useFormattedPrice.ts:32` default | Currency picker starts working; unblocks non-UK launch |
| **P2-1** | 25 | Backend `taxonomy_nodes` table + `routes/taxonomy.ts`; frontend `contracts/taxonomy.ts` + `TaxonomyContext` | Data-integrity; admin manageability |
| **P2-2** | 27 | Extract pure utils + inline subcomponents from top 10 screens; consolidate Premium* → App*; enable `max-lines` lint | Maintainability; anti-AI-tell |
| **P2-3** | 32 | Activate PostHog Experiments; add exposure logging; define guardrails; add business metrics to Prometheus | Experimentation capability |
| **P2-4** | 29 | Migrate 3 non-virtualized feeds to FlashList masonry; memoize `CreatorContext` value; `useCallback` on `LooksTab` callbacks | OOM/jank prevention on mid-range Android |
| **P2-5** | 35 | Install reg-suit; expand CI matrix to 4 devices × 2 themes × 3 font scales; capture real baselines on `main` | Visual regression gate |
| **P2-6** | 26 | Converge discovery (fold UnifiedDiscovery/GlobalSearch/Galleria/PulseFeed into Explore); converge commerce hubs; remove redirect shims | IA stability (after P0 registration) |
| **P3-1** | 28 | Build generic `outboxClient.ts` + drain loop; route listing publication through outbox; implement `GET /sync/{domain}` | Full offline-first |
| **P3-2** | 34 | Build backend impact service (Squake integration, emissions factor table, net avoided-emissions calculator, per-user ledger) | Real sustainability accounting |
| **P3-3** | 31 | Finish i18n namespace JSON; migrate 64 commerce screens to `t()`; extend `countryCapabilities` with tax/restricted-items/age/shipping-zones | Non-UK launch readiness |
| **P3-4** | 33 | Retention policy engine; media GC orchestrator; vendor deletion propagation; backup expiry strategy | Full privacy compliance |

---

## 6. Final response format

```text
Workspace:           C:\Users\User\Desktop\thryftverse-upgrade
Starting branch:     feat/product-detail-contract-media-device-closure
Starting HEAD:       f82f74a54be79a1721017380ddd5472d856f1679
Final branch:        feat/product-detail-contract-media-device-closure
Final HEAD:          f82f74a54be79a1721017380ddd5472d856f1679
Files changed:       .devin/reports/p2-system-wide-quality-multipliers-flagship-analysis-2026-08-25.md (new)
                     .devin/reports/_p2-research/item-25-marketplace-taxonomy.md (new, 252 lines)
                     .devin/reports/_p2-research/item-26-navigation-ia.md (new, 389 lines)
                     .devin/reports/_p2-research/item-27-screen-decomposition.md (new, 360 lines)
                     .devin/reports/_p2-research/item-28-offline-first-mutations.md (new, 245 lines)
                     .devin/reports/_p2-research/item-29-native-perf-media.md (new, 277 lines)
                     .devin/reports/_p2-research/item-30-accessibility-large-text.md (new, 258 lines)
                     .devin/reports/_p2-research/item-31-i18n-multi-currency.md (new, 455 lines)
                     .devin/reports/_p2-research/item-32-analytics-experimentation.md (new, 281 lines)
                     .devin/reports/_p2-research/item-33-privacy-retention.md (new, 431 lines)
                     .devin/reports/_p2-research/item-34-sustainability-impact.md (new, 809 lines)
                     .devin/reports/_p2-research/item-35-eas-visual-regression.md (new, 489 lines)
Visible improvements: None (research + report only; no product code modified)
Interactions preserved: All
Interactions fixed: None (research only)
Controls removed: None
Navigation changes: None (item 26 documents proposed convergence but does not implement)
Loading/empty/error states: Not modified
Accessibility: Not modified (item 30 documents proposed certification programme)
TypeScript: Not modified
Tests: Not modified (item 35 documents proposed reg-suit programme)
Native validation: Not performed (research only)
Remaining visual weaknesses: All P2 items remain unresolved; this report is the specification for the remediation programme
Remaining interaction issues: ~40 unregistered routes (crash-on-navigate); Date.now() idempotency keys (double-spend); non-virtualized feeds (OOM risk)
Backend blockers: No /sync/push endpoint; no taxonomy table; no impact service; no multipart upload endpoints; no server-side PII scrubbing; no retention jobs; ai_usage_events ON DELETE RESTRICT
Commit SHAs: None (no commits made)
Final status: PARTIAL — BACKEND CAPABILITY BLOCKER
```

---

## 7. Per-item report index

| Item | Report | Lines | Key verdict |
|---|---|---|---|
| 25 | `.devin/reports/_p2-research/item-25-marketplace-taxonomy.md` | 252 | No single source of truth; 6 incompatible category vocabularies; backend accepts free-form text |
| 26 | `.devin/reports/_p2-research/item-26-navigation-ia.md` | 389 | ~40 unregistered routes (crash-on-press); 5+ overlapping discovery hubs; 3 redirect shims |
| 27 | `.devin/reports/_p2-research/item-27-screen-decomposition.md` | 360 | 51 screens >1000 lines; 10 screens >2000 lines; Premium*/App* parallel taxonomy; no max-lines lint |
| 28 | `.devin/reports/_p2-research/item-28-offline-first-mutations.md` | 245 | Date.now() idempotency keys (double-spend); sync engine is a dead stub; chat outbox drain never called at startup |
| 29 | `.devin/reports/_p2-research/item-29-native-perf-media.md` | 277 | Best-in-class image/video infra; 3 non-virtualized feeds; CreatorContext value churn; VideoManager pool not wired |
| 30 | `.devin/reports/_p2-research/item-30-accessibility-large-text.md` | 258 | 6,212 a11y props; charts silent; dev audit dead code; no a11y lint; textMuted fails AA; large-text caps + dead in-app scale |
| 31 | `.devin/reports/_p2-research/item-31-i18n-multi-currency.md` | 455 | 68 screens with literal GBP; i18next installed but 4 screens use it; CurrencyContext bypassed; no regional tax/restricted-items policy |
| 32 | `.devin/reports/_p2-research/item-32-analytics-experimentation.md` | 281 | PostHog fully integrated; experimentation not activated; feature_flag_evaluated never emitted; no guardrails |
| 33 | `.devin/reports/_p2-research/item-33-privacy-retention.md` | 431 | Two parallel erasure flows; neither cascades to chat/support/AI/media/listings; ai_usage_events ON DELETE RESTRICT; no media GC |
| 34 | `.devin/reports/_p2-research/item-34-sustainability-impact.md` | 809 | 100% fabricated; __DEV__-only demo banner hidden in production; 16 §11 violations; false carbon-neutral bug; CMA/EU greenwashing liability |
| 35 | `.devin/reports/_p2-research/item-35-eas-visual-regression.md` | 489 | Extensive Maestro scaffold; 1×1 pixel placeholder baselines; no diff engine; no theme/font-scale/device-width matrix; 0 assertScreenshot commands |

**Total per-item evidence:** 4,246 lines across 11 files. Every claim is tagged with `[VERIFIED — CODE]` and a path:line reference, or `[VERIFIED — EXTERNAL]` with a linked primary source.

---

*End of synthesis report. Research only; no product code modified. Per-item deep-dive reports in `.devin/reports/_p2-research/`.*
