# 15 — Skeletons, Loading, Empty, Error, Partial & Offline State Coverage

> Flagship research department: state coverage across the whole ThryftVerse app.
> Audited against AGENTS.md §4 ("Complete state coverage"), §8 (Preserve and elevate), §11 (Truthful UI), §14 (State completeness), §16 (Performance) and §17 (Motion and interaction).
> Codebase snapshot: 2026-08-18. Screens directory contains 165 production TSX screens.

---

## 1. 2026 Competitor Benchmark — Skeletons, Empty, Error & Offline States

The 2026 consensus across Instagram, Pinterest, eBay, Snapchat, and the design-system literature (Singapore Gov Design System, Salesforce Storefront, Android offline-first guidance) has converged on a small set of hard rules. The apps that feel premium in 2026 are not the ones with the most decoration in their loading states — they are the ones whose loading, empty, error, and offline states are **indistinguishable in craft from the populated state**.

### 1.1 Skeleton shimmer quality

Instagram and Pinterest set the shimmer bar. Their skeletons are not "three grey bars" — they are **the real component with the data swapped for grey shapes**, sharing the exact CSS grid, the exact aspect ratios, the exact gap rhythm. Instagram's feed skeleton reserves the 4:5 portrait image block, the avatar circle, the two-line caption stack, and the action-row icon positions before a single byte of media has decoded. Pinterest's masonry skeleton preserves the staggered column heights by deriving placeholder heights from the column width divided by the portrait aspect ratio, so the loading frame and the final frame occupy the same pixels. The 2026 UX literature is blunt about why: "a skeleton placeholder must occupy the exact same box as the content it replaces. Same height, same width, same number of lines, same image aspect ratio" (DEV Community, "Loading Skeletons That Don't Lie"). A skeleton that does not match is **worse than no skeleton** because it sets an expectation and then breaks it — Cumulative Layout Shift spikes, the page jolts, and the user blames the app.

eBay's product-grid skeleton is the commerce benchmark: it reserves the square media block, the price line, the title two-liner, and the seller row, all at the exact final dimensions. Snapchat's story tray skeleton mirrors the circular avatar + username stack. The shared principle is **geometry match**: the skeleton is the final layout with the colour drained out.

Shimmer motion itself has tightened. The 2026 guidance is a low-contrast base + gentle highlight, a single sweep around 1.1–1.4s, `ease-in-out`, with `prefers-reduced-motion` collapsing to a static placeholder. High-frequency shimmer, large translation distances, and multi-axis animation are flagged as repaint risks. The Singapore Gov Design System explicitly warns: "Do not use skeletons as decorative placeholders. Skeletons signal loading; showing them in empty states misleads users into thinking content is on the way."

### 1.2 Empty states

The 2026 benchmark apps treat the empty state as a **first onboarding moment**, not a dead end. Pinterest's "No Pins yet" empty state shows a sample board preview and a single "Create your first board" CTA. eBay's "No saved searches" empty echoes the user's intent and offers "Create a saved search." Instagram's "No posts yet" on a fresh profile is restrained — a single line + a CTA — because the profile chrome (avatar, stats, bio) remains as context. The 72Technologies "Empty States UX: A Practical Playbook for 2026" distills the rule: an empty state must (1) name what happened, (2) preserve enough context to orient the person, and (3) offer the smallest action that changes the state. A large illustration cannot replace an accurate explanation or a working recovery route.

Copy quality separates the best from the rest. "No data" is a failure. "No items" is a failure. The benchmark is a value sentence: "Projects keep your work organized. Each project has its own files, tasks, and team members" — then a single primary CTA. The empty state is the first honest conversation the product has with a user, and 2026 teams that treat it as a real surface see meaningful week-one retention deltas.

### 1.3 Error states

The 2026 error-state pattern across the benchmark apps and the UX Patterns Guide is uniform: **keep the failure visible near the affected content, explain it in user terms, preserve user context, and offer a recovery path** (retry, edit, fallback, cached data, or support escalation). The error must answer three questions in order: (1) What happened, in plain language — not "Error 503" but "We couldn't load your orders." (2) Whose fault it is — if the system failed, say so explicitly so the user does not blame themselves. (3) What they can do next — a visible retry button, a way to save work locally, a path to support with a reference ID.

