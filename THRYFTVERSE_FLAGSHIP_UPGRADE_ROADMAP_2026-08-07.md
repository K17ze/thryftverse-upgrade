# THRYFTVERSE FLAGSHIP UPGRADE ROADMAP — 2026-08-07

**Synthesis of 5 parallel research streams:** frontend UX audit, frontend architecture audit, backend architecture audit, August 2026 online best-practices research, and existing audit-reports synthesis.

**Current state:** UI/UX rated 6/10 by the human user. Production readiness ~60% frontend, ~65% backend. Target: flagship 9/10, production-competitive against Depop/Vinted/Vestiaire/Pinterest/Instagram/Whatnot/GOAT/StockX as of August 2026.

---

## PROGRESS LOG — Updated 2026-08-07 (Wave 1 + Wave 2 complete)

### Wave 1: Shared Primitives + High-Impact Screen Fixes (COMPLETE)
**32 files changed, +428 / -611, typecheck clean**

| # | Fix | Files | Status |
|---|---|---|---|
| 1 | AppButton icon chrome — removed 30pt grey circle, transparent 44pt hit target | AppButton.tsx | ✅ |
| 2 | EmptyState AI slop — removed hint, suggestedActions, secondaryCta, icon ring | EmptyState.tsx + 4 callers | ✅ |
| 3 | ProductCardV2 badge proliferation — max 1 badge (sold > priceDrop), removed condition/sustainability | ProductCardV2.tsx | ✅ |
| 4 | FlagshipProductCard — removed decorative chrome + bottom overlay, price moved to metadata | FlagshipProductCard.tsx | ✅ |
| 5 | GlobalSearchScreen — removed fake pastel TOP_SEARCH_CARDS, replaced with clean text pills | GlobalSearchScreen.tsx | ✅ |
| 6 | BrowseScreen — removed filter pill chrome, transparent + text color hierarchy | BrowseScreen.tsx | ✅ |
| 7 | ClosetScreen — removed tab chrome, count pill, filter chip backgrounds; underline indicator only | ClosetScreen.tsx | ✅ |
| 8 | AuthLandingScreen — removed decorative 4-stop gradient, flat background | AuthLandingScreen.tsx | ✅ |
| 9 | OnboardingScreen — removed 48pt icon medallion circles, bare 56pt icons with semantic color | OnboardingScreen.tsx | ✅ |
| 10 | LoginScreen + SignUpScreen — replaced shake animation with opacity pulse (reduced-motion safe) | LoginScreen.tsx, SignUpScreen.tsx | ✅ |
| 11 | CheckoutScreen — removed payment icon circle chrome, flattened balance toggle | CheckoutScreen.tsx | ✅ |
| 12 | SettingsSection — replaced opacity 0.7 with textSecondary color | SettingsSection.tsx | ✅ |
| 13 | Skeleton radii standardized to design tokens (5 files) | MasonrySkeleton, ProductGridSkeleton, ItemDetailSkeleton, ProfileSkeleton, SettingsListSkeleton | ✅ |
| 14 | NotificationsScreen skeleton radii standardized | NotificationsScreen.tsx | ✅ |

### Wave 2: Surface Budget + Remaining Screen Fixes (COMPLETE)

| # | Fix | Files | Status |
|---|---|---|---|
| 15 | SellScreen quality bar — removed panel chrome, inline 8pt color dot + text | SellScreen.tsx | ✅ |
| 16 | ItemDetailScreen — flattened BundleUpsellRow card, cleaned seller section wrapping | ItemDetailScreen.tsx, BundleUpsellRow.tsx | ✅ |
| 17 | WalletScreen — flattened flow panels, seller wallet card, info cards, quick action tiles | WalletScreen.tsx | ✅ |
| 18 | SettingsScreen — flat search bar (transparent default, border on focus), simplified searchTerms | SettingsScreen.tsx, AppSearchBar.tsx | ✅ |
| 19 | ChatScreen — verified NO shadows on message bubbles, already clean | ChatScreen.tsx | ✅ (no change) |
| 20 | HomeScreen — verified already flagship (underline tabs, 2 radii, no chrome) | HomeScreen.tsx | ✅ (no change) |

