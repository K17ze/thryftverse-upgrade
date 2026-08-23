# ThryftVerse 2026 Flagship Gap Analysis

**Audit date:** August 2026
**Reference applications:** Snapchat, Instagram, Pinterest, eBay, Depop, Vestiaire, Whatnot
**Design contract:** `Design.md` (Components A–G)
**Workflow:** `research-driven-upgrade-loop.md`

---

## Executive Summary

ThryftVerse is a **mature, well-architected** marketplace with strong design-system discipline, truthful AI labelling, and a discriminated-union commerce model that cleanly separates direct/auction/co-own flows. The codebase is **largely free of AI-made design tells** — flat canvas composition, hairline separators, one icon family, one radius grammar, and restrained chrome are consistently enforced through shared primitives.

However, the audit identified **critical gaps** that prevent flagship perception:

1. **Backend live-signs failures** — 6 flagship surfaces (Live Shopping viewer, Galleria, Moodboard, Conversational Search, AI Photo Enhancement, Smart Sell) have **no production backend** and throw or return empty in production builds.
2. **No real-time messaging** — the entire messaging surface (inbox + chat + group chat) has no WebSocket/polling. Conversations go stale until manual refresh. This is the single biggest gap vs Instagram/Snapchat.
3. **No server-side image pipeline** — `sharp` is declared but never imported. Mobile downloads raw originals from MinIO. No thumbnails, WebP/AVIF, blurhash, or focal-point crops. This is the single biggest mobile performance win available.
4. **GroupChatScreen is local-only** — messages are never sent to the server. Critical correctness bug.
5. **No SSL pinning** — for a wallet-bearing app, MITM via installed CA is possible.
6. **Camera strategy gap** — a full vision-camera implementation exists (`CreatorCamera.tsx`) but none of the listing flows use it; they use the system camera via `ImagePicker`.
7. **Inconsistent primitives** — 3 masonry implementations, 3 sort UIs, 3 error-state components across detail screens.
8. **Dead backend endpoints** — autocomplete backend exists but the frontend never calls it; visual search backend returns filtered SQL, not image similarity.

The audit also identified **~40 P1/P2 upgrade targets** across surfaces that would meaningfully improve flagship perception. These are prioritized in §3.

---

## 1. Surface-by-Surface Gap Summary

### 1.1 Home / Explore / Discovery

| Surface | Status | Critical Gaps |
|---|---|---|
| HomeScreen | Good | Redundant search affordance (header icon + full-width prompt); 7 chrome bands before media; deterministic `FEATURED_RHYTHM`; verbose empty-state copy |
| BrowseScreen | Fair | Dashboard silhouette (title + count pill + 7 filter pills + sort menu + badges); module-level `Dimensions.get('window')` frozen on rotation; inline sort menu inconsistent with GlobalSearch's bottom sheet |
| SearchScreen (Explore) | **Poor** | **Fake search input** — Pressable styled as input that navigates to GlobalSearch. No inline autocomplete, no recent searches. Major defect vs Pinterest/Instagram 2026. |
| GlobalSearchScreen | Good | **Invisible focus-state animation** — `interpolateColor` from `surfaceAlt` to `surfaceAlt` is a no-op; `AppSearchBar` focus border suppressed by parent. Second manual masonry implementation (no virtualization). 5 section headers on landing. |
| VisualSearchScreen | Fair | Form-heavy refinement panel (5 labeled inputs in bordered card); `useNativeDriver: false` on scan animation (JS thread); 1064 lines for one screen |
| PulseFeedScreen | Fair | Uniform card list (no visual variation); dead "sold" type; no error/offline state; plain ScrollView (no virtualization) |
| CategoryDetailScreen | Fair | Duplicate of BrowseScreen with less filtering; copy-pasted filter/sort bar; skeleton heights not derived from column width |
| CategoryTreeScreen | **Poor** | **Hardcoded `TREES` constant** — fully fabricated category tree, no backend API. "SHOP BY" kicker eyebrow. "View All" decorative CTA block. |
| CollectionDetailScreen | Good | `MoreLikeThisRow` uses `any[]` props (type-safety bypass); no loading skeleton for initial load; no virtualization |
| ExploreCollectionScreen | Fair | **Third masonry implementation** (`MasonryGrid` from `ProductCardV2`); dead auction filter path; fixed 180pt skeleton height |
| DiscoverScene | Good | **Category pills are a no-op** — "Filtering is NOT wired yet — selection updates the active pill only." Strongest AI tell on this surface. |
| TabNavigator | Excellent | Liquid Glass backdrop, spring physics, haptics, scroll awareness. Flagship-quality. |

### 1.2 Product Detail / Commerce

| Surface | Status | Critical Gaps |
|---|---|---|
| ItemDetailScreen | Excellent | Social state uses legacy Zustand (not shared `useProductSocialState` hook); `useContinueExploring` data prefetched but unused; "More like this" uses local filter not recommendation API |
| AuctionDetailScreen | Excellent | No swipe-to-dismiss (inconsistent with ItemDetail); local state instead of React Query (misses caching/devtools); `railSections`/`seenInLooksSection` computed then voided (dead code) |
| AssetDetailScreen | Excellent | Order book in local state (no polling/refresh); no swipe-to-dismiss; price alert modal uses raw `Modal` not `BottomSheet`; single image only (no multi-image gallery for co-own) |
| CommerceMediaStage | Excellent | Pinch-to-zoom, double-tap, pull-to-expand, video controls, focal points, SharedTransitionImage. Flagship-quality. |
| CommerceDetailStateDock | Excellent | Tier-adaptive CTAs, safe-area clearance, trust strip flattened into dock. Flagship-quality. |