eBay and Pinterest both render a full-page error with a primary "Try again" and a secondary "Go home" / "Contact support." Snapchat's network error in the story viewer is inline and non-blocking — the story tile greys out with a "Tap to retry" overlay, preserving the tray context. The cognitive-load research (The Frontend Casebook) is clear: error messages are extraneous load. Inline errors reduce that load by presenting the error adjacent to the cause. A red border alone fails discoverability on mobile (colour alone is insufficient per WCAG 1.4.1). Actionable copy follows the pattern: **describe what is wrong + provide an example of what is right**.

### 1.4 Offline states

The 2026 offline benchmark is no longer a modal "You are offline" dialog. It is a **quiet, non-intrusive banner** that preserves cached content and surfaces queued actions. The Android offline-first architecture guidance and the Burncode "Offline-First Mobile Apps" piece converge: show offline status as ambient UI (a subtle banner, not a modal), show queued actions ("3 changes pending"), never lose user input (autosave drafts), and surface sync conflicts as "Server has a different version; your local changes are saved." The Coder Legion guidance adds the anxiety-management frame: uncertainty breeds anxiety, anxiety breeds avoidance. A small, honest indicator saying "twelve records waiting to upload" does more for user trust than any amount of interface polish. The three states worth distinguishing are: working normally, slow/unstable, fully offline — each needs its own visual language.

---

## 2. Psychology & Principles

### 2.1 Perceived performance

Users do not measure milliseconds; they measure how the waiting **feels**. Two loading screens that take the same wall-clock time can feel dramatically different based on their design. A skeleton that previews structure says "content is coming, and it will look roughly like this," reducing uncertainty. A blank screen with a spinner says "something is happening, but I won't tell you what." The 2026 research band is narrow and precise: under ~100ms feels instant and needs no indicator; 100ms–1s wants a subtle indicator; 1–10s requires a skeleton or progress indicator; over 10s needs a progress percentage, an explanation, or background processing. Skeletons flashed for under ~400ms are worse than nothing — they flash and vanish, signalling nothing. Skeletons held for over ~3s start to feel like the app is frozen pretending to be busy.

### 2.2 The geometry-match principle

This is the single most important loading-state principle in 2026. When the user sees a card-shaped silhouette with a circular silhouette in the top-left and two horizontal bars underneath, the brain does the work ahead of time. By the time data lands, the user has already built the structure. The arrival is a **fill-in, not a reveal**. Generic skeletons transfer that cognitive cost to the moment of arrival — the user is suddenly asked to integrate new information they did not budget attention for. The app feels jarring. They blame the app, not the network. The mechanical fix is reserving the exact footprint: same height, same width, same number of lines, same image aspect ratio, same grid columns. Measure the real UI and mirror it. This is also the CLS fix — the container reserves its final shape before content arrives, and when content swaps in, nothing shifts.

### 2.3 Cognitive ease in error states

Error messages are extraneous cognitive load — they redirect working memory from the user's goal to debugging the UI. The two sub-problems are **discoverability** (the user notices an error exists) and **actionability** (the user knows how to fix it). A red border fails discoverability on mobile. "Invalid email" fails actionability — it describes the problem but does not prescribe the fix. "Enter a valid email like name@example.com" solves both. The error must answer what happened, whose fault it is, and what to do next — in that order, in plain language, with a visible recovery action.

### 2.4 The "I'm not lost" feeling

The deepest job of a loading/empty/error/offline state is to tell the user **"I'm not lost."** The screen still looks like the place where future items will be managed. The header, the tab rail, the filters, the scope — all remain. The user can still recognise where they are and which controls will persist after content arrives. The 2026 ScreensDesign review of 14 mobile empty states puts it cleanly: "A zero-item list should still look like the place where future items will be managed. Preserve the list name, scope, selected tab, filters, date, team, or other context that disambiguates this screen from every other screen." An empty state that detaches into a marketing page destroys orientation.

### 2.5 Graceful degradation

Graceful degradation is the offline-first principle applied to state coverage: the app works fully on the device, syncs when the network is available, and never leaves the user staring at a broken screen because of a dropped signal. The local store is not a cache — it is the primary store. Every read goes to local data first. When the network is the failure mode, designing the app to assume failure makes it dramatically more reliable. Apps that handle this gracefully feel premium; apps that do not feel broken. The visible signal of graceful degradation is the **partial state**: some data loaded, some failing — show what succeeded, do not hide everything because one field failed.