### Previous Session: Production Blocker Fixes (COMPLETE)

| # | Fix | Files | Status |
|---|---|---|---|
| 21 | Chat privacy optimistic UI revert on API failure | useStore.ts | ✅ |
| 22 | hasGoogleOAuth guard on Google sign-in button | AuthLandingScreen.tsx | ✅ |
| 23 | ChatScreen offer accept/decline/expire — call real API | ChatScreen.tsx | ✅ |
| 24 | ChatScreen sendMessage double-tap guard | ChatScreen.tsx | ✅ |
| 25 | SellScreen auth photos render actual images | SellScreen.tsx | ✅ |
| 26 | SellScreen publish double-tap guard | SellScreen.tsx | ✅ |
| 27 | MakeOfferSheet use real conversationId from API | MakeOfferSheet.tsx, ItemDetailScreen.tsx | ✅ |

### Remaining Items (Not Yet Addressed)

**Frontend architectural (larger scope, separate passes):**
- God Store (1940 lines) — split into domain-specific Zustand stores
- Inconsistent data fetching — standardize on React Query
- ChatScreen god component (2684 lines) — split into sub-components
- Navigation state loss on tab switch — preserve scroll position

**Backend blockers (infrastructure, not code):**
- Search infrastructure — deploy Meilisearch/Elasticsearch
- Media processing — enable MEDIA_PROCESSING_ENABLED
- Missing DB indexes — add composite indexes
- Mock webhook endpoints — remove from production builds
- CORS configuration — configure production origins

**AI slop remaining:**
- LiveStreamViewerScreen demo data in production code
- Mock fallbacks in production service paths (ENABLE_RUNTIME_MOCKS)
- CreatePosterHighlight placeholder "Text"

---

## 1. EXECUTIVE SUMMARY — THE REAL GAP

The single biggest gap is **contract truth & data integrity**: the UI confidently communicates features the backend cannot safely prove, and shared UI primitives carry decorative chrome (grey circles around icons, card-on-card surfaces, fabricated seed data) that makes the app feel machine-generated rather than human-authored. The fix is NOT more decoration — it is composition, hierarchy, restraint, and truthful state coverage.

**Three root-cause categories explain 80% of the 6/10 score:**

1. **Shared primitive defects** (AppButton icon chrome, EmptyState decoration, SettingsSection cards, ProductCardV2 badge proliferation) propagate across 20+ screens.
2. **AI slop** (GlobalSearchScreen fabricated seed data, EmptyState suggested-action chips, OnboardingScreen decorative icon medallions, AuthLandingScreen decorative gradient, LiveStreamViewerScreen demo data in production code, mock fallbacks in production service paths).
3. **Surface-budget violations** (card-on-card composition, filter pill chrome, tab chrome, section cards in checkout/settings/notifications/wallet) — the app wraps every row, icon, filter and section in separate grey surfaces instead of using flat canvas + hairlines.

Fixing these three categories moves the app from 6/10 to ~8.5/10. Full flagship (9/10) requires additional passes on motion refinement, state completeness, media art direction, and the backend blockers in §3.

---

## 2. FRONTEND UX — DEPARTMENT-BY-DEPARTMENT GAPS & FIXES

### 2.1 Shared primitives (root causes — fix FIRST, propagates to 20+ screens)