### 1.3 Messaging

| Surface | Status | Critical Gaps |
|---|---|---|
| InboxScreen | Fair | **No real-time updates** (no WebSocket/polling); swipe actions limited (archive + read/unread only); search behind toggle |
| ChatScreen | Good | **No real-time messaging** (syncs on foreground only); **typing indicator never set to true** (dead state); no scroll-to-bottom unread count badge |
| GroupChatScreen | **Critical** | **Messages never sent to server** (local-only); no API message sync; no attachment support; no offline detection; timestamp formatting bug (raw ISO); fake retry button (timeout, not re-fetch); no `isNew` animation |
| NewMessageScreen | Good | No offline detection; search error silently clears results |
| ConversationInfoScreen | **Poor** | **Fabricated handle** (`@${counterpartyId.slice(0, 12)}` — not a real username); delete/block are store-only (no API calls); no loading skeleton |
| GroupChatInfoScreen | Fair | **Copy invite link doesn't copy** (just shows toast); uses `deleteConversationOnApi` instead of `leaveGroupOnApi` for leaving |
| GroupMembersScreen | Fair | Raw `TextInput` instead of `AppSearchBar`; 8 dead style definitions; no member removal capability |
| CreateGroupChatScreen | Good | Select stage lacks keyboard handling; no offline detection; mosaic preview shows no "+N" indicator for >4 members |
| ChatSettingsScreen | Fair | Hero card is borderline dashboard pattern; settings are store-only (no API persistence) |
| ChatMediaPreviewScreen | Fair | No pinch-to-zoom; no swipe navigation; retry just clears error state (doesn't re-fetch) |
| MessageRequestsScreen | Fair | Accept/decline are store-only (no API); no loading state; local `BodyEmphasisLine` helper instead of shared primitives |
| ManageQuickRepliesScreen | Fair | Store-only (no API persistence); raw `TextInput` instead of `AppInput`; uses legacy `KeyboardAvoidingView` not `KeyboardStickyView` |
| ArchivedConversationsScreen | Fair | Delete is store-only (no API); no offline detection |
| SharedConversationMediaScreen | Fair | **Loading state uses 1ms timeout** (skeleton never shows — bug); video tiles show placeholder not thumbnail; no multi-select |
| EditGroupScreen | Fair | Uses `deleteConversationOnApi` instead of `leaveGroupOnApi`; **description not saved to API** (only title sent); no group photo editing |
| GroupBotManagementScreen | Good | No search/filter; status labels hardcoded |

### 1.4 Profile / Identity

| Surface | Status | Critical Gaps |
|---|---|---|
| MyProfileScreen | Good | **Duplicate settings button** (rendered twice in top utility row); no tab content crossfade; no owner pin/unpin UI; no curated shop-window rail; no OfflineBanner; no profile-level loading skeleton |
| UserProfileScreen | Good | **Response time missing from public trust line** (owner hero shows it); no haptics on follow/message/share; no tab crossfade; no OfflineBanner; no shop-window rail |
| EditProfileScreen | Fair | **Missing private/security/account sections** (Design.md D requires email, Password/2FA, Account Control); dead `focus` param (passed but never consumed); no username availability check |
| ClosetScreen | Good | No tab content crossfade; FAB-style create button (Material pattern, not iOS-native); no shared element transition to PDP |
| FollowersScreen / FollowingScreen | Fair | **99% identical code** (378 lines each) — should be one `ConnectionListScreen` with `mode` prop; no shared element transition; no mutual-follow indicator |
| SellerVerificationScreen | Good | Summary banner is a centered card (dashboard widget); no OfflineBanner |
| SellerHubScreen | Good | `width: '48%'` fragile grid; no OfflineBanner |
| SellerAnalyticsScreen | Good | Top listing cards are bordered (only bordered cards on screen — mixed containment); no period-over-period delta |
| SellerEarningsScreen | Good | "Seller balance" chip is decorative chrome; dead `borderTopColor: 'transparent'` style; no OfflineBanner |
| MyListingsScreen | Fair | Toast-only error (no error state component); `width: '48%'` fragile grid; 4 quick actions (too many); no OfflineBanner |
| InventoryManagementScreen | Good | Sort menu is bordered dropdown (breaks flat grammar); 4 quick actions per row (dense); no shared element transition |

### 1.5 Settings / Account / Utility / Auth

| Surface | Status | Critical Gaps |
|---|---|---|
| SettingsScreen (root) | Good | **SettingsRow minHeight: 50pt** (spec is 56–64pt) — affects all settings screens; no profile card loading skeleton; disabled rows missing 0.4 opacity |
| AccountSettingsScreen | Good | Inherits SettingsRow defects |
| DeleteAccountScreen | Good | **Raw `TextInput` without focus states** (violates form-field micro spec); biometric gate is excellent |
| PrivacySettingsScreen | Fair | **Silent fetch failure** — `fetchPrivacyPreferences` catch leaves skeleton permanently visible and toggles permanently disabled |
| NotificationPreferencesScreen | Good | Honest persistence banner; local-only (acceptable) |
| PushNotificationsScreen | Good | Overlaps significantly with NotificationPreferencesScreen — consolidate |
| EmailNotificationsScreen | Good | Custom rows instead of `SettingsRow` (inconsistent primitives) |
| PersonalisationScreen | Good | Clean |
| SustainabilityPreferencesScreen | Fair | **Preferences not persisted** (local `useState` only — lost on restart); demo mode honestly labelled |
| AIPreferencesScreen | Fair | **Preferences not persisted** (local `useState` only); benefit-oriented labels (excellent) |
| YourAlgorithmScreen | Excellent | Best-in-class state coverage; raw `TextInput` for topic input (minor) |
| HelpSupportScreen | Fair | FAQs hardcoded (should be CMS-backed); raw `TextInput` for search |
| SupportTicketDetailScreen | Fair | Multiple elevated cards (card-heavy composition); no reply action |
| AboutScreen | Good | Custom rows instead of `SettingsRow` (56pt — ironically taller than shared primitive) |
| InviteFriendsScreen | Fair | **5+ cards stacked** (most card-heavy screen); hero card with centered icon is mild AI tell |
| AuthLandingScreen | Excellent | Wordmark, trust signals, social-first. Flagship-quality. |
| LoginScreen | Excellent | 2FA inline, OTP, magic link, password strength. Flagship-quality. |
| SignUpScreen | Excellent | 3-step progressive disclosure, password strength, terms checkbox. Flagship-quality. |
| ForgotPasswordScreen | Good | Clean, focused, spam hint. |
| BotDirectoryScreen | Good | Truthful AI capability labelling. |
| CustomBotsScreen | Good | Clean. |
| BotDetailScreen | Good | Clean. |
| BotBuilderScreen | Good | Clean. |

### 1.6 Content Creation / Listing / Camera

| Surface | Status | Critical Gaps |
|---|---|---|
| SellScreen | Good | **No in-app camera** (uses `ImagePicker.launchCameraAsync` — system camera); no empty state for zero media; no draft persistence indicator; publication stage not visualized; no tag autocomplete |
| EditListingScreen | Good | **Photo reorder disabled** ("Existing listing photos cannot be removed or reordered yet"); no save-success haptic; preview navigates without saving |
| BulkListingScreen | Fair | No success haptic on bulk submit; no offline state; no draft persistence; one-at-a-time photo picking |
| ManageListingScreen | Good | No haptic on status changes; overflow menu uses native `Alert.alert` |
| CreateCollectionScreen | Fair | No empty state for zero saved listings; no cover image selection |
| CreateSyndicateScreen | Good | No KYC verification UI flow; recourse agreement is wall of text; no back navigation between stages |
| CreatorEntryScreen | Excellent | Camera-first is the correct flagship pattern. |
| CreatorCamera | Excellent | Full vision-camera, tap-to-focus, multi-capture, effects, grid, timer. Flagship-quality. |
| AIPhotoEnhancementScreen | Excellent | **Best-in-class AI truthfulness** — demo mode banner, `AITrustSignal` component, honest before/after. |
| AIPoweredListingScreen | Good | Same camera gap as SellScreen; no retake in capture flow; analysis auto-runs (could waste compute) |
| ConversationalSearchScreen | Excellent | Honest keyword matching (not LLM); no voice input; no search history |
| OutfitBuilderScreen | **Poor** | **No loading/empty/error/offline states** — most significant gap; no share preview; no drag-to-slot |
| MoodboardEditorScreen | Good | Full gesture support (pan/pinch/rotate); no export/share; no multi-select |
| MoodboardHomeScreen | Good | True Pinterest-style masonry; no search/filter on public moodboards |
| StyleQuizScreen | Good | Clean. |
| LookDetailScreen | Excellent | Floating transparent header, tag hotspots, `CreatorCanvas` WYSIWYG. |
| GalleriaScreen | Good | **No backend** (demo-only → prod breaks); no editorial detail screen |
| GalleriaCollectionDetailScreen | Good | Parallax hero, shared-element transition. **No backend.** |
| CreatePosterHighlightScreen | Good | No drag-to-reorder; no preview before create |
| PosterArchiveScreen | Good | No bulk delete |
| PosterViewerScreen | Excellent | Full gesture suite, 3-layer preloading, reduced-motion support. Flagship-quality. |
| PosterHighlightViewerScreen | Fair | **No direct highlight API** (fetches all highlights to find one); **error retry is broken** (dead code — just goes back); no reactions/replies |
| PosterStoryActivityScreen | Good | No date range filter; no export |

### 1.7 Auction / Co-Own / Financial

| Surface | Status | Critical Gaps |
|---|---|---|
| AuctionHomeScreen | Excellent | Editorial composition, server-aligned countdowns. Magic `Space.xxl ×7 − 20` category tile height. |
| AuctionDetailScreen | Excellent | Truthful terminal labels, fulfilment contract, haptic patterns. No swipe-to-dismiss. |
| AuctionsScreen (legacy) | Fair | Overlaps with AuctionHomeScreen — confirm if still routed; `progress` derived from fixed 6h window (arbitrary) |
| CreateAuctionScreen | Good | No risk/trust disclosure before create action |
| MyBidsScreen | Good | Uses device `new Date()` not server clock (drift risk) |
| SellerAuctionCentreScreen | Good | Clean. |
| AssetDetailScreen | Excellent | **Audit `CoOwnPriceChart`/`CoOwnCandleChart` data source** (fake chart risk); order book fetched once (no polling); `yourUnits` defaults to `0` when logged out vs `null` when logged in |
| AssetDueDiligenceScreen | Good | Clean. |
| AssetLeaderboardScreen | Good | Rankings by real allocation (no speculative metrics). Strong truthful-UI. |
| PortfolioScreen | Good | **Audit `CoOwnPortfolioPerformanceChart` data source**; `todayChangePct` defaults to `0` (should show "—" when undefined) |
| TradeScreen | Good | `asset: any` type (should be `MarketCoOwnAsset`); dead `orderMode = 'limit'` variable; order book fetched once (no polling) |
| TradeConfirmScreen | Good | `HoldToSubmitButton` for large orders; reservation auto-release. Strong. |
| TradeHubScreen | Good | **`orderIdMatch` regex** on backend ID (fragile); `formatRelativeTime` uses device clock |
| WalletScreen | Good | Biometric gate, safeguarding evidence, reconciliation state. Strong. |
| WalletActivityScreen | Good | Clean. `limit=200` (consider pagination). |
| WalletConvertScreen | Good | Fee rate explicit; real `goldRates`. Verify rate timestamp/expiry. |
| WithdrawScreen | Good | Country capability policy enforced; FX quote via real API. |
| PaymentsScreen | Good | `Promise.allSettled` for resilient hydration. |
| BalanceHistoryScreen | Good | Net flow hero is flat (no card). `hydrate` and `useEffect` duplicate fetch logic. |
| MarketLedgerScreen | Good | `formatMoney` lacks `tabular-nums`; uses `£` prefix (bypasses 1ZE/fiat preference) |
| DistributionHistoryScreen | Good | Optimistic DRIP update with rollback. `formatDistributionAmount` lacks `tabular-nums`. |
| CoOwnIssueScreen | Fair | Submit only shows toast + navigates (no backend issue creation) |
| CoOwnPriceAlertsScreen | Good | No offline state; `formatGbp` lacks `tabular-nums` |
| CoOwnRecurringOrdersScreen | Fair | Create modal uses raw `assetId` text input (users can't remember asset IDs); `formatGbp` lacks `tabular-nums` |
| CoOwnTaxDocumentsScreen | Good | Realized P&L dominance correct; UK tax-year honoured. No PDF download. |
| CorporateActionDetailScreen | Good | Missing fields show "—". `formatAmount` lacks `tabular-nums`. |
| SyndicateHubScreen | Good | **Audit 'roi' sort metric** (speculative metric risk); `unitPriceGBP` vs `unitPriceStable` ambiguity |
| SyndicateOnboardingScreen | Good | Honest risk disclosure. Magic `Space.xxl ×7 + 8` icon ring size. |
| SyndicateOrderHistoryScreen | Good | Transparent data provenance (`source: 'seeded' | 'ledger' | 'backend'`). `pricePerShare` fallback could mislead. |
| LiveShoppingHomeScreen | Fair | `LivePulse` is static dot (no animation); demo mode flagged |
| LiveStreamViewerScreen | Fair | **No production WebSocket bid path** (demo simulation only); current-lot panel lacks `tabular-nums`; verify auto-scroll-to-bottom |
| LiveStreamSellerScreen | **Critical** | **Camera preview is a placeholder** (no real WebRTC); `DEMO_LOTS` hardcode Unsplash URLs; demo clearly labelled but not production-routable |

### 1.8 Backend / Platform

| Layer | Status | Critical Gaps |
|---|---|---|
| API framework (Fastify 5) | Good | Monolithic `index.ts` (~21k lines) — co-own routes inline |
| DB (PostgreSQL 16) | Good | Raw SQL via `pg` (no ORM). Kysely for types only. |
| Cache (Redis 7) | Good | Rate-limit, search cache, BullMQ, realtime bridge |
| Search (Meilisearch v1.12) | Good | Pluggable adapter with in-memory fallback |
| Media storage (MinIO) | Good | Presigned uploads |
| **Image pipeline** | **Critical** | **`sharp` declared but never imported.** No thumbnails, WebP/AVIF, blurhash, focal-point crops. Mobile downloads raw originals. |
| Queues (BullMQ) | Good | Auction sweep, mint reserve, outbox drain, push notifications |
| Real-time (WebSocket + SSE) | Good | Seq/replay/gap detection; Redis pub/sub bridge. **Not wired to messaging.** |
| Live shopping (LiveKit) | Fair | Session lifecycle + tokens work; **no backend for live chat, in-stream bids, current-item state, viewer count broadcast** |
| ML service (Python FastAPI) | **Poor** | **Heuristic baselines only — no trained models.** `/classify-image` returns 501. No image embeddings. |
| Crypto boundary (key-service) | Good | AES-GCM with key-versioned ciphertext |
| Auth (JWT) | Good | Access/refresh rotation, reuse detection, TOTP 2FA, Apple/Google social |
| Payments (Stripe/Razorpay/Mollie) | Good | Connect payouts, webhook verification |
| Observability (Sentry/OTel/Prometheus) | Good | `/metrics`, OTLP exporter, SLO tracker |
| **SSL pinning** | **Critical** | **Missing.** Plain `fetch` with no certificate pinning. MITM via installed CA possible. |
| **Autocomplete** | **Poor** | Backend endpoint exists but frontend never calls it (client-side catalogue instead). Contract mismatch (`string[]` vs `AutocompleteSuggestion[]`). |
| **Feed pagination** | **Poor** | `/feed/home` hard `LIMIT 20`, no cursor. Infinite scroll cannot load more. |
| **Feed ranking** | **Poor** | `ORDER BY created_at DESC` — no ranking score. `DiscoveryFeedUnit` contract expects server-driven ranking. |

---

## 2. Cross-Cutting Findings

### 2.1 Real-Time Gaps (Critical)

**No messaging surface has real-time updates.** The backend has a WebSocket + SSE realtime bridge (`realtime.ts` with Redis pub/sub), but it is not wired to the messaging UI. All conversations go stale until manual refresh or app foreground. This is the single biggest gap vs Instagram/Snapchat.

**Affected surfaces:** InboxScreen, ChatScreen, GroupChatScreen, NewMessageScreen, ConversationInfoScreen.

**Typing indicators:** `isTyping` state exists in ChatScreen but is never set to `true` — dead state.

### 2.2 Backend Live-Signs Failures (Critical)

Six flagship surfaces have **no production backend** — in production builds, mocks are OFF and these surfaces return empty/error:

| Surface | Frontend wiring | Production behavior |
|---|---|---|
| Live Shopping (viewer) | `throw new Error('not configured for production')` | **Crashes** |
| Galleria | `GALLERIA_DEMO_MODE = __DEV__` | Empty |
| Moodboard | `MOODBOARD_DEMO_MODE = __DEV__` | Empty |
| Conversational Search | Client-side keyword matching | Works but not real |
| AI Photo Enhancement | Demo mode | Returns original image |
| Smart Sell / Listing Quality | Demo mode | Illustrative only |

**Recommendation:** Either build the backends or explicitly mark these screens as "coming soon" with honest empty states rather than shipping mock-only services that throw in prod.

### 2.3 Camera Strategy Gap (High Impact)

The creator infrastructure has a full `react-native-vision-camera` implementation (`CreatorCamera.tsx`, 74KB) with tap-to-focus, multi-capture, effects, grid, timer, and quick-review. However, **none of the listing flows use it**:

| Screen | Camera | Quality |
|---|---|---|
| SellScreen | `ImagePicker.launchCameraAsync` | System camera |
| EditListingScreen | `ImagePicker.launchCameraAsync` | System camera |
| BulkListingScreen | `ImagePicker.launchImageLibraryAsync` | Gallery only |
| AIPoweredListingScreen | `ImagePicker.launchCameraAsync` | System camera |
| CreatorEntryScreen | `CreatorCamera` (vision-camera) | Full in-app camera |

**Recommendation:** Bridge `CreatorCamera` into the listing flow as an optional capture path.

### 2.4 Inconsistent Primitives (High Impact)

| Primitive | Implementations | Affected surfaces |
|---|---|---|
| Masonry grid | 3: `PinterestMasonryGrid` (FlashList), `MasonryGrid` from `ProductCardV2`, manual two-column in GlobalSearch | HomeScreen, BrowseScreen, GlobalSearch, ExploreCollection, VisualSearch, CategoryDetail |
| Sort UI | 3: inline sort menu (Browse/CategoryDetail), `BottomSheet` (GlobalSearch), bordered dropdown (InventoryManagement) | Browse, CategoryDetail, GlobalSearch, InventoryManagement |
| Error state | 3: `CommerceStateCanvas`, `CoOwnStateCanvas`, `FlagshipState` | ItemDetail, AssetDetail, settings screens |
| Search bar | 2: `AppSearchBar` (real input), fake Pressable (SearchScreen/HomeScreen) | GlobalSearch, SearchScreen, HomeScreen |

**Recommendation:** Consolidate to one implementation per primitive.

### 2.5 AI Truthfulness — Best-in-Class

Every AI-adjacent screen has honest demo-mode labelling:
- `AI_PHOTO_DEMO_MODE`, `SMART_SELL_DEMO_MODE`, `CONVERSATIONAL_SEARCH_DEMO_MODE`, `MOODBOARD_DEMO_MODE`, `GALLERIA_DEMO_MODE`, `LIVE_SHOPPING_DEMO_MODE`, `ALGORITHM_DEMO_MODE`, `CHAT_AGENTS_DEMO_MODE`, `SUSTAINABILITY_DEMO_MODE`
- `AITrustSignal` component (confidence + source + context + reasoning)
- OutfitBuilder labels scoring as "heuristic, not ML"
- Price is NOT auto-filled in AI listing — seller picks their own

**This is the strongest pattern in the codebase and should be maintained as a non-negotiable standard.**

### 2.6 State Coverage Matrix (Gaps)

| Missing state | Screens |
|---|---|
| **No loading/empty/error** | OutfitBuilder (all states missing), PulseFeed (error/offline), GroupChat (offline), several messaging screens |
| **No OfflineBanner** | MyProfile, UserProfile, SellerVerification, SellerHub, SellerEarnings, MyListings, PulseFeed, GroupChat, several messaging screens |
| **No reduced motion** | SellScreen, EditListingScreen, BulkListingScreen, MoodboardHome, Galleria, PosterArchive, CreateSyndicate |
| **No tab content crossfade** | MyProfile, UserProfile, Closet (all use instant conditional swap) |

### 2.7 Store-Only Mutations (Correctness Bugs)

Multiple messaging screens have mutations that **never reach the server**:

| Screen | Mutation | Issue |
|---|---|---|
| GroupChatScreen | Send message | **Local-only, never sent to server** |
| ConversationInfoScreen | Delete, block | Store-only |
| MessageRequestsScreen | Accept, decline | Store-only |
| ArchivedConversationsScreen | Delete | Store-only |
| ChatSettingsScreen | All settings | Store-only |
| ManageQuickRepliesScreen | Quick replies | Store-only |
| EditGroupScreen | Description | Not saved to API (only title) |
| GroupChatInfoScreen | Copy invite link | Doesn't copy (just shows toast) |

### 2.8 Package Audit Summary

| Category | Status | Action |
|---|---|---|
| Core platform | Current (Expo 57, RN 0.86.2, React 19.2.3, TS 6) | — |
| Animation/Gesture | Behind: `react-native-reanimated` (4.3.4 vs 4.5.3), `@shopify/react-native-skia` (2.6.2 vs 2.11.0), `react-native-worklets` (0.8.3 vs 0.12.x) | Upgrade |
| Lists/Performance | Behind: `@shopify/flash-list` (2.0.2 vs 2.3.2) | Upgrade |
| Observability | Behind: `react-native-sentry` (7.11.0 vs 8.0.0) | Upgrade |
| i18n | **Critical gap** — libraries installed but only 1 `useTranslation` call found | Adopt |
| Dead dependencies | `react-native-nitro-image` (dead) | Remove |
| Type safety | `tsc --noEmit` fails | Fix |

### 2.9 Anti-AI Design Tells — Summary

The codebase is **largely free of AI-made design tells**:
- No generic dashboard silhouettes (composition is media-first on discovery surfaces)
- No card-on-card stacking (flat canvas + hairlines is the default)
- No label-everything disease (object is the label on most surfaces)
- No decorative chrome (transparent 44pt hit targets, no grey circles)
- No placeholder-grade media (`CachedImage` with contentFit + priority)
- Consistent radius grammar (2 non-avatar radii per viewport)
- One icon family (Ionicons) with consistent optical sizes
- No excessive motion (animations are meaningful and reduced-motion-aware)

**Remaining tells:**
- OutfitBuilder lacks state coverage (feels scaffold-level)
- PosterHighlightViewer error retry is broken (dead code)
- CreateSyndicate recourse agreement is a wall of text
- CategoryTreeScreen hardcoded `TREES` + "SHOP BY" kicker
- DiscoverScene non-functional category pills
- GlobalSearchScreen invisible focus animation (no-op `interpolateColor`)
- SearchScreen fake search input (Pressable styled as input)
- InviteFriendsScreen 5+ cards stacked

---

## 3. Prioritized Upgrade Targets

### P0 — Critical (breaks flagship perception or production correctness)

| # | Target | Surface | Impact |
|---|---|---|---|
| 1 | Wire real-time messaging (WebSocket) | All messaging | Conversations go stale without manual refresh |
| 2 | Fix GroupChatScreen to use real API | GroupChat | Messages never sent to server |
| 3 | Implement server-side image pipeline (`sharp`) | Backend | Mobile downloads raw originals — bandwidth, memory, scroll jank |
| 4 | Add SSL pinning | apiClient | MITM via installed CA possible for wallet-bearing app |
| 5 | Wire autocomplete to backend | Search | Backend endpoint exists but frontend never calls it |
| 6 | Build live-shopping viewer backend | Live Shopping | `fetchLiveChatMessages` throws in production |
| 7 | Add backend for Galleria/Moodboard/Conversational Search | Discovery | Mock-only → prod breaks |
| 8 | Fix GlobalSearchScreen invisible focus animation | GlobalSearch | `interpolateColor` from `surfaceAlt` to `surfaceAlt` is a no-op |
| 9 | Replace SearchScreen fake search with real inline input | Explore | Pressable styled as input — major defect vs Pinterest/Instagram |
| 10 | Wire DiscoverScene category pills to filtering | Explore | "Filtering is NOT wired yet" — strongest AI tell |
| 11 | Fix GroupChatInfoScreen copy invite link | GroupChatInfo | Doesn't copy to clipboard (just shows toast) |
| 12 | Fix ConversationInfoScreen fabricated handle | ConversationInfo | `@${counterpartyId.slice(0, 12)}` is not a real username |
| 13 | Fix PosterHighlightViewer error retry | PosterHighlight | Dead code — just goes back instead of retrying |
| 14 | Fix SharedConversationMedia loading state | SharedMedia | 1ms timeout — skeleton never shows |
| 15 | Fix PrivacySettingsScreen silent fetch failure | PrivacySettings | Skeleton stays forever, toggles permanently disabled |

### P1 — High (inconsistent primitives, missing states, UX gaps)

| # | Target | Surface | Impact |
|---|---|---|---|
| 16 | Consolidate to one masonry implementation | All discovery | 3 implementations currently |
| 17 | Consolidate to one sort UI | All browse | 3 implementations currently |
| 18 | Bridge CreatorCamera into listing flow | Sell/Edit/AIListing | System camera instead of flagship in-app camera |
| 19 | Add state coverage to OutfitBuilder | OutfitBuilder | No loading/empty/error/offline |
| 20 | Add OfflineBanner to all network-dependent screens | 10+ screens | MyProfile, UserProfile, SellerHub, etc. |
| 21 | Add tab content crossfade | Profile/Closet | Instant swap breaks polished underline animation |
| 22 | Fix SettingsRow minHeight (50→56pt) | All settings | Below Design.md spec by 6–14pt |
| 23 | Add response time to public profile trust line | UserProfile | Top-3 conversion signal, owner hero shows it |
| 24 | Fix duplicate settings button on MyProfile | MyProfile | Rendered twice in top utility row |
| 25 | Add real API calls to store-only mutations | Messaging | Delete, block, accept/decline, settings, quick replies |
| 26 | Add cursor pagination to feed endpoints | Backend | `/feed/home` hard LIMIT 20, no cursor |
| 27 | Make `/feed/home` return DiscoveryFeedUnit contract | Backend | Frontend contract expects ranked units, backend returns raw buckets |
| 28 | Add direct highlight API endpoint | Backend | Current workaround fetches all highlights |
| 29 | Enable photo reorder in EditListingScreen | EditListing | Currently disabled with locked note |
| 30 | Audit CoOwnPriceChart/CoOwnCandleChart data source | AssetDetail | Fake chart risk — confirm backend OHLC |
| 31 | Audit CoOwnPortfolioPerformanceChart data source | Portfolio | Confirm backend-provided performance series |
| 32 | Audit SyndicateHub 'roi' sort metric | SyndicateHub | Confirm backend-computed ROI |
| 33 | Poll order book on trade surfaces | AssetDetail/Trade | Static book misleads traders |
| 34 | Replace `asset: any` in TradeScreen | Trade | Type-safety bypass |
| 35 | Replace `orderIdMatch` regex in TradeHubScreen | TradeHub | Fragile regex on backend ID |
| 36 | Add `tabular-nums` to all financial value helpers | 6+ screens | `formatMoney`/`formatGbp`/`formatAmount` lack it |
| 37 | Use `useBucketedServerClock` in MyBidsScreen | MyBids | Device `new Date()` causes drift |
| 38 | Persist SustainabilityPreferences and AIPreferences | Settings | Lost on app restart |
| 39 | Replace raw `TextInput` with `AppInput` | DeleteAccount, YourAlgorithm, HelpSupport | No focus state border change |
| 40 | Fix AppInput border width shift on focus | AppInput | 1px→2px causes layout shift |

### P2 — Medium (polish gaps)

| # | Target | Surface |
|---|---|---|
| 41 | Remove redundant search prompt on HomeScreen | Home |
| 42 | Replace module-level `Dimensions.get('window')` with `useWindowDimensions` | Browse |
| 43 | Move VisualSearchScreen scan animation to native driver | VisualSearch |
| 44 | Replace PulseFeedScreen ScrollView with FlashList | PulseFeed |
| 45 | Replace CategoryTreeScreen hardcoded TREES with backend data | CategoryTree |
| 46 | Merge FollowersScreen and FollowingScreen | Profile |
| 47 | Add curated shop-window rail to profiles | MyProfile/UserProfile |
| 48 | Add owner pin/unpin UI to MyProfile | MyProfile |
| 49 | Flatten InviteFriendsScreen card composition | InviteFriends |
| 50 | Add empty state for zero media in SellScreen | Sell |
| 51 | Visualize publication stage progress in SellScreen | Sell |
| 52 | Add save-success haptics to EditListing/BulkListing | Listings |
| 53 | Add haptics to UserProfile follow/message/share | UserProfile |
| 54 | Expose mute/pin/delete as swipe actions in Inbox | Inbox |
| 55 | Add scroll-to-bottom unread count badge in ChatScreen | Chat |
| 56 | Implement typing indicators (needs WebSocket) | Chat |
| 57 | Add `leaveGroupOnApi` for leaving groups (not `deleteConversationOnApi`) | GroupChatInfo/EditGroup |
| 58 | Add attachment support to GroupChatScreen | GroupChat |
| 59 | Fix EditGroupScreen description not saved to API | EditGroup |
| 60 | Add private/security/account sections to EditProfile | EditProfile |
| 61 | Consume `focus` param in EditProfileScreen | EditProfile |
| 62 | Add `flex: 1` instead of `width: '48%'` to dashboard grids | SellerHub/MyListings |
| 63 | Reduce verbose empty-state copy across all screens | All |
| 64 | Unify search placeholder text | All search surfaces |
| 65 | Remove "SHOP BY" kicker from CategoryTreeScreen | CategoryTree |
| 66 | Add `tabular-nums` to rank/metric values in AssetLeaderboard | Leaderboard |
| 67 | Replace `DEMO_LOTS` Unsplash URLs with gated demo assets | LiveSeller |
| 68 | Add `LivePulse` animation (reduced-motion guarded) | LiveShopping |
| 69 | Extract `useAuctionCardProps(item)` hook | AuctionHome |
| 70 | Replace magic `Space.xxl ×7 − 20` with named constant | AuctionHome |
| 71 | Add risk/trust disclosure before auction create | CreateAuction |
| 72 | Add PDF download to CoOwnTaxDocuments | TaxDocs |
| 73 | Replace raw `assetId` text input with asset picker | CoOwnRecurringOrders |
| 74 | Add backend issue creation to CoOwnIssueScreen | CoOwnIssue |
| 75 | Add offline state to CoOwnPriceAlerts | PriceAlerts |
| 76 | Add date range filter to PosterStoryActivity | PosterActivity |
| 77 | Add drag-to-reorder in CreatePosterHighlight | PosterHighlight |
| 78 | Add bulk delete to PosterArchive | PosterArchive |
| 79 | Add editorial detail screen to Galleria | Galleria |
| 80 | Add visual outfit export in OutfitBuilder | OutfitBuilder |
| 81 | Add voice input to ConversationalSearch | ConversationalSearch |
| 82 | Add first-run overlay to CreatorEntryScreen | Creator |
| 83 | Add onboarding overlay for first-time users | Creator |
| 84 | Consolidate PushNotifications and NotificationPreferences | Settings |
| 85 | Migrate EmailNotifications custom rows to SettingsRow | EmailNotifications |
| 86 | Add FAQs to CMS/backend | HelpSupport |
| 87 | Add reply action to SupportTicketDetail | SupportTicket |
| 88 | Add email/username availability checks to SignUp | SignUp |
| 89 | Add password strength indicator to ChangePassword | ChangePassword |
| 90 | Add biometric gate coverage to PaymentsScreen irreversible actions | Payments |

### P3 — Low (minor polish)

| # | Target | Surface |
|---|---|---|
| 91 | Consolidate CreateLookScreen and CreateLookRedirect | Creator |
| 92 | Add tag autocomplete in SellScreen | Sell |
| 93 | Add pricing suggestion in EditListingScreen | EditListing |
| 94 | Add mutual-follow indicator to Followers/Following | Profile |
| 95 | Add shared element transition to Closet tiles | Closet |
| 96 | Add video scrubber to PosterViewer | PosterViewer |
| 97 | Add multi-select to SharedConversationMedia | SharedMedia |
| 98 | Add search/filter to public moodboards | MoodboardHome |
| 99 | Add multi-select to MoodboardEditor | Moodboard |
| 100 | Add back navigation between CreateSyndicate stages | CreateSyndicate |
| 101 | Break CreateSyndicate recourse agreement into bullet points | CreateSyndicate |
| 102 | Remove dead styles in GroupMembersScreen | GroupMembers |
| 103 | Add "+N" indicator to CreateGroupChat mosaic | CreateGroup |
| 104 | Add "Test notification" button | Notification settings |
| 105 | Add referral history to InviteFriends | InviteFriends |
| 106 | Add "Rate Thryftverse" and "Share with friends" to About | About |
| 107 | Add slide transition animation to SyndicateOnboarding | Onboarding |
| 108 | Add "Back to asset" sticky dock to AssetDueDiligence | DueDiligence |
| 109 | Add FX quote timestamp/expiry to WalletConvert/Withdraw | Wallet |
| 110 | Add pagination to BalanceHistory (currently fixed 50) | BalanceHistory |

---

## 4. Dependency Upgrade Priorities

| Package | Current | Latest | Priority | Usage |
|---|---|---|---|---|
| `react-native-reanimated` | 4.3.4 | 4.5.3 | P1 | High (shared element transitions, spring physics) |
| `@shopify/react-native-skia` | 2.6.2 | 2.11.0 | P1 | High (camera frame processing) |
| `react-native-worklets` | 0.8.3 | 0.12.x | P1 | High (worklet runtime) |
| `@shopify/flash-list` | 2.0.2 | 2.3.2 | P2 | High (all masonry grids) |
| `react-native-sentry` | 7.11.0 | 8.0.0 | P2 | Medium (error reporting) |
| `react-native-nitro-image` | — | — | P2 | Dead dependency — remove |

**i18n adoption** is a critical gap — libraries are installed but only 1 `useTranslation` call exists in the entire codebase.

**Type safety** — `tsc --noEmit` currently fails. This should be fixed before any upgrades.

---

## 5. Verification Gates

Before considering any upgrade complete:

1. **Typecheck:** `tsc --noEmit` passes
2. **Visual gates:** Skeleton parity, state coverage, reduced motion, safe area
3. **Tests:** Relevant test suites pass
4. **Anti-AI tells:** No new tells introduced (flat canvas, hairlines, one icon family, restrained chrome)
5. **Truthful UI:** No fabricated data, no false AI claims, demo modes honestly labelled
6. **Performance:** FlashList virtualization, native driver animations, no module-level frozen geometry

---

## 6. Next Steps

1. **Identify highest-impact upgrade targets** from the P0/P1 list above (§3)
2. **Implement flagship upgrades per surface** using parallel subagents
3. **Verify:** typecheck, visual gates, tests
4. **Cold-critique pass** — review all changes for anti-AI tells and truthful UI

---

*Generated by Devin flagship audit, August 2026.*