### 2.6 Hope in empty states

An empty state is not the absence of content; it is a state with a job. The job is **hope**: show the user what the populated version will look like, explain the first action, and remove all friction from completing it. A first-use empty is the onboarding moment. A no-results empty echoes the query and suggests alternatives. A cleared empty confirms completion. An error-as-empty is forbidden — an error is its own state with recovery information; collapsing error into empty hides the recovery path and leaves the user believing the product is broken when it is merely offline.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 What is working

ThryftVerse has a genuine skeleton system and a flagship state primitive. The `SkeletonLoader` (`frontend/src/components/SkeletonLoader.tsx`) implements a multi-layer shimmer (white sweep + subtle brand glow) with reduced-motion collapse. Thirteen purpose-built skeletons exist in `frontend/src/components/skeletons/`, and the best of them — `ProfileSkeleton.tsx`, `LookDetailSkeleton.tsx`, `MasonrySkeleton.tsx`, `ItemDetailSkeleton.tsx` — explicitly mirror the final layout geometry. `ProfileSkeleton` (lines 10–33) documents that it "mirrors MyProfileScreen exact final layout" with `COVER_HEIGHT = 152`, `AVATAR_SIZE = 84`, `GRID_COLS = 3`, and `CARD_HEIGHT = CARD_WIDTH * (4/3)`. `MasonrySkeleton` (lines 22–33) derives portrait skeleton heights from the column width so "the loading frame matches the final render (no loading→final geometry shift, AGENTS.md §4 / §14)." `LookDetailSkeleton` mirrors the hero `SCREEN_W x SCREEN_W * 1.15`, the info section, the social actions row, and the "Shop the look" tray. These are flagship-grade.

The `FlagshipState` primitive (`frontend/src/components/flagship/FlagshipState.tsx`) provides canonical loading/empty/error/offline/unavailable variants with default titles, subtitles, icons, haptic levels (medium for error/offline retry, light otherwise), `accessibilityLiveRegion` (assertive for error/offline, polite otherwise), and a reduced-motion shimmer collapse. `FlagshipEmptyGraphic` (`frontend/src/components/flagship/FlagshipEmptyGraphic.tsx`) renders Skia vector illustrations (bag/box/search/chat/image) with an SVG fallback for web. `EmptyState` (`frontend/src/components/EmptyState.tsx`) supports icon, graphic, title, subtitle, hint, primary CTA, secondary CTA, suggested actions, and a compact density. `OfflineBanner` (`frontend/src/components/OfflineBanner.tsx`) subscribes to NetInfo via `useConnectivity` and renders a quiet, non-blocking banner with a retry action.

### 3.2 What is broken — the defects

**Defect 1: Spinner-only loading on 57 screens.** A grep for `ActivityIndicator` across `frontend/src/screens` returns **57 screens** that still import or render a raw `ActivityIndicator` instead of a geometry-matched skeleton. This directly violates AGENTS.md §14: "Do not use a generic centred spinner for every state." Examples: `CheckoutScreen.tsx` (lines 1697, 1742, 1935), `OrderDetailScreen.tsx` (line 1607), `PosterViewerScreen.tsx` (line 1061), `GroupChatScreen.tsx` (lines 329, 593), `FollowersScreen.tsx`/`FollowingScreen.tsx` (line 246/286), `MyProfileScreen.tsx` (line 620 — the cover upload spinner), `ConversationalSearchScreen.tsx` (line 455), `AIAgentIntegrationScreen.tsx` (lines 348, 446, 547, 647). Many of these are **inline action spinners** (a follow button showing a spinner while the mutation is in flight), which is an acceptable use of `ActivityIndicator`. But a significant subset are **full-screen or full-list loading states** where a skeleton is required — `GroupChatScreen` renders a centred spinner while the conversation loads (line 329) instead of a message-list skeleton, and `ConversationalSearchScreen` renders a spinner inside the suggestion skeleton row (line 455) instead of a shimmer bar.