| Primitive | File | Defect | Fix | Impact |
|---|---|---|---|---|
| AppButton icon chrome | `components/ui/AppButton.tsx:229-235` | 30pt visible grey circle around 20-24pt glyph inside 44pt hit target | Remove iconWrap background; transparent 44pt target with glyph only | All icon buttons across app |
| EmptyState decoration | `components/EmptyState.tsx:22-112` | Hint lightbulb, suggested-action chips, 96pt/56pt icon rings | Remove hint + suggestedActions; flatten icon to 24pt glyph; keep title + optional subtitle + single CTA | 20+ screens |
| SettingsSection card-on-card | `components/settings/SettingsSection.tsx:107-112` | Every section wrapped in 12pt radius card | Flatten to canvas + hairline separators; reserve card for genuinely dominant panels | SettingsScreen + all settings surfaces |
| ProductCardV2 badge proliferation | `components/ProductCardV2.tsx:152-178` | Up to 4 badges (sold, price drop, condition, sustainability) + media indicator | Max 1 badge per card (sold > price drop); move condition/sustainability to detail only | All discovery surfaces |
| FlagshipProductCard media overlay | `components/flagship/FlagshipProductCard.tsx:153-162` | Bottom gradient overlay obscures media focal points | Move price to metadata row below image; no overlay on media | Product detail + discovery |
| Skeleton geometry shift | `components/skeletons/ProductGridSkeleton.tsx:8-14` | Hardcoded 1.35 aspect ratio vs dynamic `resolveListingMediaAspectRatio` | Match skeleton aspect ratio to actual card or use variable-height skeleton | All grid loading states |

### 2.2 Per-screen defects (ranked by user-perceived impact)

| Rank | Screen | File | Defect | Fix |
|---|---|---|---|---|
| 1 | GlobalSearch | `screens/GlobalSearchScreen.tsx:84-210` | Fabricated seed data (TOP_SEARCH_CARDS, HERO_ITEMS, FEATURED_BOARDS, EDITORIAL_SECTIONS) with empty image URIs and colorful background fallbacks | Remove all seed arrays; conditional render `if (!data.length) return null` or show empty state; never show fabricated discovery content |
| 2 | Browse | `screens/BrowseScreen.tsx:138-161` | Filter pills use `backgroundColor: colors.surface` + full radius chrome | Transparent background; text color change for active; underline indicator instead of pill chrome |
| 3 | Home | `screens/HomeScreen.tsx:88-96` | Header + filter bar + poster rail + section headers = 4+ surfaces above fold; 3 radius sizes (12/16/24) | Flatten filter pills; reduce poster card radius to 12pt; max 2 radius sizes in viewport; remove section header backgrounds |
| 4 | Closet/Profile | `screens/ClosetScreen.tsx:54-88` | Tab backgrounds, borders, count pills, filter chip chrome | Underline indicator only (2pt); transparent hit targets; no pill backgrounds |
| 5 | Checkout | `screens/CheckoutScreen.tsx:244-280` | 4+ section cards (address, payment, postage, summary) each with full surface/border/radius | Flatten to hairline separators; card surface only for payment method selector (genuinely dominant) |
| 6 | Notifications | `screens/NotificationsScreen.tsx:47-68` | Notification cards with full surface/border/radius/shadow | Flat list rows with hairline separators; card only for rich-media notifications |
| 7 | Wallet | `screens/WalletScreen.tsx:122-128` | Add 1ZE / Redeem 1ZE flows expand into card surfaces | Inline expansion with flat background; no card surface for flow panels |
| 8 | ItemDetail | `screens/ItemDetailScreen.tsx:62-77` | Seller card + bundle upsell + related rail each in separate surfaces | Flatten to single dominant surface per section; hairline separators for subsections |
| 9 | Sell | `screens/SellScreen.tsx:136-143` | Quality bar in surface with border | Inline indicator with color-coded dot + text; no panel chrome |
| 10 | Onboarding | `screens/OnboardingScreen.tsx:193-200` | 48pt radius colored icon medallion circles | Large icon (56pt) directly with semantic color; no background circle |
| 11 | AuthLanding | `screens/AuthLandingScreen.tsx:229-234` | 4-stop decorative gradient | Flat background color; gradient adds no functional value |
| 12 | Login/SignUp | `screens/LoginScreen.tsx:54-67`, `SignUpScreen.tsx:37-45` | Shake animation on error violates reduced motion | Opacity pulse or color flash; no position shake |
| 13 | Settings | `screens/SettingsScreen.tsx:111-113` | Search bar in full surface with border | Flat search with transparent background; border only on focus |
| 14 | Chat | `screens/ChatScreen.tsx` | Message bubbles with rounded corners + shadows | One-side alignment with subtle 8pt radius; no shadows |

