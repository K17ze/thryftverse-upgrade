# ThryftVerse Flagship Upgrade — Skeletons, Empty States, Error States & State Surfaces

**Component deep-dive:** every loading skeleton, empty state, error state, offline state, partial state, retry pattern and state-transition surface in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 ("Complete state coverage — loading, empty, error, partial, offline, populated states are all designed"), §14 ("State Completeness"), §16 ("Performance — deterministic skeletons, reduced-motion behaviour"), §17 ("Motion and Interaction — decorative shimmer after loading is prohibited"), §18 ("Accessibility — loading and failure are exposed") · Design.md "Perceived Performance & Visual Completion", "Component Micro Specs" (skeleton geometry parity), `components.flagship-state` · production codebase audit · 2026 web research (URLs cited inline).

---

## 1. 2026 Competitor Benchmark — Instagram, Pinterest, eBay, Snapchat

A flagship state-surface system is not a set of screens; it is a contract that every async boundary in the product resolves into one of a small number of *honest, designed* states. The strongest 2026 mobile products converge on geometry-matched skeletons, opportunity-framed empty states, recovery-first error states, and graceful offline degradation. The differences are in tone, illustration language and transition smoothness.

### Instagram (Meta, 2026)

Instagram's loading language is the most copied in the industry. Feed and profile surfaces render **geometry-matched skeletons** — grey placeholder blocks sized to the exact card, image aspect and caption line count of the final content — with a left-to-right shimmer sweep at roughly 1.0–1.4s (The Psychology of Perceived Performance: Why Skeleton Screens Beat Spinners in 2026, https://timgraf.com/ui/the-psychology-of-perceived-performance-why-skeleton-screens-beat-spinners-in-2026/). The shimmer is a single composited gradient translate, not a per-block animated opacity, which keeps the feed scrollable during load. When content arrives, each card crossfades in with a ~50ms stagger so the feed "fills in" top-to-bottom rather than popping all at once (timgraf.com). Instagram's empty states are rare because the feed is rarely empty, but the "Couldn't refresh feed" pattern is instructive: a **subtle top banner** that auto-retries while keeping the last loaded content visible — the user never loses their scroll position (Empty State Design Patterns, https://gummble.com/blog/empty-state-design-patterns). Error states keep prior content on screen and overlay a non-blocking retry; they never replace useful content with a blank error page. Instagram's lesson for ThryftVerse: **never clear content during refresh; overlay the error and preserve the scroll position.**

### Pinterest (2026)

Pinterest treats the empty state as a **discovery opportunity, not a dead end**. When a search returns zero results, Pinterest still shows visually related pins as "You might like" suggestions, so the surface is never truly empty (gummble.com). Pinterest's skeletons are image-led: masonry placeholders match the true aspect ratio of each pin using cached dimensions from a previous visit, so there is zero layout shift when real images decode (Design.md "Component B — Pinterest masonry board", "Skeleton geometry matches final aspect ratios"). The shimmer is a low-contrast sheen — Pinterest's design system documentation describes a "sheen" toggle that signals active loading without demanding attention (Singapore Government Design System Skeleton, https://designsystem.tech.gov.sg/components/skeleton). Pinterest's empty-state illustrations are image-led and system-consistent, tuned for visual discovery products where the empty surface is the user's first impression of the feature (DesignSystems.one empty states cross-system reference, https://www.designsystems.one/design-systems/patterns/empty-states). Pinterest's lesson: **an empty discovery surface should still offer visual content; "no results" is a re-rooting moment, not a wall.**

### eBay (2026)

eBay's mobile commerce surfaces use **skeleton screens for product grids and lists** — placeholder cards with image blocks, title bars and price lines in the exact final geometry — and reserve spinners for action waits like "Place order" submission (Designing Mobile Loading States, https://symbolefy.com/designing-mobile-loading-states-that-keep-users-informed-and-confident/). eBay's error states in checkout are recovery-first: a clear "Something went wrong" with a "Try again" button and, where possible, the order details preserved so the user does not re-enter information (Error States Best Practices, https://www.northbase.design/patterns/error-states — 83% of enterprise error states include explicit recovery actions). eBay's empty states in seller dashboards ("No sales yet", "No listings") include a single primary CTA ("List your first item") that matches the global Add button pattern — the empty state CTA is never a different control from the one the user would use later (DesignSystems.one). eBay's lesson: **the empty-state CTA must be the same action the user will use once they have data; do not invent a one-off button.**

### Snapchat (2026)

Snapchat's state surfaces are minimal because the camera is the default state, not a loading state. Where Snapchat does show loading (Discover content, Snap Map), it uses **progressive rendering**: the UI structure renders immediately and content fills in as it arrives, rather than blocking the entire screen behind a spinner (iOS Progressive Rendering reference, https://github.com/Livsy90/iOS-Performance-Agent-Skills/blob/main/ios-perceived-performance/references/progressive-rendering.md). Snapchat's offline state is a simple, honest banner — "You're offline" — that does not fabricate content or pretend the connection is fine. Snapchat's lesson: **the default state should be useful, not a loading screen; show structure early and fill in progressively.**

### Cross-cutting 2026 consensus

- **Skeletons must match the final layout exactly** — same grid, same block sizes, same radius, same rhythm. A skeleton that does not match is worse than no skeleton because it sets an expectation and breaks it (72Technologies Skeleton Screens vs Spinners 2026, https://www.72technologies.com/blog/skeleton-screens-vs-spinners-2026; Codexical skeleton science, https://www.codexical.com/posts/2026-05-09-skeleton-screens-vs-spinners-science).
- **Skeletons are appropriate only when the load is 400ms–3s, the layout is predictable, and the page is content-heavy.** Under 400ms the skeleton flashes; over 3s users suspect the app is broken regardless (72Technologies).
- **Shimmer duration: 0.9–1.6s, ease-in-out.** Faster looks frantic; slower looks stuck. The 2026 gold standard is a 1.5s loop mimicking biological breathing rhythm (timgraf.com; ASOasis shimmer effect, https://asoasis.tech/articles/2026-05-19-1455-react-skeleton-screen-shimmer-effect/; cr0x.net pure CSS skeleton, https://cr0x.net/en/pure-css-skeleton-screens/).
- **One shimmer signal is enough.** Do not stack a spinner on top of a skeleton; do not run shimmer after content has loaded (UI Craft state-first design, https://skills.smoothui.dev/docs/state-design; AGENTS.md §17 "decorative shimmer after loading" is prohibited).
- **Empty states are context-specific onboarding, not dead ends.** First-run, no-results, cleared and unavailable states each get distinct copy, illustration and CTA (Setproduct empty state UI design, https://www.setproduct.com/blog/empty-state-ui-design; ScreensDesign 14 mobile empty state examples, https://screensdesign.com/articles/mobile-app-empty-state-examples/).
- **Error states must explain what went wrong, why, and what to do next.** "Something went wrong" with no detail and no retry leaves users stranded (Northbase error states; Figr error state design patterns, https://figr.design/blog/error-state-design-patterns; WeAreAffective error messages, https://weareaffective.com/learning-centre/how-do-i-design-effective-error-messages-that-help-users).
- **Offline-first: the local store is the primary read path, not a cache fallback.** The UI never blocks on the network; it reads local data first and syncs in the background (Android Developers offline-first, https://developer.android.com/topic/architecture/data-layer/offline-first; AskAnTech offline-first mobile architecture 2026, https://www.askantech.com/offline-first-mobile-architecture-apps-without-internet/).
- **State transitions matter as much as final states.** Review idle→loading, loading→loaded, loading→empty, loading→failed, loaded→refreshing, refreshing→failed-while-preserving-content, failed→retrying, empty→loading-after-action (iOS Loading States reference, https://github.com/Livsy90/iOS-Performance-Agent-Skills/blob/main/ios-perceived-performance/references/loading-states.md).
- **Reduced motion is mandatory.** Skeletons collapse to static placeholders; shimmer animations stop; transitions become instant fades (cr0x.net; AGENTS.md §16, §17).

---

## 2. Psychology & Principles

### Perceived performance

Skeletons do not reduce actual load time. They reduce *perceived* load time by giving the brain a structure to pre-process before the data arrives (timgraf.com). A blank screen for two seconds feels longer than a skeleton screen for three seconds — the uncertainty of a blank space is cognitively more expensive than the partial information of a grey wireframe (137Foundry loading states, https://137foundry.com/articles/how-to-design-loading-states-skeleton-screens; Fillbyte empty states and loading, https://fillbyte.com/blog/the-art-of-empty-states-and-loading-experiences). Internal testing at Fillbyte showed users estimated skeleton-loaded screens as 35% faster than spinner-loaded screens at identical actual load times (fillbyte.com). The mechanism is evolutionary: spinners are infinite circles with no beginning or end, triggering uncertainty; skeletons promise a *specific, finite* structure coming to a *specific place*, appealing to the brain's desire for closure (timgraf.com).

### The "geometry match" principle

The single most cited rule in 2026 skeleton research: **the skeleton must match the final layout.** Same number of rows, similar block sizes, similar rhythm, same radius, same aspect ratio (72Technologies; UI Craft; Singapore Gov Design System). When the skeleton shows four equal-height rows and the real content renders as two short rows and one tall image, the page jolts — Cumulative Layout Shift spikes and users blame the app (72Technologies). A skeleton that does not match is worse than no skeleton because it sets an expectation and then breaks it. If content is genuinely variable, either generate skeletons from a cached shape on the previous visit, or use a spinner (72Technologies). ThryftVerse's Design.md encodes this directly: "Skeleton matches exact final geometry; no layout shift" (Design.md masonry card micro spec) and "Skeleton geometry matches final aspect ratios" (Design.md Component B performance section).

### Empty state as opportunity

An empty state is not a bug or a dead end — it is the user's first impression of a feature and a moment of activation (Setproduct; ScreensDesign; Framer Websites empty state design 2026, https://framerwebsites.com/blog/empty-state-design). The naive empty state is a centered icon with "No items." The serious empty state distinguishes between the user who has never used the feature (needs onboarding), the user who filtered too narrowly (needs to clear filters), and the user who used it once a year ago (needs re-engagement) (DesignSystems.one). Each variant gets its own copy, illustration and primary action. Copy should lead with a verb ("Start your first project" beats "You have no projects yet"), stay in second-person active voice, and be specific to the surface ("Your inbox is empty" not "No data found") (Koder Design empty state pattern, https://kds.koder.dev/en-US/patterns/patterns-empty-state.html; Framer Websites).

### Error state as recovery

Great error state design is not about apologizing for mistakes — it is about maintaining momentum. A user who encounters a well-handled error feels guided, not blocked (Figr). The formula: **specific problem description + clear next step.** Systems that use generic "Something went wrong" messages leave users stranded; 83% of enterprise error states include explicit recovery actions (Northbase). Error messages must tell users what went wrong, why it happened, and what they can do about it — in user-safe language, never raw error codes or stack traces (WeAreAffective; Agentic Developer Cookbook state design, https://agenticdevelopercookbook.com/guidelines/implementing/ui/state-design). Colour alone is insufficient for error communication: 8% of men have some form of colour blindness, so red text must be paired with an icon or position (WeAreAffective; Cognitive Load and Error Recovery, https://anmshpndy.com/cases/cognitive-load-error-recovery/ — WCAG 1.4.1).

### "Never leave them hanging"

The worst state is not an error state — it is silence. A blank screen, a frozen button, or an unexplained delay creates doubt instantly. People may tap repeatedly, leave the app, or assume a transaction failed (symbolefy.com). Every async boundary must resolve into a visible, honest state. This is AGENTS.md §14 ("State Completeness") encoded as a product rule: every screen touched must account for loading, populated, empty, filtered-empty, offline, error, retry, disabled, submitting, success, partial data, missing media and permission denied.

### State transition smoothness

Final states are only half the work. The transitions *between* states are where most apps fail: flicker between loading and loaded, empty state flashing before loading begins, old content disappearing during refresh, error replacing useful stale content, retry button starting work but giving no feedback (iOS Loading States reference). A flagship state system designs the transitions as explicitly as the states: loading→populated is a crossfade with stagger; empty→populated is a fade-in; error→retry shows immediate loading feedback; refresh preserves content and overlays the indicator.

### The "honest state" principle

AGENTS.md §11 ("Truthful UI") applies directly to state surfaces. A loading state must not fabricate data to avoid designing an empty state. An empty state must not pretend content is coming when it is not. An error state must not claim the operation succeeded when only local temporary state changed. "Coming soon" is not a state — it is a fake state that violates truthful UI (AGENTS.md §11: "Never expose controls that only produce 'Coming soon', 'Backend required', or generic explanation toasts"). Skeletons are honest because they say "content is coming and will look roughly like this"; spinners are honest because they say "something is happening, I don't know how long"; a blank screen is dishonest because it says nothing.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The codebase has **three parallel state-surface systems** (`FlagshipState`, `EmptyState`, `RetryState`), a generic `SkeletonLoader`, 15 per-screen skeleton components, and **108 files still using raw `ActivityIndicator`**. State coverage is partial, inconsistent and often dishonest. Below are the defects with file:line references.

### 3.1 Raw ActivityIndicator on 108 files (57+ screens)

A grep for `ActivityIndicator` across `frontend/src` returns **108 files** with matches. Restricted to `frontend/src/screens`, there are **131 individual matches** across approximately 57 screen files. This is the single largest state-surface defect: the majority of the app's async boundaries resolve to a raw, centred, platform-default spinner — the exact pattern AGENTS.md §14 prohibits ("Do not use a generic centred spinner for every state").

Representative examples:

| Screen | File:line | Defect |
|--------|-----------|--------|
| `CheckoutScreen` | `screens/CheckoutScreen.tsx:1697,1742,1935` | Three separate raw `ActivityIndicator` instances during checkout — the highest-stakes transactional flow shows a blank spinner instead of a progress indicator or skeleton |
| `CreatorAssetPicker` | `creator/CreatorAssetPicker.tsx:898,1070,1187,1540,1554,1678,1787,2689,2865` | 10 raw spinner instances in the asset picker — no geometry-matched skeleton for the media grid |
| `AIAgentIntegrationScreen` | `screens/AIAgentIntegrationScreen.tsx:348,446,547,647` | 5 raw spinners across an AI feature surface — no loading state design |
| `VerificationScreen` | `screens/VerificationScreen.tsx:539,660,788` | 4 raw spinners during identity verification — a trust-critical flow with no designed state |
| `GroupChatScreen` | `screens/GroupChatScreen.tsx:329,593` | Raw spinners in chat — no skeleton message bubbles |
| `FollowingScreen` / `FollowersScreen` | `screens/FollowingScreen.tsx:246,286`; `screens/FollowersScreen.tsx:246,286` | Raw spinners in list screens that have predictable row geometry — ideal skeleton candidates |
| `WalletConvertScreen` | `screens/WalletConvertScreen.tsx:660,684` | Raw spinners in a financial flow — no skeleton or progress indicator |
| `LiveStreamViewerScreen` | `screens/LiveStreamViewerScreen.tsx:382` | Raw spinner during live stream load — no poster frame or stable placeholder |

### 3.2 FlagshipState on only 18 of 165 screens

`FlagshipState` is imported in only **20 files** total, and of those, **18 are screen files** (the other 2 are the component definition and its barrel export). With approximately 165 screens in the app, FlagshipState coverage is **~11%**. The component itself is well-designed — it has `loading`, `empty`, `error`, `offline` and `unavailable` variants, a shimmer-based loading state, haptic-mapped recovery actions and reduced-motion support (`components/flagship/FlagshipState.tsx:22-183`) — but it is deployed on only a minority of surfaces, predominantly seller/verification/financial screens:

`VerificationResponseScreen`, `SellerFulfilmentScreen`, `KYCVerificationScreen`, `ResolutionCentreScreen`, `SellerVerificationScreen`, `InventoryManagementScreen`, `SavedAddressesScreen`, `PostageScreen`, `BulkListingScreen`, `MyListingsScreen`, `EmailNotificationsScreen`, `AddBankAccountScreen`, `BalanceHistoryScreen`, `BundleBagScreen`, `PaymentsScreen`, `VerificationStatusScreen`, `CreatorAnalyticsDashboardScreen`, `SellerHubScreen`.

The highest-traffic discovery and commerce surfaces — `HomeScreen`, `BrowseScreen`, `GlobalSearchScreen`, `ItemDetailScreen`, `UserProfileScreen`, `MyProfileScreen`, `AuctionHomeScreen`, `ClosetScreen` — do **not** use `FlagshipState` for their error/offline states. They either use raw `ActivityIndicator`, `RetryState`, or inline ad-hoc error text.

### 3.3 Three parallel error/retry systems

| System | File | Variants | Geometry | Haptic | Reduced motion |
|--------|------|----------|----------|--------|----------------|
| `FlagshipState` | `components/flagship/FlagshipState.tsx:72` | loading, empty, error, offline, unavailable | Icon circle + title + subtitle + action | Medium for error/offline, light for empty (`:109-113`) | Yes — shimmer collapses (`:200-203`) |
| `EmptyState` | `components/EmptyState.tsx:33` | Empty only (with presets) | Icon ring + title + subtitle + hint + CTA + secondary + suggested chips | Selection for CTA, light for secondary (`:81,89`) | Yes — FadeIn collapses (`:38`) |
| `RetryState` | `components/RetryState.tsx:15` | Error only | 120pt icon box + title + subtext + retry button | None (no haptic on retry button) | Yes — FadeIn collapses (`:19`) |

`RetryState` is the weakest: a 120pt circular icon box with a 64pt warning icon is oversized chrome for an error state, the retry button has no haptic feedback, and the copy is hardcoded ("Couldn't load" / "Something went wrong.") with no variant support. `EmptyState` is the most feature-rich (presets, hints, suggested actions, compact density) but covers only the empty variant. `FlagshipState` is the most architecturally complete but lacks the preset library and compact density that `EmptyState` has.

### 3.4 No geometry-matched skeletons on most screens

The codebase has **15 per-screen skeleton components** in `components/skeletons/` plus a generic `SkeletonLoader`:

`BoardSkeleton`, `BuyerProtectionSkeleton`, `ConnectedAccountsSkeleton`, `ConversationListSkeleton`, `ItemDetailSkeleton`, `LookDetailSkeleton`, `MasonrySkeleton`, `OrderRowSkeleton`, `PosterViewerSkeleton`, `ProductGridSkeleton`, `ProfileSkeleton`, `SettingsListSkeleton`, `WriteReviewSkeleton`, plus `SkeletonChatLoader` and a duplicate `ProfileSkeleton` in `components/profile/`.

However, these skeletons are deployed on only ~40 of 165 screens (grep for `SkeletonLoader|from.*[Ss]keleton` returns 77 files, but many are component definitions or barrel exports, not screen consumers). The majority of screens — especially `CheckoutScreen`, `CreatorAssetPicker`, `VerificationScreen`, `GroupChatScreen`, `WalletConvertScreen`, `LiveStreamViewerScreen` — have **no skeleton at all** and fall back to raw `ActivityIndicator`.

### 3.5 No designed partial states

There is no first-class "partial data" state in any of the three state systems. `FlagshipState` has no `partial` variant. `EmptyState` has no partial mode. Screens that load multiple data sources either block until all data arrives (showing a spinner for the full duration) or silently show whatever arrived, with no indication that some sections failed. This violates AGENTS.md §14 ("partial data") and the 2026 consensus: "Some data loaded, some failing. Show what succeeded" (UI Craft state-first design). The iOS Progressive Rendering reference is explicit: "one full-screen state becomes section-level state" is the core progressive-rendering refactor (https://github.com/Livsy90/iOS-Performance-Agent-Skills/blob/main/ios-perceived-performance/references/progressive-rendering.md).

### 3.6 No designed offline states

While there is an `offlineQueue.ts` library (`lib/offlineQueue.ts`) and a `syncStatus.ts` utility (`utils/syncStatus.ts`), there is **no screen-level offline state surface** in the UI layer. `FlagshipState` has an `offline` variant (`:39,55`), but it is not deployed on any screen that a user would encounter during connection loss. The grep for `offline|Offline` returns 96 files, but the matches are almost entirely in service-layer code (upload managers, conversation hooks, sync utilities), not in screen-level render logic. A user who loses connection on `HomeScreen` or `BrowseScreen` sees either a raw spinner that never resolves or a generic error — never an honest "You are offline" state with cached content and a retry path.

### 3.7 Generic error messages and missing retry actions

`RetryState` hardcodes "Couldn't load" and "Something went wrong." (`components/RetryState.tsx:28,32`) — the exact generic message that 2026 research identifies as leaving users stranded (Northbase: "systems that use generic 'Something went wrong' messages leave users stranded"). `FlagshipState` has better defaults ("We could not load this. Tap below to try again.", `:46`) but still does not surface the *specific* error cause (network timeout vs. server error vs. permission denied). Many screens show raw backend error messages or no error message at all — `CheckoutScreen` has 14 retry-related matches but no designed error state surface, just inline conditional text.

### 3.8 "Coming soon" as fake state

Several surfaces use "Coming soon" or equivalent placeholder text instead of designing an honest empty or unavailable state. This violates AGENTS.md §11 ("Never expose controls that only produce 'Coming soon', 'Backend required', or generic explanation toasts"). A "Coming soon" surface is not a loading state (nothing is loading), not an empty state (the feature exists, it is just not built), and not an unavailable state (it is permanently unavailable, not temporarily). It is a fake state that erodes trust.

### 3.9 Shimmer performance and reduced-motion gaps

`SkeletonLoader` (`components/SkeletonLoader.tsx:39-135`) runs **three concurrent Reanimated animations per skeleton block**: a primary wave sweep, a breathing pulse and a secondary brand-tinted wave. On a screen with 6–10 skeleton blocks, this means 18–30 concurrent animated values. This is the exact anti-pattern documented in a 2026 performance fix PR: "Each `SkeletonBlock` ran its own infinite Reanimated loop *and* a native `LinearGradient` shimmer. A screen's worth (~32) all instantiate at once → heavy mount → jank" (GitHub fitapp PR #72, https://github.com/martinnovak22/fitapp/pull/72). The fix pattern: share one opacity pulse via `SkeletonGroup` (one loop, plain views, no gradients) rather than per-block gradient sweeps. `FlagshipState`'s loading shimmer (`:190-252`) is more restrained — a single shimmer bar — but it is a generic shimmer, not geometry-matched to the target screen.

Additionally, `SkeletonLoader` uses static `Colors` imports (`:14-18`) rather than `useAppTheme().colors`, which means skeleton colours do not respond to runtime theme changes — a violation of Design.md's runtime truth rule.

---

## 4. Micro Improvements

These are small, localised fixes that do not require architectural change:

1. **Replace `RetryState` with `FlagshipState variant="error"`** on every screen that currently imports `RetryState`. `FlagshipState` already has better copy, haptic-mapped retry and reduced-motion support. `RetryState` becomes a thin compatibility wrapper or is deleted.
2. **Add haptic feedback to `RetryState`'s retry button** (`components/RetryState.tsx:36`) — currently no haptic fires on retry, violating AGENTS.md §13 ("loading state when asynchronous").
3. **Migrate `SkeletonLoader` from static `Colors` to `useAppTheme().colors`** (`components/SkeletonLoader.tsx:14-18`) so skeleton colours respond to runtime theme changes.
4. **Reduce `SkeletonLoader` animation count** from three concurrent animations to one shared shimmer, following the `SkeletonGroup` pattern (fitapp PR #72). This eliminates jank on screens with many skeleton blocks.
5. **Add `partial` variant to `FlagshipState`** — a state that shows partial content with an inline banner indicating some sections failed to load, with a retry action for the failed sections only.
6. **Add compact density to `FlagshipState`** matching `EmptyState`'s `density="compact"` prop (`components/EmptyState.tsx:31`) so state surfaces can be embedded inside feed tabs and partial-screen regions without taking over the full viewport.
7. **Replace "Coming soon" surfaces** with either an honest `FlagshipState variant="unavailable"` or remove the control entirely per AGENTS.md §11.
8. **Add specific error cause to `FlagshipState` error variant** — extend the props to accept an optional `errorType: 'network' | 'server' | 'permission' | 'unknown'` that selects more specific copy ("We couldn't connect to our servers" vs. "You don't have permission to view this").

---

## 5. Macro Improvements

### 5.1 One state surface system (unified FlagshipState with variants)

Consolidate `FlagshipState`, `EmptyState` and `RetryState` into a single canonical state surface component with variants: `loading`, `empty`, `error`, `offline`, `partial`, `unavailable`. Each variant gets:

- **Geometry:** icon ring or skeleton block, title, subtitle, optional hint, primary CTA, optional secondary CTA, optional suggested actions.
- **Density:** `full` (centred, flex:1) or `compact` (inline, minHeight) for embedding in tabs and partial regions.
- **Presets:** port `EmptyState`'s preset library (`EMPTY_PRESET_FIRST_TIME`, `EMPTY_PRESET_NO_RESULTS`, `EMPTY_PRESET_FILTERED_NO_RESULTS`, `EMPTY_PRESET_NO_LISTINGS`, etc.) into `FlagshipState` presets so every screen gets research-backed copy without writing it from scratch.
- **Haptics:** medium for error/offline retry, light for empty-state CTA, selection for secondary actions.
- **Reduced motion:** shimmer collapses to static placeholder; FadeIn transitions become instant.
- **Accessibility:** `accessibilityLiveRegion="assertive"` for error/offline, `"polite"` for loading/empty; state is announced to screen readers.

The consolidated component lives at `components/flagship/FlagshipState.tsx` (the existing canonical location). `EmptyState` and `RetryState` become deprecated compatibility wrappers or are removed once all screens are migrated.

### 5.2 Skeleton system (geometry-matched, shimmer, per-screen)

The skeleton system needs three layers:

1. **`SkeletonBlock`** — a single placeholder block with width, height, radius and background. One shared shimmer animation via `SkeletonGroup` (not per-block). Uses `useAppTheme().colors`. Reduced-motion collapses to static fill.
2. **`SkeletonGroup`** — a container that runs **one** shimmer/pulse animation and propagates it to all child `SkeletonBlock`s. This is the performance fix: one animated value per screen, not 30 (fitapp PR #72).
3. **Per-screen skeleton compositions** — one per major screen, geometry-matched to that screen's final layout. The existing 15 skeletons in `components/skeletons/` are the starting point; the gap is the ~57 screens with raw `ActivityIndicator` that have no skeleton at all.

**Geometry-match rules** (from Design.md and 2026 research):
- Skeleton card width = final card width; skeleton image aspect = final image aspect (Design.md masonry spec: "Skeleton matches exact final geometry; no layout shift").
- Skeleton row count ≈ expected final row count (±1). Use cached shape from previous visit if available (72Technologies).
- Skeleton radius = final card radius (`Radius.lg` for discovery, `Radius.xl` for form fields, `Radius.full` for avatars).
- Skeleton shimmer: 1.2s loop, ease-in-out, left-to-right gradient sweep, low contrast (timgraf.com; ASOasis). One signal only — no spinner on top of skeleton (UI Craft).
- Show skeleton after 200ms delay to avoid flash on fast loads (UI Craft; symbolefy.com). Cap at 5s — past that, escalate to a progress indicator or timeout message with retry (UI Craft).

### 5.3 State transition system

Design the transitions, not just the states (iOS Loading States reference). The transition matrix:

| From | To | Transition |
|------|----|-----------|
| idle | loading | Skeleton fades in over 150ms (`Duration.fast`) after 200ms delay |
| loading | populated | Content crossfades in over 250ms (`Duration.normal`) with 50ms stagger per card/row |
| loading | empty | Skeleton fades out, empty state fades in over 300ms (`Duration.normal`) |
| loading | error | Skeleton fades out, error state fades in over 300ms with `FadeIn` |
| loaded | refreshing | Content stays visible; inline refresh indicator overlays (no content cleared) |
| refreshing | loaded | Inline indicator fades out; new content crossfades in if changed |
| refreshing | failed | Inline error banner appears; **old content remains visible** |
| error | retrying | Error state fades out, skeleton fades in (immediate feedback on retry tap) |
| empty | loading | Empty state fades out, skeleton fades in (after user action CTA) |
| loaded | empty (filters) | Content fades out, filtered-empty state fades in |
| partial | partial-complete | Failed section retry shows inline skeleton; successful sections remain visible |

**Key rules:**
- Never clear content during refresh (Instagram pattern; iOS Loading States: "old content disappears during refresh" is a common problem).
- Never replace useful stale content with a full-screen error (iOS Loading States: "error replaces useful stale content" is a common problem).
- Retry tap must show immediate loading feedback — never leave the user wondering if the tap registered (iOS Loading States: "retry button starts work but gives no feedback").
- All transitions respect reduced motion: crossfades become instant, stagger becomes simultaneous.

### 5.4 Retry contract

Every error and offline state must follow the retry contract:

1. **Specific cause** — "We couldn't connect to our servers" not "Something went wrong" (Northbase; WeAreAffective).
2. **Single primary retry action** — "Try again" button, full-pill, 48–52pt, `colors.brand` fill, medium haptic on press (AGENTS.md §13).
3. **Optional secondary action** — "Go back" or "Contact support" as a quiet text button.
4. **Immediate feedback on retry** — tapping retry must transition to loading state within 100ms (iOS Loading States).
5. **Preserve context** — if partial data exists, retry only the failed section, not the whole screen (UI Craft: "Partial — some data loaded, some failing. Show what succeeded").
6. **Exponential backoff for auto-retry** — offline states may auto-retry with increasing delay (1s, 2s, 4s) but must always offer a manual retry button.
7. **Support ID for unrecoverable errors** — if retry fails 3×, show a support ID and a "Contact support" action (UI Craft: error state includes "support ID").

---

## 6. Flagship Acceptance Criteria

A screen passes state-surface flagship quality when **all** of the following are true:

1. **State coverage on every screen** — loading, empty, error, offline, partial, populated and filtered-empty states are all designed and implemented (AGENTS.md §4, §14). No screen shows a blank screen or a frozen UI during any async boundary.
2. **Geometry-matched skeletons** — the loading state uses a skeleton that matches the final layout's card sizes, aspect ratios, radius and row count. No raw `ActivityIndicator` as the primary loading state on any content-heavy screen (AGENTS.md §14; Design.md masonry spec).
3. **Empty state with illustration + CTA** — the empty state has a system-consistent icon or illustration, a verb-led title, a contextual subtitle and a single primary CTA that matches the global creation/add action for that surface (Setproduct; DesignSystems.one; eBay pattern).
4. **Error state with retry** — the error state explains the specific cause, offers a primary "Try again" action with medium haptic, and preserves any partial content that was already loaded (Northbase; iOS Loading States).
5. **Offline state** — the offline state shows an honest "You are offline" surface with cached content where available and a manual retry path. The app never pretends everything is fine when the connection is lost (Android Developers offline-first; AGENTS.md §14).
6. **Partial state** — when some sections load and others fail, the successful sections remain visible and the failed sections show inline error/skeleton with individual retry. The screen never collapses entirely because one section failed (UI Craft; iOS Progressive Rendering).
7. **No raw ActivityIndicator** — zero instances of `<ActivityIndicator>` as a screen-level loading state. Inline button-loaders may use a small spinner inside the button, but screen-level loading uses skeletons or `FlagshipState` (AGENTS.md §14).
8. **State transition animation** — every state transition is animated: loading→populated crossfades with stagger; error→retry shows immediate skeleton; refresh preserves content. No flicker, no pop, no layout shift (iOS Loading States; Design.md "loading vs final geometry shift").
9. **Reduced motion** — all shimmer, crossfade and stagger animations collapse to static placeholders or instant transitions when reduced motion is enabled (AGENTS.md §16, §17; cr0x.net).
10. **Accessibility** — loading and failure states are announced to screen readers (`accessibilityLiveRegion`); state changes are communicated, not silent (AGENTS.md §18).

---

## 7. Priority & Sequencing

| Phase | Work | Screens impacted | Effort |
|-------|------|-------------------|--------|
| **P0 — Foundation** | Consolidate `FlagshipState` + `EmptyState` + `RetryState` into one variant system; add `partial` variant; add compact density; port presets | All (component layer) | Medium |
| **P0 — Foundation** | Refactor `SkeletonLoader` to `SkeletonGroup` shared-shimmer pattern; migrate to `useAppTheme().colors` | All skeleton consumers (~40 screens) | Medium |
| **P1 — High-traffic** | Replace raw `ActivityIndicator` with geometry-matched skeletons on `HomeScreen`, `BrowseScreen`, `GlobalSearchScreen`, `ItemDetailScreen`, `UserProfileScreen`, `MyProfileScreen` | 6 screens | High |
| **P1 — High-traffic** | Deploy `FlagshipState` error/offline variants on the same 6 high-traffic screens | 6 screens | Medium |
| **P2 — Transactional** | Replace `ActivityIndicator` with progress indicators or skeletons on `CheckoutScreen`, `WalletConvertScreen`, `MakeOfferScreen`, `BuyoutScreen` | 4 screens | Medium |
| **P2 — Transactional** | Add specific error cause and retry contract to transactional error states | 4 screens | Low |
| **P3 — Creator** | Replace `ActivityIndicator` with skeletons on `CreatorAssetPicker`, `CreateLookScreen`, `PosterComposerScreen`, `LookComposerScreen` | 4 screens | High |
| **P3 — Creator** | Add partial-state support to creator screens that load multiple media sources | 4 screens | Medium |
| **P4 — Long tail** | Migrate remaining ~43 screens with raw `ActivityIndicator` to skeletons or `FlagshipState` | ~43 screens | High (batch) |
| **P4 — Long tail** | Remove all "Coming soon" fake states; replace with honest `unavailable` variant or remove controls | Variable | Low |
| **P5 — Offline** | Add screen-level offline state surfaces on top-10 traffic screens; integrate with `offlineQueue.ts` and `syncStatus.ts` | 10 screens | High |
| **P5 — Offline** | Add section-level partial states for multi-source screens (discovery, profile, wallet) | 5 screens | High |

---

## 8. Token-Level Spec Table

Every state surface in the flagship system, specified at token level. All colours reference `useAppTheme().colors`; all geometry references `theme/designTokens.ts`.

### 8.1 Skeleton block

| Property | Value | Token source |
|----------|-------|--------------|
| Background | `colors.surface` | `ThemeColors.surface` |
| Shimmer highlight (light) | `rgba(255,255,255,0.45)` | `SkeletonLoader.tsx:23` (calibrate to ~0.35 per ASOasis) |
| Shimmer highlight (dark) | `rgba(255,255,255,0.06)` | `SkeletonLoader.tsx:24` |
| Shimmer direction | left → right | timgraf.com; ASOasis |
| Shimmer duration | 1200ms, ease-in-out | `Duration.slow` (400ms) is too fast; use 1200ms per timgraf.com 1.5s gold standard |
| Shimmer loop | infinite, no reverse | `withRepeat(..., -1, false)` |
| Reduced motion | static `colors.surface` fill, no shimmer | AGENTS.md §16 |
| Radius | matches final element radius (`Radius.lg` for cards, `Radius.full` for avatars, `Radius.xl` for fields) | `designTokens.ts` |
| Show delay | 200ms after load starts | UI Craft; symbolefy.com |
| Max visible | 5000ms → escalate to progress indicator or timeout | UI Craft |
| Animation count | 1 per screen (shared via `SkeletonGroup`) | fitapp PR #72 |

### 8.2 Shimmer (loading signal)

| Property | Value | Token source |
|----------|-------|--------------|
| Type | linear gradient sweep, translateX only | ASOasis; cr0x.net |
| Gradient stops | `[transparent, highlight, transparent]` | `SkeletonLoader.tsx:22-24` |
| Width | 240px (wider than block for smooth sweep) | `FlagshipState.tsx:236` |
| Performance | animate transform only, not gradient position | cr0x.net: "Animating transform and opacity is cheaper" |
| Stagger | 50ms per row/card on content arrival | timgraf.com |
| Prohibited | shimmer after content loaded; spinner on top of skeleton | AGENTS.md §17; UI Craft |

### 8.3 Empty state

| Property | Value | Token source |
|----------|-------|--------------|
| Icon ring | 96pt circle, `colors.surfaceAlt` fill, hairline `colors.border` | `EmptyState.tsx:267-277` |
| Icon | 38pt Ionicons, `colors.brand` (or contextual) | `EmptyState.tsx:52` |
| Title | `Type.priceList` (20/24/bold), `colors.textPrimary`, centred | `EmptyState.tsx:284-290` |
| Subtitle | `Type.body` (14/20/regular), `colors.textMuted`, centred, maxWidth 260 | `EmptyState.tsx:295-303` |
| Hint | `Type.caption` (12/16/medium), `colors.textMuted`, bulb icon, optional | `EmptyState.tsx:309-322` |
| Primary CTA | full-pill, `colors.textPrimary` fill, `colors.background` text, `Type.bodyEmphasis`, 44–52pt | `EmptyState.tsx:323-341` |
| Secondary CTA | outlined, `colors.border` border, `colors.textPrimary` text, `Type.body` | `EmptyState.tsx:342-354` |
| Suggested actions | chips, `colors.surface` fill, `colors.border` border, `Type.captionElevated` | `EmptyState.tsx:367-386` |
| Compact density | 56pt icon ring, `Type.subtitle` title, minHeight 228 | `EmptyState.tsx:278-283,260-266` |
| Entry animation | `FadeIn.duration(300)`, reduced motion → instant | `EmptyState.tsx:38` |
| Copy rule | verb-led title, second-person, surface-specific | Koder Design; Framer Websites |

### 8.4 Error state

| Property | Value | Token source |
|----------|-------|--------------|
| Icon | `alert-circle-outline`, `IconGrammar.hero` size, `colors.danger` | `FlagshipState.tsx:135-138` |
| Title | `Type.subtitle` (17/24/semibold), `colors.textPrimary`, centred | `FlagshipState.tsx:291-297` |
| Subtitle | `Type.body` (14/20/regular), `colors.textSecondary`, centred, maxWidth 280 | `FlagshipState.tsx:299-307` |
| Default title | "Something went wrong" | `FlagshipState.tsx:38` |
| Default subtitle | "We could not load this. Tap below to try again." | `FlagshipState.tsx:46` |
| Primary CTA | "Try again", `colors.surfaceAlt` fill, `colors.border` border, `Type.body` semibold, 44pt | `FlagshipState.tsx:160-163` |
| Haptic on retry | medium (error recovery commits a real retry) | `FlagshipState.tsx:109-110`; AGENTS.md §13 |
| Secondary CTA | optional "Go back", quiet text button, `colors.textSecondary` | `FlagshipState.tsx:166-179` |
| Entry animation | `FadeIn.duration(220)`, reduced motion → instant | `FlagshipState.tsx:122` |
| Accessibility | `accessibilityLiveRegion="assertive"` | `FlagshipState.tsx:128` |
| Copy rule | specific cause + recovery action; never raw error codes | Northbase; WeAreAffective |

### 8.5 Offline state

| Property | Value | Token source |
|----------|-------|--------------|
| Icon | `cloud-offline-outline`, `IconGrammar.hero` size, `colors.danger` | `FlagshipState.tsx:55,137` |
| Title | "You are offline" | `FlagshipState.tsx:39` |
| Subtitle | "Check your connection and try again." | `FlagshipState.tsx:47` |
| Primary CTA | "Try again", medium haptic | `FlagshipState.tsx:109-110` |
| Cached content | show cached/stale content above the offline banner where available | Android Developers offline-first |
| Auto-retry | optional, exponential backoff (1s, 2s, 4s), max 3 attempts | — |
| Banner variant | for refresh-failures with existing content: top banner, `colors.surface` fill, non-blocking, old content remains visible | Instagram pattern (gummble.com) |
| Full-screen variant | for initial-load with no cache: centred `FlagshipState variant="offline"` | `FlagshipState.tsx` |
| Accessibility | `accessibilityLiveRegion="assertive"` | `FlagshipState.tsx:128` |

### 8.6 Partial state (new variant)

| Property | Value | Token source |
|----------|-------|--------------|
| Layout | successful sections render normally; failed sections show inline skeleton or inline error | UI Craft; iOS Progressive Rendering |
| Inline error banner | `colors.surface` fill, `Radius.lg`, `colors.danger` icon 20pt, `Type.captionElevated` message, inline "Retry" text button | Design.md trust card spec |
| Section retry | retries only the failed section, not the whole screen | UI Craft |
| No full-screen collapse | the screen never collapses entirely because one section failed | iOS Progressive Rendering |
| Loading indicator | per-section skeleton or inline spinner, not full-screen | symbolefy.com: "Inline loader — when only one component is busy" |
| Copy | "Some content couldn't load" + "Retry" per section | — |

### 8.7 Retry button

| Property | Value | Token source |
|----------|-------|--------------|
| Height | 48–52pt | Design.md sticky dock spec |
| Radius | `Radius.full` (pill) | Design.md `button-primary` |
| Background | `colors.brand` (primary) or `colors.surfaceAlt` + `colors.border` (secondary) | `FlagshipState.tsx:160` |
| Text | `Type.body` semibold, `colors.textInverse` on brand fill | `FlagshipState.tsx:162` |
| Label | "Try again" (not "Retry" — friendlier, verb-led) | Northbase; Koder Design |
| Press scale | 0.97 | `FlagshipState.tsx:156`; AGENTS.md §17 |
| Haptic | medium (error/offline recovery) | `FlagshipState.tsx:110`; AGENTS.md §13 |
| Disabled state | 0.4 opacity during retry-in-flight | Design.md sticky dock spec |
| Loading state | inline spinner inside button during retry | AGENTS.md §13 |
| Accessibility | `accessibilityRole="button"`, `accessibilityHint="Tries loading this again"` | `FlagshipState.tsx:158-159` |

### 8.8 State transition

| Property | Value | Token source |
|----------|-------|--------------|
| idle → loading | skeleton `FadeIn` 150ms after 200ms delay | `Duration.fast`; UI Craft |
| loading → populated | content `FadeIn` 250ms, 50ms stagger per row | `Duration.normal`; timgraf.com |
| loading → empty | skeleton fade-out + empty `FadeIn` 300ms | `Duration.normal` |
| loading → error | skeleton fade-out + error `FadeIn` 220ms | `FlagshipState.tsx:122` |
| error → retrying | error fade-out + skeleton `FadeIn` 150ms (immediate) | `Duration.fast`; iOS Loading States |
| refresh (loaded → refreshing) | content stays; inline indicator only | Instagram pattern |
| refresh → failed | inline error banner; content remains | iOS Loading States |
| Reduced motion | all transitions instant (0ms) | AGENTS.md §16, §17 |
| Prohibited | pop-in (no animation); layout shift; content cleared during refresh | iOS Loading States; Design.md |

---

## 9. Component Inventory & Migration Map

### Existing state-surface components

| Component | File | Variants | Status | Action |
|-----------|------|----------|--------|--------|
| `FlagshipState` | `components/flagship/FlagshipState.tsx:72` | loading, empty, error, offline, unavailable | Canonical, under-deployed (18/165 screens) | Add `partial` variant, compact density, preset library; deploy on all screens |
| `EmptyState` | `components/EmptyState.tsx:33` | Empty only (with 13 presets) | Feature-rich, single-variant | Merge presets into `FlagshipState`; deprecate or make compatibility wrapper |
| `RetryState` | `components/RetryState.tsx:15` | Error only | Weakest — no haptic, oversized icon, hardcoded copy | Replace all usages with `FlagshipState variant="error"`; delete |
| `SkeletonLoader` | `components/SkeletonLoader.tsx:39` | Generic block + 4 composites | Performance issue (3 animations/block), static colours | Refactor to `SkeletonGroup` shared shimmer; migrate to `useAppTheme().colors` |

### Existing per-screen skeletons (15 components)

| Skeleton | File | Geometry match | Screen consumer |
|----------|------|----------------|-----------------|
| `MasonrySkeleton` | `components/skeletons/MasonrySkeleton.tsx` | Two-column masonry | `DiscoverScene`, `BrowseScreen`, `GalleriaScreen` |
| `ItemDetailSkeleton` | `components/skeletons/ItemDetailSkeleton.tsx` | Product detail hero + info | `ItemDetailScreen` |
| `ProfileSkeleton` | `components/skeletons/ProfileSkeleton.tsx` + `components/profile/ProfileSkeleton.tsx` | Profile cover + avatar + stats | `UserProfileScreen`, `MyProfileScreen` (duplicate — consolidate) |
| `ProductGridSkeleton` | `components/skeletons/ProductGridSkeleton.tsx` | 2-column product grid | `GlobalSearchScreen`, `CategoryDetailScreen` |
| `ConversationListSkeleton` | `components/skeletons/ConversationListSkeleton.tsx` + `SkeletonLoader.tsx:169` | Chat inbox rows | `InboxScreen` |
| `OrderRowSkeleton` | `components/skeletons/OrderRowSkeleton.tsx` | Order history row | `MyOrdersScreen`, `OrderDetailScreen` |
| `LookDetailSkeleton` | `components/skeletons/LookDetailSkeleton.tsx` | Look detail hero + grid | `LookDetailScreen` |
| `BoardSkeleton` | `components/skeletons/BoardSkeleton.tsx` | Collection/moodboard grid | `MoodboardHomeScreen` |
| `SettingsListSkeleton` | `components/skeletons/SettingsListSkeleton.tsx` | Settings grouped rows | `SettingsScreen`, `ConnectedAccountsScreen` |
| `BuyerProtectionSkeleton` | `components/skeletons/BuyerProtectionSkeleton.tsx` | Trust card | `BuyerProtectionScreen` |
| `ConnectedAccountsSkeleton` | `components/skeletons/ConnectedAccountsSkeleton.tsx` | Connected accounts list | `ConnectedAccountsScreen` |
| `WriteReviewSkeleton` | `components/skeletons/WriteReviewSkeleton.tsx` | Review form | `WriteReviewScreen` |
| `PosterViewerSkeleton` | `components/skeletons/PosterViewerSkeleton.tsx` | Poster viewer | `PosterViewerScreen` |
| `SkeletonChatLoader` | `components/chat/SkeletonChatLoader.tsx` | Chat message bubbles | `ChatScreen` |
| `OrderDetailSkeleton` | `components/orders/OrderDetailSkeleton.tsx` | Order detail | `OrderDetailScreen` |

### Missing skeletons (high-priority screens with raw ActivityIndicator)

| Screen | File | Needed skeleton geometry |
|--------|------|--------------------------|
| `CheckoutScreen` | `screens/CheckoutScreen.tsx` | Checkout summary skeleton (order items, totals, payment selector) |
| `CreatorAssetPicker` | `creator/CreatorAssetPicker.tsx` | Media grid skeleton (3-4 column thumbnail grid) |
| `VerificationScreen` | `screens/VerificationScreen.tsx` | Verification step skeleton (form fields + status card) |
| `GroupChatScreen` | `screens/GroupChatScreen.tsx` | Group chat skeleton (message bubbles + member list) |
| `WalletConvertScreen` | `screens/WalletConvertScreen.tsx` | Convert form skeleton (amount field + rate card + summary) |
| `LiveStreamViewerScreen` | `screens/LiveStreamViewerScreen.tsx` | Stream skeleton (poster frame + chat overlay) |
| `AIAgentIntegrationScreen` | `screens/AIAgentIntegrationScreen.tsx` | AI chat skeleton (message bubbles) |
| `AIPhotoEnhancementScreen` | `screens/AIPhotoEnhancementScreen.tsx` | Enhancement preview skeleton (image + controls) |
| `FollowingScreen` | `screens/FollowingScreen.tsx` | List row skeleton (avatar + name + follow button) |
| `FollowersScreen` | `screens/FollowersScreen.tsx` | List row skeleton (avatar + name + follow button) |

---

## 10. Web Source References

1. The Psychology of Perceived Performance: Why Skeleton Screens Beat Spinners in 2026 — https://timgraf.com/ui/the-psychology-of-perceived-performance-why-skeleton-screens-beat-spinners-in-2026/
2. Designing Mobile Loading States That Keep Users Informed and Confident — https://symbolefy.com/designing-mobile-loading-states-that-keep-users-informed-and-confident/
3. Loading States & Skeleton Screens: How to Design Them (2026) — https://cpcloudhosting.com/how-to-design-loading-states-and-skeleton-screens/
4. Skeleton Screens vs Spinners: A 2026 UX Decision Guide — 72Technologies — https://www.72technologies.com/blog/skeleton-screens-vs-spinners-2026
5. Skeleton Screens Don't Always Win. The Data Will Surprise You. — Codexical — https://www.codexical.com/posts/2026-05-09-skeleton-screens-vs-spinners-science
6. Empty state UI design: turn blank screens into next steps — Setproduct — https://www.setproduct.com/blog/empty-state-ui-design
7. 14 Mobile App Empty State Examples — ScreensDesign — https://screensdesign.com/articles/mobile-app-empty-state-examples/
8. Empty State Usage Guidelines — Watson Design System — https://watson.docplanner.design/latest/watson-mobile/components/empty-state/usage-guidelines-IEfmrpCB
9. Empty states — Cross-system pattern reference — DesignSystems.one — https://www.designsystems.one/design-systems/patterns/empty-states
10. PatternFly Empty State design guidelines — https://www.patternfly.org/components/empty-state/design-guidelines/
11. How Do I Design Effective Error Messages That Help Users? — WeAreAffective — https://weareaffective.com/learning-centre/how-do-i-design-effective-error-messages-that-help-users
12. Error States Best Practices & Examples from 10 Enterprise Systems — Northbase — https://www.northbase.design/patterns/error-states
13. Error State Design Patterns: Design for Failures — Figr — https://figr.design/blog/error-state-design-patterns
14. Cognitive Load and Error Recovery UX — The Frontend Casebook — https://anmshpndy.com/cases/cognitive-load-error-recovery/
15. Build an offline-first app — Android Developers — https://developer.android.com/topic/architecture/data-layer/offline-first
16. Offline-First Mobile Architecture (2026) — AskAnTech — https://www.askantech.com/offline-first-mobile-architecture-apps-without-internet/
17. Design an Offline-First Mobile App: Sync, Conflicts, and CRDTs — techinterview — https://www.techinterview.org/post/3233474986/design-offline-first-mobile-app/
18. State-first design — UI Craft docs — https://skills.smoothui.dev/docs/state-design
19. State Design — The Agentic Developer Cookbook — https://agenticdevelopercookbook.com/guidelines/implementing/ui/state-design
20. Designing Loading States and Skeleton Screens for Web Apps — 137Foundry — https://137foundry.com/articles/how-to-design-loading-states-skeleton-screens
21. iOS Loading States reference — https://github.com/Livsy90/iOS-Performance-Agent-Skills/blob/main/ios-perceived-performance/references/loading-states.md
22. iOS Progressive Rendering reference — https://github.com/Livsy90/iOS-Performance-Agent-Skills/blob/main/ios-perceived-performance/references/progressive-rendering.md
23. Screen Load Performance: How FMP and TTI Shape Mobile App Speed — Digia — https://www.digia.tech/post/screen-load-performance-mobile-apps-fmp-tti
24. Mastering Fake Loading Screens in Expo/React Native — Applighter — https://www.applighter.com/blog/fake-loading-screen
25. iOS Skeleton Loaders in React Native (Not Spinner Loops) — VP0 Journal — https://vp0.com/blogs/ios-skeleton-loaders-ui-react-native
26. How to Create Skeleton Loading in React Native (Practical, 2026-Ready Guide) — TheLinuxCode — https://thelinuxcode.com/how-to-create-skeleton-loading-in-react-native-practical-2026-ready-guide/
27. Skeleton Screens in Rork Apps — Rork Lab — https://rorklab.net/en/articles/rork-dev/rork-skeleton-screen-loading-ux-implementation-guide
28. How to Implement Skeleton Loading Screens in React Native — OneUptime — https://oneuptime.com/blog/post/2026-01-15-react-native-skeleton-loading/view
29. React Skeleton Screen Shimmer Effect: Accessible and Fast — ASOasis — https://asoasis.tech/articles/2026-05-19-1455-react-skeleton-screen-shimmer-effect/
30. Pure CSS Skeleton Screens: Shimmer, Reduced Motion, and Performance — cr0x.net — https://cr0x.net/en/pure-css-skeleton-screens/
31. CSS Shimmer Skeleton Loader with Gradient Sweep — Animation Patterns — https://animationpatterns.art/animations/shimmer-gradient-sweep-skeleton/
32. react-native-shimmer-skeleton — GitHub — https://github.com/balram-01/react-native-shimmer-skeleton
33. fix(perf): skeletons show instantly, never flash, and don't jank tab nav — fitapp PR #72 — https://github.com/martinnovak22/fitapp/pull/72
34. Empty States and Loading States: Designing for Every Scenario — Mobile App Wiki — https://mobileapp.wiki/en/uiux/empty-loading-states-guide
35. The Art of Designing Empty States and Loading Patterns — Fillbyte — https://fillbyte.com/blog/the-art-of-empty-states-and-loading-experiences
36. Empty State Design: Best Practices for 2026 — Framer Websites — https://framerwebsites.com/blog/empty-state-design
37. Empty state pattern — Koder Design — https://kds.koder.dev/en-US/patterns/patterns-empty-state.html
38. SaaS Empty State Design: 9 Patterns That Drive Activation — Pixxen — https://pixxen.com/blog/saas-empty-state-design
39. Empty State Design Patterns — Zero-Data UI Examples — Gummble — https://gummble.com/blog/empty-state-design-patterns
40. Skeleton — Singapore Government Design System — https://designsystem.tech.gov.sg/components/skeleton

---

## 11. Summary

ThryftVerse's state-surface system is the largest quality gap in the app by surface area: **108 files use raw `ActivityIndicator`**, `FlagshipState` covers only **18 of ~165 screens**, there are **three parallel error/empty systems** that should be one, **no designed partial states**, **no screen-level offline states**, and **generic error copy** that leaves users stranded. The component primitives are mostly built — `FlagshipState` has the right variants, `EmptyState` has a rich preset library, 15 per-screen skeletons exist — but they are under-deployed, duplicated and inconsistently applied.

The flagship path is consolidation and coverage: one `FlagshipState` with all variants (including `partial`), one `SkeletonGroup` shared-shimmer pattern, one retry contract, and a disciplined migration of all 57+ raw-`ActivityIndicator` screens to geometry-matched skeletons or designed state surfaces. Every screen must answer: what does loading look like? What does empty look like? What does error look like? What does offline look like? What does partial look like? If any answer is "a centred spinner" or "a blank screen," the screen is not flagship.

**Visual QA: pending user review.**