**Defect 2: `FlagshipState` adopted on only 18 of 165 screens.** The canonical state primitive is imported by only 18 screens (`VerificationResponseScreen`, `SellerFulfilmentScreen`, `KYCVerificationScreen`, `ResolutionCentreScreen`, `SellerVerificationScreen`, `InventoryManagementScreen`, `SavedAddressesScreen`, `PostageScreen`, `BulkListingScreen`, `MyListingsScreen`, `EmailNotificationsScreen`, `AddBankAccountScreen`, `BalanceHistoryScreen`, `BundleBagScreen`, `PaymentsScreen`, `VerificationStatusScreen`, `CreatorAnalyticsDashboardScreen`, `SellerHubScreen`). The remaining ~147 screens use a mix of `EmptyState`, bespoke inline error banners, or nothing at all. There is no single source of truth for state rendering — `FlagshipState`, `EmptyState`, and hand-rolled error views coexist, producing inconsistent copy, icon, and recovery-action quality across the app.

**Defect 3: `FlagshipEmptyGraphic` adopted on only 4 screens.** The Skia/SVG empty-state illustration primitive is used on just 4 screens (grep returned 4 matches). `ClosetScreen.tsx` is the exemplar (lines 497, 522, 592 — `<FlagshipEmptyGraphic variant="bag" size={120} />`). The rest of the app's empty states fall back to the `EmptyState` icon ring or hand-rolled text, producing a visual inconsistency between the few screens that got the flagship treatment and the long tail that did not.

**Defect 4: Dead "Coming soon" placeholders.** AGENTS.md §11 is explicit: "Never expose controls that only produce 'Coming soon', 'Backend required', or generic explanation toasts." The grep found two live violations in production screens: `ConversationalSearchScreen.tsx` line 580 ("AI search is in demo mode — using keyword matching. Full AI coming soon.") and `LiveShoppingHomeScreen.tsx` line 424 ("Demo mode — live streams are simulated. Real video coming soon."). These are truthful disclosures rather than dead controls, but the copy signals prototype-quality surfaces. The `templates.ts` line 600 "Coming Soon" text layer is a creator template, not a product surface — acceptable.

**Defect 5: AI-slop empty copy.** Several empty states use generic, low-effort copy that fails the 2026 "value sentence" bar. `MyProfileScreen.tsx` line 915: "No additional details available." — this describes the absence without explaining the space or offering a next step. `PosterViewerScreen.tsx` line 916: "No stories available" — flat, no recovery. `MyProfileScreen.tsx` line 784: "Loading looks..." — a text string where a skeleton should be. The `FlagshipState` default subtitles ("When content appears, you'll see it here.") are generic and not context-specific — they do not tell the user what the space is for or what the first action is.

**Defect 6: No dedicated offline state on most screens.** 59 screens reference "offline" somewhere, but most of those references are to the `useConnectivity` hook or a `CoOwnOfflineBanner` import — not a designed offline state. The `OfflineBanner` is a banner, not a full offline state. When the device is offline **and** there is no cached data, most screens fall through to their error state (often an `EmptyState` with `icon="cloud-offline-outline"`) rather than a dedicated offline surface that distinguishes "you are offline, here is what you can still do" from "something went wrong." The 2026 guidance is clear: offline is its own state with its own visual language, not a relabelled error.

**Defect 7: No partial-state design.** AGENTS.md §14 lists "partial data" as a required state. The 2026 state-coverage literature (ui-craft `state-design.md`, open-design-pro `state-coverage.md`) is explicit: "Some data loaded, some failing. Show what succeeded. Hide everything because one field failed — user sees blank." ThryftVerse has no partial-state primitive. `OrderDetailScreen.tsx` (lines 790–807) comes closest — it distinguishes `loadError` ("Order could not be loaded") from `parcelError` ("Carrier tracking events are unavailable right now") and renders the order with a degraded tracking section — but this is hand-rolled per screen, not a system. Most screens treat any fetch failure as a full-screen error, hiding whatever data did load.

**Defect 8: Geometry-mismatch skeletons.** While the best skeletons match, several do not. `BoardSkeleton.tsx` renders a 2-column grid of equal-height `CARD_W * 1.15` cards — but the real board screen uses a masonry layout with varied heights, so the loading frame does not match the final render. `ProductGridSkeleton.tsx` hardcodes `ITEM_W = (W - 48) / 2` and `paddingHorizontal: 20` (line 21) — a magic 48 that does not derive from the design-token grid (`Space.md * 2 + gap`), risking drift if the grid spacing changes. `ConversationListSkeleton.tsx` uses hardcoded `paddingHorizontal: 20`, `paddingVertical: 14`, `gap: 14` (line 7) instead of design tokens.