### 2.3 AI slop inventory (must remove for flagship)

| Slop | File | Replacement |
|---|---|---|
| GlobalSearch fabricated discovery content | `GlobalSearchScreen.tsx:84-210` | Remove seed arrays; conditional render on real API data |
| EmptyState suggested-action chips | `EmptyState.tsx:95-112` | Remove suggestedActions prop; parent provides single CTA |
| EmptyState hint lightbulb | `EmptyState.tsx:72-77` | Remove hint prop; merge into subtitle if needed |
| Onboarding decorative icon backgrounds | `OnboardingScreen.tsx:141-154` | Color icon directly with semantic color; no background circle |
| AuthLanding decorative gradient | `AuthLandingScreen.tsx:229-234` | Flat background color |
| SettingsScreen manual searchTerms | `SettingsScreen.tsx:53-86` | Derive from route label + section title |
| ProductCardV2 condition badge | `ProductCardV2.tsx:166-169` | Move to detail screen only |
| SellScreen quality tips row | `SellScreen.tsx:140-142` | Numeric score + color dot only |
| ChatScreen default quick replies | `ChatScreen.tsx:212-224` | Remove defaults; user-configured or none |
| NotificationsScreen aggregated text construction | `NotificationsScreen.tsx:226-232` | Simple "X and N others [action]" |
| CreatePosterHighlight placeholder "Text" | `CreatePosterHighlightScreen.tsx:194` | Empty placeholder icon or blank |
| LiveStreamViewerScreen demo data in production | `LiveStreamViewerScreen.tsx:52-150` | Extract to demo-only component; build-time gating |
| Mock fallbacks in production service paths | `useStore.ts:1242-1251`, `marketApi.ts:712-757`, `postersApi.ts:129,509,528,547`, `BackendDataContext.tsx:63-71` | Remove ENABLE_RUNTIME_MOCKS from production services; build-time gating only |

---

## 3. BACKEND — DEPARTMENT-BY-DEPARTMENT GAPS & FIXES

### 3.1 Department readiness matrix

| Department | Status | Evidence | Blocker |
|---|---|---|---|
| Auth | READY | JWT refresh, bcrypt, TOTP 2FA, OAuth Google/Apple, magic links, rate limiting | — |
| Commerce/Checkout | READY | Listings, offers, orders, checkout reservations, Stripe/Razorpay/Mollie | — |
| Sell/Listings | READY | Full CRUD, media attachment, Q&A, reporting, related listings, price history | — |
| Poster | READY | CRUD, tags, clicks tracking | — |
| Auction | READY | Auction sweep job, reserve price, watchlist, idempotency | — |
| Notifications | READY | Device registration, event history, Expo push | — |
| Admin/Ops | READY | Sweeps, reconciliation, alerts, payouts pause | — |
| Chat | PROTOTYPE | Basic message delivery; no typing/read receipts/presence; realtime in-memory only | Realtime scaling |
| Payments/Wallet | PROTOTYPE | Stripe integration exists; escrow not audited; payout scheduling exists; 1ZE complex | Financial integrity (see §3.2) |
| Media/Uploads | PROTOTYPE | Presigned URLs work; no progress tracking; no retry; processing disabled by default | Truthful UI §11 |
| Discover/Recommendations | PROTOTYPE | Heuristic only (no trained ML); `/ai/classify-image` returns 501 | Truthful AI labels |
| CoOwn | PROTOTYPE | Extensive schema; complex logic; 7 audit blockers | Financial integrity (see §3.2) |
| Fraud | PROTOTYPE | Rule-based only; non-blocking by design | — |
| Live | STUB | No real streaming endpoints; demo data in frontend | Remove or implement |
| AI/ML | STUB | Heuristic baseline; image classification 501; chat agents depend on optional OpenAI key | Truthful AI labels |

### 3.2 Critical backend blockers (production-blocking)

| Rank | Issue | File | Fix |
|---|---|---|---|
| 1 | Realtime state in-memory only (lost on restart, no horizontal scaling) | `lib/realtime.ts:49-52` | Migrate all realtime state to Redis with pub/sub |
| 2 | No API versioning (routes at root path) | `index.ts` all routes | Add `/v1/` prefix; maintain backward compat layer |
| 3 | Inconsistent error response shapes | throughout `index.ts` | Standardize `{ok:false, code, message, details?}` with error code registry |
| 4 | Upload flow incomplete (no progress, no retry, processing disabled) | `routes/uploads.ts`, `config.ts:180-186` | Add `/uploads/progress`; implement retry with idempotency; enable media processing |
| 5 | Missing rate limiting on critical endpoints | `index.ts:12524-12535` (auth only) | Apply rate limits to all mutation + expensive read endpoints |
| 6 | Development secrets in version control | `lib/productionReadiness.ts:1-39`, `key-service/src/config.ts:47-55` | Remove all default secrets; require explicit secret generation at deploy |
| 7 | No read replica configuration in production | `docker-compose.prod.yml:62` | Require read replica; implement read query routing for GET endpoints |
| 8 | No request ID tracing | no middleware | Add request ID middleware; propagate to downstream services + logs |
| 9 | Migration rollback unsafe (removes record even if no down SQL) | `db/migrate.ts:95-101` | Require down SQL for all migrations; fail rollback if missing |
| 10 | No token revocation for access tokens | `lib/auth.ts` | Implement access token blacklist in Redis with TTL |
| 11 | Image classification returns 501 | `ml-service/app/main.py:65-75` | Wire real provider or remove classification UI from frontend |
| 12 | No presence tracking / typing / read receipts | `lib/realtime.ts` | Add presence with heartbeat; typing events; delivery status |
| 13 | Metrics endpoint unauthenticated | `index.ts:11280` | Add admin token auth to `/metrics` |
| 14 | No load testing | no scripts | Add k6 or Artillery load tests for critical endpoints |
| 15 | Inconsistent validation (mix of Zod, Fastify JSON Schema, none) | throughout `index.ts` | Standardize on Zod for all request/response validation |

### 3.3 Backend-enabled AI slop (stubs forcing frontend fabrication)

| Backend gap | Frontend fabrication forced | Fix |
|---|---|---|
| Image classification 501 | Frontend fabricates classification or hides feature | Wire real provider OR remove UI |
| Recommendations heuristic-only | Frontend may present as "AI-powered" | Honor `trained_model: false` label in UI |
| No upload progress endpoint | Frontend fabricates progress bar | Add `/uploads/progress` |
| No typing indicators | Frontend fabricates "typing..." | Add typing events to realtime |
| No read receipts | Frontend fabricates "read" status | Add delivery status tracking |
| No presence/online status | Frontend fabricates "online" indicators | Add presence with heartbeat |
| No message search | Frontend disables or fabricates | Add `/messages/search` |
| Fraud checks non-blocking | Frontend may present "account secured" | Make fraud checks blocking for high-risk actions |

### 3.4 Contract drift (frontend zod vs backend serializers)

| Contract | Drift | Fix |
|---|---|---|
| Upload finalization | Frontend uses TS interfaces (no runtime validation); folder enum missing 'smoke'; missing max-length validations | Add frontend Zod schemas mirroring backend; validate at API boundaries |
| Collections | Frontend has no Zod schema; missing refine logic (at least one field required) | Add `collectionSchemas.ts` mirroring backend |
| Recommendations | Frontend has no Zod schema; missing literal type checks (capability_level, trained_model) | Add `recommendationSchemas.ts` |
| Media assets | Frontend missing checksumSha256 regex, derivatives array, runtime validation | Add `mediaAssetSchemas.ts` |