**Defect 9: `FlagshipState` loading variant is a centred shimmer block, not a skeleton.** `FlagshipState` variant="loading" (lines 88–101) renders a `LoadingShimmer` — a 56pt glyph circle + two shimmer bars — centred on the screen. This is a **generic centred placeholder**, not a geometry-matched skeleton. It violates the same §14 principle it documents in its own header comment ("loading uses a skeleton-style shimmer, not a generic centred spinner"). The shimmer block does not mirror any final layout. Screens that use `<FlagshipState variant="loading" />` (e.g. `MyListingsScreen.tsx` line 160) get a centred shimmer instead of a listings skeleton.

---

## 4. State-Coverage Audit — Sampled Screens

The table below records which of the six canonical states each sampled screen actually renders. "Skeleton" = geometry-matched loading skeleton; "Spinner" = raw `ActivityIndicator` as the primary loading indicator; "Empty" = designed empty state with CTA; "Error" = designed error state with retry; "Offline" = dedicated offline state or banner; "Partial" = shows succeeded data alongside failed sections.

| Screen | Loading | Empty | Error | Offline | Partial | Notes |
|---|---|---|---|---|---|---|
| `HomeScreen.tsx` | Skeleton (`PremiumSkeletonTile`, masonry ratios) | `EmptyState` | `lastError` → `EmptyState` cloud-offline | No | No | Best-in-class skeleton with varied height ratios (line 107). No dedicated offline banner. |
| `BrowseScreen.tsx` | Skeleton (`MasonrySkeleton`) | `EmptyState` (filtered-empty vs first-empty distinguished) | `EmptyState` cloud-offline + `friendlyBackendError` | `OfflineBanner` | No | Exemplar. Distinguishes filtered-empty from first-empty (lines 513–516). |
| `InboxScreen.tsx` | Skeleton (`SkeletonLoader` rows) | `EmptyState` | Error banner with retry | `OfflineBanner` | No | Good coverage. Skeleton row is hand-rolled, not a shared component. |
| `MyOrdersScreen.tsx` | Skeleton (`OrderRowSkeleton`) | `EmptyState` (4 empty variants by tab) | `renderError` | No | No | Strong. `OrderRowSkeleton` matches row geometry. No offline banner. |
| `MyProfileScreen.tsx` | Spinner (`ActivityIndicator` line 620) + "Loading looks..." text (line 784) | `EmptyState` + in-grid listings empty | `parseApiError` toast | No | No | Mixed: cover upload spinner is acceptable; "Loading looks..." text is not a skeleton. |
| `WalletScreen.tsx` | Skeleton (`SkeletonLoader` hero + rows) | `FlagshipState` variant="empty" + `emptyGraphicVariant="bag"` | `FlagshipState` variant="error" | `CoOwnOfflineBanner` | No | Exemplar. Uses `FlagshipState` for empty/error, skeleton for loading, offline banner. |
| `SearchScreen.tsx` | Spinner (via `useBackendData` sync) | No designed empty | `lastError` banner | `OfflineBanner` | No | Weak. No designed empty state for no-results. Relies on `GlobalSearchScreen` for results. |
| `NotificationsScreen.tsx` | Skeleton (`SkeletonLoader` rows) | `EmptyState` cloud-offline | `EmptyState` cloud-offline (conflated with offline) | `OfflineBanner` | No | Error and offline are visually identical (both cloud-offline icon) — conflated. |
| `ClosetScreen.tsx` | Skeleton (`SkeletonLoader` tile grid) | `EmptyState` + `FlagshipEmptyGraphic` + `BoardEmptyGraphic` | `EmptyState` | No | No | Best empty-state craft in the app. Multiple graphic variants. No offline banner. |
| `MyListingsScreen.tsx` | `FlagshipState` variant="loading" (centred shimmer) | `EmptyState` | No designed error | No | No | Uses `FlagshipState` loading — but it is a centred shimmer, not a listings skeleton. |

**Audit summary:** of 10 sampled screens, 6 have geometry-matched skeletons, 2 use spinners for primary loading, 9 have a designed empty state, 7 have a designed error state, 5 have an offline banner, and **0 have a partial state**. Only `WalletScreen` and `BrowseScreen` achieve full coverage of the five states that apply to them. `SearchScreen` and `MyListingsScreen` are the weakest.

---

## 5. Micro Improvements — Per-Screen State Coverage

These are screen-local fixes, ordered by impact:

1. **`SearchScreen.tsx`** — add a no-results empty state that echoes the query and suggests alternative categories. Currently the screen has no designed empty state for the "search returned nothing" case, which is the most common search outcome. Use `EmptyState` with `graphic={<FlagshipEmptyGraphic variant="search" />}` and copy: "No results for '{query}' — try a different keyword or browse categories."

2. **`MyListingsScreen.tsx`** — replace `<FlagshipState variant="loading" />` (line 160) with a `ProductGridSkeleton` or a purpose-built `MyListingsSkeleton` that mirrors the listings grid. Add a designed error state with retry (currently missing). Add an `OfflineBanner`.

3. **`MyProfileScreen.tsx`** — replace "Loading looks..." text (line 784) with a `MasonrySkeleton` or a 3-column grid skeleton matching the looks tab. Replace "No additional details available." (line 915) with a value sentence: "Add your bio, location, and links to help buyers learn about you" + an "Edit profile" CTA.

4. **`NotificationsScreen.tsx`** — distinguish error from offline. Currently both render `EmptyState` with `icon="cloud-offline-outline"`. Error should use `icon="alert-circle-outline"` with "We couldn't load notifications" + retry; offline should keep cloud-offline with "You're offline — showing recent notifications."

5. **`GroupChatScreen.tsx`** — replace the centred `ActivityIndicator` (line 329) with a message-list skeleton (avatar + bubble shimmer rows). The conversation load is the primary async surface and deserves a geometry-matched skeleton.

6. **`ConversationalSearchScreen.tsx`** — replace the `ActivityIndicator` inside the suggestion skeleton row (line 455) with `SkeletonLoader` shimmer bars. Remove or rewrite the "Full AI coming soon" copy (line 580) per AGENTS.md §11.

7. **`PosterViewerScreen.tsx`** — replace "No stories available" (line 916) with a contextual empty state: "No stories yet — tap the camera to share your first look" + a creation CTA.

8. **`BoardSkeleton.tsx`** — derive card heights from the masonry height distribution (as `MasonrySkeleton` does) instead of a fixed `CARD_W * 1.15`, so the loading frame matches the final masonry render.

9. **`ProductGridSkeleton.tsx`** — replace the hardcoded `48` and `paddingHorizontal: 20` with `Space.md * 2 + gap` and `Space.md` to stay on the design-token grid.

10. **`ConversationListSkeleton.tsx`** — replace hardcoded `20`, `14`, `14` with `Space.md`, `Space.sm + Space.xs`, `Space.sm` design tokens.

---

## 6. Macro Improvements — State Machine, Skeleton System, Primitive Library

### 6.1 A unified async state machine

The root cause of inconsistent state coverage is that there is no single source of truth for the async lifecycle. Each screen hand-rolls `isLoading` / `isError` / `isOffline` / `isRefreshing` booleans. The fix is a canonical `useAsyncState` hook (or an extension of the existing `useBackendData` hook) that exposes a **discriminated union**:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading'; isRefreshing: boolean }
  | { status: 'populated'; data: T; isStale: boolean }
  | { status: 'empty'; isFiltered: boolean }
  | { status: 'partial'; data: T; failedSections: string[] }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'offline'; cachedData?: T; retry: () => void };