---

## 4. FRONTEND ARCHITECTURE — ENGINEERING GAPS

| Rank | Issue | Files | Fix |
|---|---|---|---|
| 1 | Mock contamination in production paths | `useStore.ts:1242-1251`, `marketApi.ts:712-757`, `postersApi.ts:129,509,528,547`, `BackendDataContext.tsx:63-71` | Remove ENABLE_RUNTIME_MOCKS from production services; build-time gating only |
| 2 | State fragmentation (Zustand + 5 Context + TanStack Query + local) | `useStore.ts`, `BackendDataContext.tsx`, `SettingsPreferencesContext.tsx`, `CurrencyContext.tsx`, `queryClient.ts` | Zustand for client state, TanStack Query for server state, Context only for theme/i18n; migrate BackendDataContext to TanStack Query |
| 3 | AsyncStorage for sensitive data (AI provider API keys) | `aiProviderApi.ts:223-264` | Migrate all sensitive data to SecureStore |
| 4 | Incomplete Zod validation at API boundaries | `schemas/` (4 files), `services/` (46 files) | Generate frontend Zod from backend OpenAPI; add response validation to all fetchJson calls |
| 5 | Live shopping demo in production code | `LiveStreamViewerScreen.tsx:52-150` | Extract to demo-only component; build-time gating |
| 6 | Inconsistent error handling (20+ empty catch blocks) | throughout | Global error boundary at app root; standardized error reporting utility |
| 7 | Navigation migration incomplete (~100 screens import deprecated `@react-navigation/stack`) | `navigation/types.ts:8-20` | Complete migration; remove deprecated dependency |
| 8 | Media upload success fabrication (local URIs treated as delivered) | `services/mediaUpload.ts`, screens with media upload | Enforce await on finalizeUpload; honest upload states (uploading → finalizing → ready) |
| 9 | Non-null assertion abuse (30+ instances) | ChatScreen, AuctionHomeScreen, BuyerProtectionScreen | Replace with proper null checks; enable `@typescript-eslint/no-non-null-assertion` |
| 10 | Incomplete empty state coverage (~20 of 150 screens) | throughout | Audit all screens; create department-specific empty state components |
| 11 | Generic ActivityIndicator over skeletons (30+ usages) | throughout | Replace with SkeletonLoader composites; department-specific skeletons |
| 12 | i18n incomplete (English only; 47 hardcoded strings) | `i18n/index.ts`, screens | Add ≥2 more languages; audit hardcoded strings |
| 13 | No offline queue for mutations | `lib/offlineQueue.ts` (limited), `queryClient.ts` | Integrate offlineQueue with TanStack Query mutations; offline UI states |
| 14 | CoOwnIssueScreen non-functional (just navigates to HelpSupport) | `CoOwnIssueScreen.tsx:66` | Implement actual issue submission API |
| 15 | Mixed FlatList/FlashList (creator/ folder, some components) | `creator/`, some components | Migrate all FlatList to FlashList |

---

## 5. AUGUST 2026 BENCHMARKS TO HIT (from online research)

### 5.1 Must-hit for flagship parity

| Benchmark | Current | Target | Source |
|---|---|---|---|
| Hermes V1 enabled | ✅ (SDK 56) | ✅ verify + enable Worklets Bundle Mode | expo.dev/changelog/sdk-56 |
| FlashList v2 everywhere | Mixed (FlatList in creator/) | 100% FlashList v2; remove estimatedItemSize; use `masonry` prop | shopify.engineering/flashlist-v2 |
| expo-image with BlurHash/ThumbHash | Partial | BlurHash placeholders; `contentFit`; `transition` prop; `cachePolicy` | docs.expo.dev/versions/latest/sdk/image |
| 44pt/48dp touch targets | 5.5% hitSlop coverage | 100% of small controls | WCAG 2.2 §2.5.8 |
| Guest checkout + Apple Pay first | Unknown | Guest checkout default; Apple Pay above fold; first in payment order | +12-18% completion, +22.3% conversion |
| Skeleton matches final layout exactly | Partial (geometry shift in ProductGridSkeleton) | Same height/width/aspect-ratio; honor reduced-motion | CLS 0.00, 50% faster perceived perf |
| Motion tokens (150ms default state-confirmation) | motionTokens.ts exists | Verify durations: fast 120ms, base 200ms, medium 280ms, slow 400ms, slower 600ms | skills.smoothui.dev/docs/motion |
| Dark mode parity (not inversion) | Partial | Reduce saturation 10-20%; increase lightness 5-10%; 4 surface elevation levels; no pure black/white | mantlr.com/blog/dark-mode-design-guide |
| Progressive trust signals | Partial | Tier 1 email/phone; Tier 2 gov ID for >$500; Tier 3 business for pro sellers; contextual badges | techvinta.com/blog/marketplace-trust-and-safety-playbook |
| Shared element transitions (list → detail) | Underused | Reanimated sharedTransitionTag with spring `{damping:20, stiffness:200}` | rorklab.net |
| Sentry full feature set | DSN placeholder | Error + logs + tracing + session replay + profiling + GlobalErrorBoundary | docs.sentry.io/platforms/react-native |
| EAS Update gradual rollouts | Unknown | Preview + production channels; fingerprint detection; appVersion runtime policy; 1-5% rollout start | expo.dev/blog/the-production-playbook-for-ota-updates |

### 5.2 Liquid Glass (iOS 26) — restrained use only

Per AGENTS.md §4 (no glass effects as decoration) AND Apple HIG: use Liquid Glass ONLY for navigation bars, floating panels, sheets, contextual controls. AVOID for main text, forms, dense tables, reading screens. Never stack glass on glass. Test with reduce transparency. The `@callstack/liquid-glass` 0.8 dependency is present — verify it is used ONLY where Apple HIG permits, not as decorative chrome.

---

## 6. PRIORITIZED IMPLEMENTATION PLAN

### Phase A — Shared primitives (highest leverage, propagates to 20+ screens)
1. AppButton: remove iconWrap background → transparent 44pt target
2. EmptyState: remove hint + suggestedActions + icon ring → title + subtitle + single CTA
3. SettingsSection: flatten card → canvas + hairline separators
4. ProductCardV2: max 1 badge (sold > price drop); remove condition/sustainability from cards
5. FlagshipProductCard: remove bottom overlay → price in metadata row
6. ProductGridSkeleton: match actual card aspect ratio

### Phase B — AI slop removal (highest user-perceived impact on trust)
7. GlobalSearchScreen: remove all fabricated seed arrays; conditional render on real API data
8. LiveStreamViewerScreen: extract demo data to demo-only component with build-time gating
9. Remove ENABLE_RUNTIME_MOCKS from production service paths (useStore, marketApi, postersApi, BackendDataContext)
10. OnboardingScreen: remove icon medallion backgrounds → direct semantic-colored icons
11. AuthLandingScreen: flatten gradient → flat background
12. ChatScreen: remove default quick replies

### Phase C — Surface-budget flattening (composition quality)
13. BrowseScreen: flatten filter pills → transparent + text color + underline
14. HomeScreen: flatten filter bar; reduce radius mix to 2 sizes; remove section header backgrounds
15. ClosetScreen: tab underline only; remove pill/border chrome
16. CheckoutScreen: flatten section cards → hairline separators; card only for payment selector
17. NotificationsScreen: flat list rows with hairlines; card only for rich-media
18. WalletScreen: inline flow expansion; no card surfaces
19. ItemDetailScreen: flatten nested cards → single dominant surface per section
20. SellScreen: inline quality indicator; no panel chrome
21. SettingsScreen: flat search; border on focus only
22. LoginScreen/SignUpScreen: replace shake with opacity pulse