```

This replaces the boolean explosion and makes it impossible to render the wrong state. Every screen consumes the same state shape; the UI layer becomes a pure switch on `status`. This is the architectural fix that AGENTS.md §2 ("fix at the source-of-truth, not where the symptom appears") demands.

### 6.2 A skeleton system with layout-coupled skeletons

The 13 existing skeletons are good but incomplete. The system needs:
- A skeleton for **every screen that fetches a list or grid** — currently ~57 screens still use a raw spinner for primary loading. Each skeleton should be the real component with data swapped for `SkeletonLoader` shapes, sharing the exact grid, gaps, and aspect ratios.
- A **`SkeletonScreen` wrapper** that renders the header chrome (so the user keeps the "I'm not lost" context) with the skeleton body, preventing the full-screen-centred-shimmer anti-pattern.
- **Deterministic skeletons** — no `Math.random()` in render (AGENTS.md §16). `MasonrySkeleton` already uses a fixed height array (lines 26–33); every skeleton should follow this pattern.
- **Reduced-motion collapse** — every skeleton must collapse to a static placeholder via `useReducedMotion`. `SkeletonLoader` already supports this; the flag must be wired through every skeleton consumer.

### 6.3 An empty/error/offline primitive library

Consolidate `FlagshipState`, `EmptyState`, and `OfflineBanner` into a single **state primitive family** with a shared API:
- `<StateView status="loading" skeleton={<ProfileSkeleton />} />`
- `<StateView status="empty" variant="first-run" graphic="bag" title="..." cta="..." />`
- `<StateView status="empty" variant="no-results" query={q} />`
- `<StateView status="error" cause="..." onRetry={...} supportId={...} />`
- `<StateView status="offline" cachedData={...} onRetry={...} />`
- `<StateView status="partial" failedSections={['tracking']} >{orderContent}</StateView>`

This eliminates the three-primitive confusion (`FlagshipState` vs `EmptyState` vs hand-rolled) and makes full state coverage a single prop change. The `FlagshipEmptyGraphic` Skia/SVG illustration set should expand to cover every empty-state variant (bag, box, search, chat, image, notification, order, wallet, look, collection) so every empty state gets a purpose-built illustration, not a generic icon ring.

### 6.4 Offline-first data layer

The 2026 offline benchmark is architectural, not cosmetic. The macro fix is a read-through cache on every fetch: check cache first, hit the network in the background, update cache when fresh data arrives. This makes the offline state the **default** rather than an error fallback. The `useConnectivity` hook + `OfflineBanner` is the cosmetic layer; the data layer needs a SQLite-backed cache (WatermelonDB or similar) so that reads never block on the network. This is a large architectural change and should be sequenced after the state-machine and skeleton-system work.

---

## 7. Flagship Acceptance Criteria — Every Screen Renders All 6 States

A screen passes flagship state coverage when **all six states are designed and rendered**:

1. **Loading** — a geometry-matched skeleton that mirrors the final layout (same grid, same aspect ratios, same gaps). No centred spinner as the primary loading indicator. Skeleton appears after ~200ms and collapses to a static placeholder under reduced motion. The screen header/chrome remains visible during loading (the "I'm not lost" principle).
2. **Populated** — the designed happy-path state.
3. **Empty** — a designed empty state with a purpose-built `FlagshipEmptyGraphic` illustration, a value-sentence title ("Your wishlist is empty" not "No data"), a one-sentence explanation of what the space is for, and a single primary CTA. First-run empty, no-results empty, and cleared empty are distinguished where applicable.
4. **Error** — a designed error state that answers what happened (plain language, not "Error 503"), whose fault it is (system vs user), and what to do next (visible retry button + secondary "Contact support" with a reference ID). User input and context are preserved. Error is never collapsed into empty.
5. **Offline** — a dedicated offline state (not a relabelled error) that shows cached content where available, surfaces queued actions ("3 changes pending"), and offers a manual retry. The offline banner is non-modal and non-blocking.
6. **Partial** — when some sections load and others fail, the succeeded sections render normally and the failed sections show an inline error with a local retry. The screen never goes blank because one field failed.

**Additional acceptance criteria:**
- No screen uses a raw `ActivityIndicator` as its primary loading indicator.
- No screen renders "Coming soon" or "Backend required" copy (AGENTS.md §11).
- Every skeleton is deterministic (no `Math.random()` in render).
- Every state transition respects reduced motion.
- `FlagshipState` (or its successor) is the single state primitive; `EmptyState` and hand-rolled error views are migrated or removed.
- Every empty-state copy passes the value-sentence test: it explains what the space is for and offers a next step.

---

## 8. Priority & Sequencing

| Phase | Work | Impact | Effort |
|---|---|---|---|
| **1 — State machine** | Build `useAsyncState` discriminated-union hook; migrate `useBackendData` to expose it. | High — fixes the root cause of inconsistent coverage. | Medium — touches the data layer but not the UI. |
| **2 — Primitive consolidation** | Merge `FlagshipState` + `EmptyState` + `OfflineBanner` into a single `<StateView>` family with shared API. Expand `FlagshipEmptyGraphic` to all variants. | High — one prop change gives a screen full coverage. | Medium — refactor of 3 primitives + migration of 18 `FlagshipState` consumers. |
| **3 — Skeleton system** | Build skeletons for the ~57 spinner-only screens. Fix geometry-mismatch skeletons (`BoardSkeleton`, `ProductGridSkeleton`, `ConversationListSkeleton`). Add `SkeletonScreen` wrapper that preserves header chrome. | High — visible quality jump on every list/grid screen. | High — one skeleton per screen layout. Prioritise top-traffic screens first (`HomeScreen` already done; `ChatScreen`, `GroupChatScreen`, `CheckoutScreen`, `OrderDetailScreen`, `GlobalSearchScreen`). |
| **4 — Per-screen state fill** | For each of the 165 screens, fill the missing states using the new `<StateView>` + `useAsyncState`. Start with the 10 sampled screens, then the long tail. | High — closes the coverage gap. | High — screen-by-screen work. |
| **5 — Copy quality pass** | Rewrite all generic empty/error copy ("No data", "No additional details available", "Something went wrong") into value sentences with recovery actions. Remove "Coming soon" copy. | Medium — trust and clarity. | Low-medium — copy edits. |
| **6 — Partial-state design** | Build a `<StateView status="partial">` primitive and migrate screens with multi-section fetches (`OrderDetailScreen`, `CheckoutScreen`, `SellerFulfilmentScreen`) to show succeeded data alongside inline section errors. | Medium — graceful degradation. | Medium — per-screen section error handling. |
| **7 — Offline-first data layer** | Introduce a SQLite-backed read-through cache so reads never block on the network. Surface sync queue depth as ambient UI. | High — architectural reliability. | Very high — multi-quarter. Sequence after phases 1–5 so the UI is ready to consume offline state. |

**Sequencing rationale:** the state machine (phase 1) and primitive consolidation (phase 2) are prerequisites — they make every subsequent screen fix a one-prop change instead of a bespoke build. The skeleton system (phase 3) and per-screen fill (phase 4) are the visible quality work. Copy quality (phase 5) is low-effort and can run in parallel with phase 4. Partial-state (phase 6) and offline-first (phase 7) are deeper architectural work that builds on the foundation of phases 1–2.

---

### Key code references

- `frontend/src/components/SkeletonLoader.tsx` — base shimmer primitive, multi-layer (white sweep + brand glow), reduced-motion collapse.
- `frontend/src/components/skeletons/ProfileSkeleton.tsx` (lines 10–33) — exemplar geometry-matched skeleton documenting final-layout mirror.
- `frontend/src/components/skeletons/MasonrySkeleton.tsx` (lines 22–33) — deterministic height array derived from column width / portrait aspect ratio.
- `frontend/src/components/skeletons/LookDetailSkeleton.tsx` — mirrors hero, info section, social actions, shop-the-look tray.
- `frontend/src/components/skeletons/ItemDetailSkeleton.tsx` — mirrors hero image, price, title, meta pills, description, seller card.
- `frontend/src/components/flagship/FlagshipState.tsx` (lines 88–101) — loading variant is a centred shimmer block, not a geometry-matched skeleton (defect 9).
- `frontend/src/components/flagship/FlagshipEmptyGraphic.tsx` — Skia/SVG empty illustrations (bag/box/search/chat/image); adopted on only 4 screens (defect 3).
- `frontend/src/components/EmptyState.tsx` — legacy empty primitive; supports icon, graphic, CTA, compact density.
- `frontend/src/components/OfflineBanner.tsx` — non-blocking offline banner via `useConnectivity`; a banner, not a full offline state.
- `frontend/src/screens/BrowseScreen.tsx` (lines 513–516, 664–960) — exemplar screen: distinguishes filtered-empty from first-empty, uses `MasonrySkeleton`, `OfflineBanner`, `friendlyBackendError`.
- `frontend/src/screens/WalletScreen.tsx` (lines 265–352) — exemplar: `FlagshipState` for empty/error, skeleton for loading, `CoOwnOfflineBanner`.
- `frontend/src/screens/MyListingsScreen.tsx` (line 160) — `<FlagshipState variant="loading" />` centred shimmer instead of a listings skeleton (defect 9 consumer).
- `frontend/src/screens/ConversationalSearchScreen.tsx` (line 580) — "Full AI coming soon" copy (defect 4).
- `frontend/src/screens/LiveShoppingHomeScreen.tsx` (line 424) — "Real video coming soon" copy (defect 4).
- 57 screens import `ActivityIndicator` (defect 1) — see grep output above for the full list.
- `AGENTS.md` §4 (line 178), §14 (lines 467–485), §11 (lines 397–425) — the charter rules this department enforces.