### Phase D — Backend blockers (production integrity)
23. Realtime: migrate in-memory state to Redis pub/sub
24. API versioning: add `/v1/` prefix
25. Error response standardization: `{ok:false, code, message, details?}`
26. Upload flow: add progress endpoint, retry, enable media processing
27. Rate limiting: apply to all mutation + expensive read endpoints
28. Remove development secrets from code; require explicit secret generation
29. Add request ID tracing middleware
30. Migration rollback safety: require down SQL

### Phase E — Contract alignment
31. Add frontend Zod schemas mirroring backend (uploads, collections, recommendations, media assets)
32. Add response validation to all fetchJson calls
33. Honor `trained_model: false` label in all AI-presenting UI
34. Remove or wire image classification (501 → real provider or remove UI)

### Phase F — State completeness & motion
35. Replace 30+ ActivityIndicator usages with layout-matching skeletons
36. Add empty/filtered-empty/offline/error states to remaining 130 screens
37. Verify motion tokens match 2026 benchmarks (150ms default, spring for physical)
38. Add shared element transitions for list → detail on flagship surfaces
39. Implement offline queue integration with TanStack Query mutations

### Phase G — Production readiness
40. Set real Sentry DSN, SSL hashes, Apple credentials
41. Add visual regression test suite (Maestro + screenshot diff)
42. Add load tests (k6/Artillery) for critical endpoints
43. Implement EAS Update gradual rollouts
44. Complete i18n (≥2 more languages; audit hardcoded strings)
45. Migrate AsyncStorage sensitive data to SecureStore

---

## 7. WHAT'S ALREADY DONE (don't re-do)

- Phase 7 token discipline: 1,450+ hardcoded values replaced (81% borderRadius, 83% fontSize, ~100% fontFamily, ~95% spacing)
- Co-Own reconstruction: 18 components, 11 screens, 155 tests, mockData removed, honest unavailable states
- Backend: transaction management verified (523 statements), input validation on 5 critical routes, no hardcoded secrets found, indexes added
- Accessibility: critical icon-only button issues fixed in LoginScreen/ChatScreen
- Memory leaks: VisualSearchScreen leaks fixed
- Performance: Hermes, New Architecture, Metro config, lazy imports verified
- Motion: standardized tokens + spring-based transitions
- Galleria: editorial discovery surface implemented
- P0 blockers: 4 of 5 resolved (SSL pinning config, live shopping demo mode flag, age verification, Sentry/Apple documented, jailbreak detection truthful)

---

## 8. SUCCESS CRITERIA

A screen passes flagship when:
1. **Thumbnail test:** at 25% scale, primary object + reading order obvious; repeated rounded rectangles don't dominate silhouette
2. **Squint test:** media/identity/content dominate; navigation + utility chrome recede
3. **Surface budget:** ≤1 dominant non-media panel above fold
4. **Radius budget:** ≤2 non-avatar radii per viewport
5. **Stroke grammar:** hairline separators, 1pt fields, 2pt focus/selection only
6. **Icon grammar:** one family, one optical size band, transparent 44pt targets for utility controls
7. **Text budget:** ≤3 type sizes + 1 eyebrow in first viewport
8. **State coverage:** loading (skeleton matches final), empty, filtered-empty, error, retry, offline, populated all designed
9. **Truthful UI:** every control performs its action; no fabricated success/data/persistence
10. **Motion:** restrained, purposeful, reduced-motion fallback; no bounce/pulse/floating

The app passes flagship when the above holds across all primary surfaces (Home, Browse, Search, ItemDetail, Closet, Chat, Checkout, Wallet, Sell, Notifications, Settings, Onboarding, AuthLanding, Login, SignUp) AND the backend blockers in §3.2 are resolved.
