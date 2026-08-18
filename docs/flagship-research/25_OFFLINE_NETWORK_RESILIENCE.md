# 25 — Offline & Network Resilience

> **Department:** Offline mode · cached data · sync · optimistic updates · retry queues · conflict resolution · network state detection · graceful degradation
> **Benchmark date:** 2026-08
> **Design.md alignment:** §14 State Completeness ("loading, empty, error, partial, offline, populated states are all designed"), §11 Truthful UI, §Perceived Performance & Visual Completion
> **AGENTS.md alignment:** §4 ("Full state coverage is not optional"), §14 State Completeness, §15 Media Rules, §11 Truthful UI

---

## 1. 2026 Competitor Benchmark — Offline Resilience

The apps ThryftVerse benchmarks against (Instagram, Pinterest, eBay, Snapchat) have spent years treating the network as a *failure mode*, not a *given*. Their 2026 architectures share a common inversion: **the local store is the source of truth for the user's immediate session; the server is the source of truth for history** ([meetmushfiq.com — offline-first mobile UX](https://meetmushfiq.com/blog/offline-first-mobile-ux-field-operators)). The network is an asynchronous synchronisation layer, never a blocking dependency on the critical path.

### Instagram — disk-as-network cache

Instagram's engineering team published the foundational pattern that every media-first app now emulates: a **response store** that delivers cached content from disk *as if it were coming from the network*, simulating a successful network call ([instagram-engineering.com — background data prefetching](https://instagram-engineering.com/improving-performance-with-background-data-prefetching-b191acb39898)). The three components are the device screen, the network layer composing HTTP requests, and the network engine delivering them. When a request would fail, the response store returns the last-good cached payload transparently. Instagram explicitly chose this because "seeing older content would be better than seeing gray boxes and white screens" — a principle directly applicable to ThryftVerse's discovery and trade-hub feeds.

Instagram's web team later extended this with a **cache-first rehydration** pattern: persist a subset of the Redux store to IndexedDB, rehydrate on load, and use a `stagingAction`/`stagingCommit` reducer enhancer to record and replay local user interactions onto fresh server data — a "rebase" that avoids losing local interactions when new server data arrives ([devblogs.co — Instagram cache-first](https://devblogs.co/posts/making-instagramcom-faster-part-3-cache-first)). This is the optimistic-update-plus-reconciliation loop that ThryftVerse needs for wishlist toggles, collection edits, and chat message sends.

### Pinterest — feed fan-out and perceived performance

Pinterest's feed architecture stores continuously-updated following feeds in HBase, with writes fanned out asynchronously via a message queue so the frontend never performs heavy lifting synchronously ([pinterestlabs.com — Scaling Deep Social Feeds](https://www.pinterestlabs.com/media/yuhnu1jv/scaling-deep.pdf)). For the client, this means the feed is always available from a cached snapshot and background-refreshed; the user never waits on a fan-out completion. Pinterest also reduced video startup latency by embedding HLS/DASH manifest bytes directly into API responses and adding a MemCache layer — a progressive-loading technique that ensures media-rich surfaces remain usable on poor connections.

### eBay — PWA offline for inclusion

eBay explicitly built an offline experience to "break down network connectivity barriers" for users in developing countries and on trains through tunnels ([ebayinc.com — PWA mobile experience](https://www.ebayinc.com/stories/news/exploring-progressive-web-apps-to-enhance-ebays-mobile-experience/)). They incorporated a service worker into their existing mobile web app rather than rebuilding, using it for caching, prefetching, and navigational resilience. The principle — *cached versions of the site when no network connectivity exists* — maps directly to ThryftVerse's commerce surfaces: a buyer who loses signal mid-listing-view should still see the cached product, seller, and price, not a crash.

### Snapchat — ephemeral content with aggressive prefetch

Snapchat's Stories architecture (24-hour TTL with aggressive client prefetch targeting sub-200ms perceived load) demonstrates how ephemeral content should handle network reality: prefetch when connectivity is good, cache aggressively, and degrade to the last-known state when it isn't ([sujeet.pro — Design Instagram](https://sujeet.pro/articles/design-instagram-photo-sharing)). The MQTT-based real-time path with session resumption logic ensures that a network transition doesn't mean a full state reload or a window of lost data.

### The 2026 consensus

Across all four benchmarks, the 2026 consensus is:

1. **Reads always hit local first** — zero latency, zero network dependency ([reactnativerelay.com — Offline-First RN 2026](https://reactnativerelay.com/article/building-offline-first-react-native-apps-2026-expo-sqlite-drizzle-orm-sync-strategies)).
2. **Writes go local first, then queue for background sync** — the user never waits for a 200 OK to see their action reflected.
3. **Sync runs opportunistically** when connectivity returns, handling conflicts gracefully.
4. **The UI never reports server success for an action that is only saved locally** — the contract is honest about what is committed vs. pending ([uxpatternsguide.com — web.dev offline UX](https://uxpatternsguide.com/sources/webdev-offline-ux-design-guidelines/)).

---

## 2. Psychology & Principles

### The "never lose my work" principle

The single most damaging failure mode in mobile is **silent data loss** — a user's edit vanishes and they don't find out until it matters ([derkonline.com — offline-first mobile sync](https://derkonline.com/blog/offline-first-mobile-sync-conflicts)). This is worse than a crash, worse than an error message, worse than a spinner. A crash is visible and the user retries. An error message is visible and the user decides what to do. Silent data loss is invisible: the user believes their action succeeded, moves on, and discovers days later that it didn't. This destroys trust permanently.

Every design decision in the offline resilience department flows from this principle: **the app must never silently lose a user's intent**. A wishlist toggle, a chat message, a bid, a collection edit, a profile update — each must either reach the server or be durably queued for replay with the user informed of its pending status. ThryftVerse's AGENTS.md §11 codifies this as "Never fabricate success states" and "Do not claim that an operation succeeded when only local temporary state changed."

### Optimistic updates as trust

Optimistic updates are not a performance trick — they are a **trust contract**. When the user taps "Add to wishlist" and the heart fills immediately, the app is saying "I accept your intent and I will make it real." If the server later rejects and the heart empties without explanation, the contract is broken. The Duolingo engineering team, who rely heavily on frontend prediction for offline support, found that the technique is powerful but "requires careful thinking about state synchronization, conflict resolution, and rollback strategies" ([blog.duolingo.com — frontend prediction](https://blog.duolingo.com/frontend-prediction/)).

The lifecycle that maintains trust has five states: **Idle → Pending (optimistic) → Committed → Failed → Superseded** ([matheuspalma.com — optimistic UI server reconciliation](https://matheuspalma.com/blog/optimistic-ui-server-reconciliation-patterns)). Skipping the Failed state produces ghost data. Skipping the Superseded state produces flicker and stale overwrites. Skipping the Committed reconciliation produces "success" toasts for work the server rejected. All three are trust violations.

### The "seamless reconnection" principle

When the network returns, the user should not have to do anything. The Android Build for Billions guidance is explicit: "apps shouldn't notify users that connectivity has been lost. It's only when the user performs an operation where connectivity is essential that the user needs to be notified" ([developer.android.com — connectivity](https://developer.android.com/docs/quality-guidelines/build-for-billions/connectivity)). The reconnection should be **silent, automatic, and verified** — the sync engine flushes the queue, the UI updates to reflect confirmed state, and the only visible signal is the disappearance of the offline indicator and the pending badges.

### The "cached = alive" perception

A cached feed is not a broken feed. Instagram's insight that older content is better than grey boxes is a perception principle: **a surface with stale data feels alive; a surface with no data feels dead**. The offline banner should say "Showing cached data · last synced 2 minutes ago" — communicating freshness honestly while keeping the surface visually populated. This is exactly what ThryftVerse's `CommerceDetailOfflineBanner` and `CoOwnOfflineBanner` already render, but only on three commerce detail screens. The principle needs to extend to every surface.

### Conflict resolution transparency

When the server has a different version than the local edit, the resolution must be **transparent, not silent**. The 2026 best practice is: "Sync conflicts surface as 'Server has a different version, your local changes are saved'" ([burncode.org — offline-first mobile architecture](https://burncode.org/blog/offline-first-mobile-architecture)). For ThryftVerse's commerce domain, a conflict on a bid or a co-own unit purchase is high-stakes — the user must know that their local view of the auction state may not match the server's authoritative state. The `BidSheet` already handles a `recoverable_conflict` stage for buy-now price changes (`frontend/src/components/ui/BidSheet.tsx:294-299`), but this is a single conflict type in a single component, not a system-wide resolution strategy.

---

## 3. Architectural Issues & Engineering Flaws

### The "always-online" assumption as engineering debt

ThryftVerse's current architecture is built on an implicit contract that the AGENTS.md and 2026 best practices explicitly reject: **the app is a thin viewer on top of the cloud, and the cloud is the source of truth**. This contract "works beautifully in Manhattan and catastrophically in Chapainawabganj" ([meetmushfiq.com — offline-first mobile UX](https://meetmushfiq.com/blog/offline-first-mobile-ux-field-operators)). The symptoms are:

1. **Most reads are fetch-on-mount with no local fallback.** The `useListingDetail` hook (`frontend/src/platform/product/useListingQueries.ts:51-80`) uses TanStack Query with a 5-minute staleTime and 30-minute gcTime — so React Query's in-memory cache will serve repeated reads within that window. But the cache is **in-memory only**, not persisted to disk. A cold start (app kill, OS memory pressure eviction) loses all cached data and forces a network round-trip on the next mount. Instagram's response store persists to disk so cached content survives cold starts; ThryftVerse's React Query cache does not.

2. **Writes either succeed or throw — there is no durable pending state.** The `fetchJson` function in `apiClient.ts` does queue offline writes via `useOfflineQueue` when `isInternetReachable === false` (`frontend/src/lib/apiClient.ts:727-745`), and this is genuinely good engineering. But the queue is only flushed when something explicitly calls `flushQueue` — and **nothing in the codebase calls `flushQueue`**. A grep for `.flushQueue` returns zero component or hook invocations. The offline queue is a durable store with a drain that has no drain-scheduler attached. Queued mutations persist to AsyncStorage forever (or until `MAX_RETRIES` evicts them to the dead-letter queue) but are never replayed automatically on reconnection.

3. **No background sync engine.** There is no `BackgroundFetch`, `TaskManager`, or `WorkManager` integration anywhere in the codebase (grep returns zero matches). The 2026 consensus is that a dedicated sync engine with change tracking, delta updates, and conflict resolution is non-negotiable for offline-first apps ([needlecode.com — offline data sync React Native](https://needlecode.com/blog/mobile-app/offline-data-sync-react-native-architectural-guide.html)). ThryftVerse has the storage primitives (AsyncStorage, SecureStore, the offline queue store) but no engine that orchestrates them.

### Data loss on network drop

The most dangerous scenario is a **mid-flight write failure**. The `apiClient.ts` handles this correctly for write methods (POST/PUT/DELETE/PATCH): if the connection drops before the server confirms, the mutation is enqueued for replay and an `ApiRequestError` with `OFFLINE_WRITE_QUEUED_CODE` is thrown (`frontend/src/lib/apiClient.ts:776-791`). This is the right pattern. But the gap is that the **UI layer above the API client often does not distinguish this "queued" error from a hard failure**. Screens that call `parseApiError` and show `parsed.message` as an error toast will show "You are offline. This action was saved and will be submitted automatically when you reconnect" — which is technically correct but presented as an **error**, not as a **pending success**. The toast type is `'error'` in every call site examined (e.g., `WriteReviewScreen.tsx:130`, `CreateGroupChatScreen.tsx:313`), so the user sees a red error toast for an action that was successfully queued. This is a truthful-UI violation (AGENTS.md §11): the operation did not fail, it was deferred, but the UI presents it as a failure.

### Crash on API timeout

Before the network resilience layer was added to `apiClient.ts`, a raw `fetch` with no timeout would hang indefinitely on a slow connection. The current `fetchWithTimeout` (15s default, `apiClient.ts:369-392`) and `fetchWithRetry` (exponential backoff, `apiClient.ts:406-448`) are solid. But not all network calls go through `fetchJson`. The `MediaUploadQueue` (`frontend/src/services/mediaUploadQueue.ts:331`) calls `fetch(asset.uri).then(response => response.blob())` with no timeout — a slow local file read could hang the upload queue indefinitely. And the chat message send path in `useConversationMessages.ts` calls `sendConversationMessageOnApi` which ultimately uses `fetchJson`, but the optimistic send sets `status: "sending"` and on `.catch()` sets `status: "failed"` — if the request times out after 15s + 3 retries (potentially 45s+ with backoff), the user stares at a "sending" indicator for nearly a minute before seeing "failed". There is no progressive timeout feedback.

### No retry = silent failure

The `QueryClient` default (`frontend/src/platform/server/queryClient.ts:17-29`) retries twice with exponential backoff, skipping 400/401/403/404/409/422. This is correct for queries. But **mutations have `retry: 0`** — a failed mutation is never retried by React Query. This is intentionally deferred to the application layer (because mutation retry needs idempotency keys and user-visible state), but the application layer's retry is **manual only**: the user must tap "Retry" on a `SyncRetryBanner` or `RetryState`. There is no automatic mutation retry queue at the React Query level. The `MediaUploadQueue` is the one exception — it has a proper retry queue with `MAX_RETRIES = 3`, `attemptCount` tracking, and `retryFailed()`/`retryItem()` methods (`mediaUploadQueue.ts:106-128`). But this pattern is not generalised to other mutation types.

---

## 4. AI Slop Diagnosis — Where AI Code Ignores Network Reality

AI-generated code systematically ignores network failure modes because the training distribution is dominated by happy-path examples. The specific tells in this codebase and in generic AI output are:

### No error handling on fetch

The `MediaUploadQueue.processItem` method (`mediaUploadQueue.ts:331`) calls `fetch(asset.uri).then(response => response.blob())` with no try/catch around the fetch itself — if the local URI is invalid or the file system is unavailable, the promise rejects and the item transitions to `failed` via the outer catch, but the error message will be a raw JS exception string like "Network request failed" for what is actually a local file read error. AI code frequently conflates local fetch and network fetch error semantics.

### Hardcoded online assumptions

The `useMobileQueryLifecycle` hook (`frontend/src/platform/server/useMobileQueryLifecycle.ts:8-11`) correctly wires NetInfo into React Query's `onlineManager`, so React Query will pause refetches when offline. But many screens that call `useQuery` hooks do not check `isOffline` before rendering — they rely on React Query's `isLoading`/`isError` states, which means an offline query shows as `isLoading: true` indefinitely (React Query pauses the query but the `isLoading` flag stays true if there's no cached data). The `ItemDetailScreen` is one of the few that does check `useConnectivity()` and renders `CommerceDetailOfflineBanner` (`frontend/src/screens/ItemDetailScreen.tsx:217, 874`), but most list/feed screens do not.

### Missing loading states on network calls

Several screens call async functions in `useEffect` without setting a loading flag first. The `fetchMyProfile` action in `useStore.ts:578-608` has a try/catch that silently fails ("profile will remain as cached or null"), but the calling screen has no way to know whether the profile is loading, failed, or stale. AI code frequently writes `try { await fetch() } catch { /* silently fail */ }` patterns that produce invisible loading states.

### Fake "success" on failed requests

The `useProductSocialState` hook (`frontend/src/platform/product/useProductSocialState.ts:54-64`) calls `toggleWishlist(objectId)` which is a **local-only store mutation** — it never hits the network. The comment at line 57-59 is honest about this: "the store action is synchronous and local-persisted, so no network failure path exists for wishlist." But the `show(wasLiked ? 'Removed from wishlist' : 'Added to wishlist', 'success')` toast at line 63 presents this as a **success**, when in reality the wishlist change is **never synced to the server**. There is no `addToWishlistOnApi` call. The wishlist is local-only. This is a truthful-UI violation: the user believes their wishlist is saved to their account, but it only exists in AsyncStorage. If they reinstall or switch devices, it's gone. This is the most dangerous form of AI slop in the network resilience domain — **fabricated persistence** (AGENTS.md §11: "Never fabricate persistence").

---

## 5. Current ThryftVerse Audit — Concrete Defects

### What exists (the foundation)

ThryftVerse is not starting from zero. There is a genuine network resilience foundation:

| Component | File | Status |
|---|---|---|
| `useConnectivity` hook | `frontend/src/hooks/useConnectivity.ts:23-48` | **Exists** — seeds initial NetInfo snapshot, subscribes to changes, returns `isOffline`/`isConnected`/`connectionType` |
| `CommerceDetailOfflineBanner` | `frontend/src/components/commerce/detail/CommerceDetailOfflineBanner.tsx:26-60` | **Exists** — quiet warning-tinted banner, "Showing cached data · last synced X" |
| `CoOwnOfflineBanner` | `frontend/src/components/coown/CoOwnOfflineBanner.tsx:24-49` | **Exists** — identical pattern, Co-Own specific |
| `FlagshipState` (offline variant) | `frontend/src/components/flagship/FlagshipState.tsx:23, 39, 47, 55` | **Exists** — full-screen offline state with `cloud-offline-outline` icon and retry action |
| `CoOwnStateCanvas` (offline + stale variants) | `frontend/src/components/coown/CoOwnStateCanvas.tsx:9-18, 43, 45` | **Exists** — includes `offline`, `stale`, `halted`, `restricted`, `thin` state variants |
| `SyncRetryBanner` | `frontend/src/components/SyncRetryBanner.tsx:23-81` | **Exists** — message + retry button with telemetry tracking |
| `RetryState` | `frontend/src/components/RetryState.tsx:15-42` | **Exists** — full-screen error state with "Try Again" action |
| Offline write queue | `frontend/src/lib/offlineQueue.ts:73-237` | **Exists** — Zustand store, persisted to AsyncStorage, dedup by signature, FIFO cap 100, exponential backoff (2s base, 60s max, 8 retries), dead-letter queue |
| Network error classification | `frontend/src/lib/apiClient.ts:283-322` | **Exists** — `classifyNetworkError` returns `timeout`/`offline`/`server_error`/`client_error`/`network` |
| Timeout + retry in fetch | `frontend/src/lib/apiClient.ts:369-448` | **Exists** — `fetchWithTimeout` (15s AbortController), `fetchWithRetry` (3 retries, exponential backoff 1s/2s/4s, 30s cap) |
| Offline write enqueue in `fetchJson` | `frontend/src/lib/apiClient.ts:727-745, 776-791` | **Exists** — pre-flight `isInternetReachable` check + mid-flight drop catch, both enqueue via `useOfflineQueue` |
| React Query online/focus lifecycle | `frontend/src/platform/server/useMobileQueryLifecycle.ts:6-32` | **Exists** — NetInfo → `onlineManager`, AppState → `focusManager` |
| Idempotency keys on mutations | `TradeConfirmScreen.tsx:63-69`, `CheckoutScreen.tsx:697-698`, `MakeOfferScreen.tsx:152-153`, `AuctionDetailScreen.tsx:335, 362` | **Exists** — per-attempt stable IDs reused across retries |
| Media upload retry queue | `frontend/src/services/mediaUploadQueue.ts:46-399` | **Exists** — `MAX_CONCURRENCY=2`, `MAX_RETRIES=3`, per-item retry, cancel, reorder |
| Chat optimistic send + retry | `frontend/src/hooks/chat/useConversationMessages.ts:338-538` | **Exists** — optimistic `sending` → `sent`/`failed`, tap-to-retry, NetInfo reconnect sync, AppState foreground sync |
| Optimistic updates with rollback | `InventoryManagementScreen.tsx:192-212`, `ChatScreen.tsx:973-1027`, `ManageCollectionItemsScreen.tsx:80-112`, `SaveToCollectionModal.tsx:65-82`, `CoOwnPriceAlertsScreen.tsx:81-90` | **Exists** — scattered across ~10 screens, no shared abstraction |

### What is missing (the defects)

| Defect | Evidence | Severity |
|---|---|---|
| **No `flushQueue` is ever called** — the offline queue has a drain but no drain-scheduler | grep for `.flushQueue` returns 0 component/hook calls; `offlineQueue.ts:137` defines `flushQueue` but nothing invokes it | **Critical** — queued writes are never replayed; user actions silently stuck in AsyncStorage |
| **No global offline banner / queue-depth surface** — the `useConnectivity` hook comment references a "global OfflineQueueBanner" (`useConnectivity.ts:7`) that does not exist as a component | grep for `OfflineQueueBanner` returns only test assertions and the hook comment; no component file exists | **High** — user has no global awareness of pending offline actions |
| **React Query cache is in-memory only — no persistence** | `queryClient.ts:17-29` creates a standard `QueryClient` with no `persistQueryClient` plugin; cold start loses all cached data | **High** — offline browsing of cached content is impossible after app kill |
| **No local database (SQLite/WatermelonDB/MMKV)** — AsyncStorage is the only persistent store | grep for `MMKV`, `WatermelonDB`, `SQLite`, `expo-sqlite` returns 0 matches in `frontend/src` | **High** — AsyncStorage is too slow for large datasets and cannot serve as an offline-first source of truth ([codeyourreality.com — building offline-first apps](https://www.codeyourreality.com/blog/building-offline-first-apps)) |
| **No conflict resolution strategy** — no LWW, no merge, no CRDT, no human-in-the-loop | grep for `conflictResolution`, `lastWriteWins`, `mergeStrategy` returns only UI gesture conflicts and one `BidSheet` buy-now conflict stage | **High** — when sync eventually runs, concurrent edits will silently overwrite |
| **No background sync engine** — no `BackgroundFetch`, `TaskManager`, `WorkManager` | grep returns 0 matches for all three | **Medium** — sync only happens when app is foregrounded; queued writes don't drain in background |
| **Wishlist is local-only, never synced to server** | `useProductSocialState.ts:57-63` — `toggleWishlist` is store-only, no API call, yet shows `'success'` toast | **High** — fabricated persistence, truthful-UI violation |
| **No reconnection listener that triggers `flushQueue`** — `useConversationMessages.ts:156-168` syncs chat on reconnect, but no global listener flushes the offline write queue | `useConversationMessages.ts:161-163` calls `syncMessagesFromApi` on reconnect; no equivalent calls `useOfflineQueue.getState().flushQueue` | **Critical** — the queue's `flushQueue` is never triggered by network restoration |
| **Queued-write errors shown as `'error'` toasts, not pending-success** | `WriteReviewScreen.tsx:130`, `CreateGroupChatScreen.tsx:313` — `parseApiError` result shown via `show(msg, 'error')` even when `code === OFFLINE_WRITE_QUEUED_CODE` | **Medium** — truthful-UI violation; queued action presented as failure |
| **No `connectionQuality` classification** — `useConnectivity` returns `connectionType` but not quality (good/poor/offline) | `useConnectivity.ts:14-21` — no quality tier; 2026 best practice includes quality for adaptive image sizes and sync throttling ([oneuptime.com — RN offline architecture](https://oneuptime.com/blog/post/2026-01-15-react-native-offline-architecture/view)) | **Low** — nice-to-have for progressive image loading |
| **No jitter in `fetchWithRetry` backoff** — pure exponential, no randomness | `apiClient.ts:358-361` — `computeBackoffDelay` returns `RETRY_BASE_DELAY_MS * 2^attempt` with no jitter | **Medium** — thundering herd risk when many clients retry simultaneously ([getstream.io — resilient distributed systems](https://getstream.io/blog/resilient-distributed-systems-mobile/)) |
| **`MediaUploadQueue` fetch has no timeout** — local file `fetch(uri).then(blob)` | `mediaUploadQueue.ts:331` — no AbortController on the local fetch | **Low** — local file reads are usually fast, but a corrupted FS could hang |
| **No sync watermark / pending badge UI** — user cannot see "3 changes pending" | No component renders `selectPendingCount` from `offlineQueue.ts:244` | **Medium** — user has no visibility into sync state |

---

## 6. Micro Improvements

These are focused, proportional fixes that don't require architectural changes:

1. **Wire a NetInfo reconnect listener to `flushQueue`.** Add a single `useEffect` in `AppNavigator` (or a new `useOfflineQueueSync` hook) that subscribes to NetInfo and calls `useOfflineQueue.getState().flushQueue(fetch)` when `isConnected` transitions from false → true. This is ~20 lines and closes the most critical defect. The `flushQueue` implementation already exists and already checks `isInternetReachable` before draining (`offlineQueue.ts:143-144`).

2. **Distinguish queued-write errors from hard failures in toast rendering.** In every `parseApiError` call site, check `parsed.code === OFFLINE_WRITE_QUEUED_CODE` and show a `'info'` toast with "Saved offline — will sync automatically" instead of an `'error'` toast. This is a one-line branch in each call site (~10 sites).

3. **Add jitter to `computeBackoffDelay`.** Change `apiClient.ts:358-361` to add `+ Math.random() * RETRY_BASE_DELAY_MS` (Full Jitter or Equal Jitter). One-line fix that prevents thundering-herd retry storms ([mvpfactory.io — idempotent APIs for mobile](https://mvpfactory.io/blog/designing-idempotent-apis-for-mobile-clients-retry-logic-idempotency-keys-and/)).

4. **Add `selectPendingCount` to a global banner.** Create a lightweight `OfflineQueueIndicator` component that subscribes to `useOfflineQueue(selectPendingCount)` and renders "N changes pending" when count > 0. Place it in the tab bar or as a transient banner. ~30 lines.

5. **Persist React Query cache to MMKV.** Add `@tanstack/query-sync-storage-persister` with MMKV as the storage backend. This is a ~15-line setup in `AppNavigator` that persists the top-N most valuable queries (listing details, collections, profile) to disk so they survive cold starts.

6. **Add `connectionQuality` to `useConnectivity`.** Extend the hook to classify `good`/`poor`/`offline` based on `connectionType` + `isInternetReachable` + `details` (cellular generation). Use this to throttle image quality on poor connections.

7. **Add a timeout to `MediaUploadQueue`'s local fetch.** Wrap `fetch(asset.uri)` in a `Promise.race` with a 30s timeout, or use `fetchWithTimeout` from `apiClient.ts`.

---

## 7. Macro Improvements — Offline Architecture

The micro fixes close the most dangerous gaps, but flagship-grade offline resilience requires architectural investment. The target architecture has six layers:

### 7.1 Cache Layer (local source of truth)

**Goal:** Every read hits a local store first; the network is a background refresh.

**Implementation:** Introduce MMKV for fast key-value persistence (30x faster than AsyncStorage, synchronous reads) for small data (wishlist, collections, profile, settings) and Expo SQLite + Drizzle ORM for structured data (listings, messages, trade hub data). The 2026 React Native tooling consensus is Expo SQLite with Drizzle for type-safe reactive queries via `useLiveQuery` ([reactnativerelay.com — Offline-First RN 2026](https://reactnativerelay.com/article/building-offline-first-react-native-apps-2026-expo-sqlite-drizzle-orm-sync-strategies)). WatermelonDB is the alternative for very large datasets ([thebeyondhorizon.com — building offline-first mobile apps](https://www.thebeyondhorizon.com/blog/building-offline-first-mobile-apps-react-native)).

The Zustand store already persists to AsyncStorage via `persist` middleware (`useStore.ts:549-551`). Migrate the storage backend from AsyncStorage to MMKV for a 30x read-speed improvement with no API changes — `persist` accepts any `StateStorage` interface.

For React Query, add `persistQueryClient` with a `PersistedClient` storage adapter backed by MMKV. This ensures the top-N queries survive cold starts. Use `b Persister` with a `maxAge` of 24 hours and a `buster` key that changes on app version upgrades.

### 7.2 Sync Engine

**Goal:** A dedicated background process that tracks dirty records, pushes local changes to the server, and pulls server deltas — without user intervention.

**Implementation:** A `SyncEngine` class that:
- Maintains a `lastPulledAt` timestamp (or vector clock for multi-device).
- On app foreground (`AppState` → `active`) and on NetInfo reconnect, runs a `pullChanges(serverChangesSince(lastPulledAt))` + `pushChanges(localDirtyRecords)` cycle.
- Uses the existing `useOfflineQueue` as the write outbox — each queued mutation is a dirty record.
- Applies server deltas to the local SQLite/MMKV store.
- Emits sync-status events (`syncing`, `synced`, `sync-error`, `conflict`) that the UI can subscribe to.

The 2026 pattern from WatermelonDB's `synchronize()` is the reference: `pullChanges` fetches server deltas, `pushChanges` sends local dirty records, both are idempotent and resumable ([needlecode.com — offline data sync](https://needlecode.com/blog/mobile-app/offline-data-sync-react-native-architectural-guide.html)).

### 7.3 Conflict Resolver

**Goal:** When the same record was edited in two places, resolve predictably and transparently.

**Implementation:** A per-entity conflict resolution strategy:
- **Wishlist, collections, settings:** Last-write-wins (LWW) with server-assigned `updatedAt` timestamps. Low contention, single-user-per-record. ([dev.to — offline-first Flutter](https://dev.to/bimal-py/offline-first-flutter-syncing-local-and-remote-data-reliably-4fdh))
- **Chat messages:** Never conflict — messages are append-only with client-generated UUIDs. The server never rejects a message; it only orders them.
- **Auction bids, co-own trades:** Server-authoritative. The server is the single source of truth for trade state. A local "bid placed" that the server rejects (because someone else bid higher) is a **soft conflict** — the UI shows the server's current state and the user's bid is surfaced as "outbid", not "failed" ([137foundry.com — optimistic UI rollback](https://137foundry.com/articles/how-to-implement-optimistic-ui-updates-that-roll-back-cleanly)).
- **Listing edits:** Field-level merge. If the seller edits the title on device A and the price on device B, both edits survive. This requires the server to accept partial updates and return the merged record.
- **Profile edits:** LWW with a human-in-the-loop fallback. If the server has a newer `updatedAt`, surface "Server has a newer version of your profile. Your local changes are saved. Overwrite server?" — but only for conflicting fields.

The key insight from 2026 best practice: "pick per field, not per app" ([back4app.com — offline-first data sync](https://www.back4app.com/glossary/offline-first-data-sync/)). Not every entity needs CRDTs; most need only LWW, and the high-stakes ones need server authority.

### 7.4 Network State Provider

**Goal:** A single React Context that every screen can consume for connectivity state, replacing the per-screen `useConnectivity` calls.

**Implementation:** A `NetworkProvider` that wraps the app and exposes `{ isConnected, isInternetReachable, connectionType, connectionQuality }` via Context. This avoids N NetInfo subscriptions (each `useConnectivity` call creates its own listener — `useConnectivity.ts:40`). The provider subscribes once and shares the state. This is the pattern recommended by every 2026 React Native offline guide ([sadamkhan.spiralsync.com — build offline-first RN app](https://sadamkhan.spiralsync.com/blog/tutorials/build-offline-first-react-native-app), [oneuptime.com — RN offline architecture](https://oneuptime.com/blog/post/2026-01-15-react-native-offline-architecture/view)).

### 7.5 Optimistic Update System

**Goal:** A shared abstraction for optimistic-then-rollback that replaces the scattered per-screen implementations.

**Implementation:** A `useOptimisticMutation` hook (or a set of React Query `onMutate`/`onError`/`onSettled` handlers) that:
1. Captures the previous state snapshot on `onMutate`.
2. Applies the optimistic update to the cache.
3. On `onError`, rolls back to the captured snapshot and surfaces the error.
4. On `onSettled`, invalidates the query to reconcile with server truth.
5. Tracks a per-mutation `pending` state for UI feedback.

This replaces the manual optimistic patterns in `InventoryManagementScreen.tsx:192-212`, `ManageCollectionItemsScreen.tsx:80-112`, `SaveToCollectionModal.tsx:65-82`, etc. The pattern is well-documented in React Query's optimistic updates guide and in the 2026 production patterns literature ([matheuspalma.com — optimistic UI reconciliation](https://matheuspalma.com/blog/optimistic-ui-server-reconciliation-patterns)).

### 7.6 Retry Queue (generalised)

**Goal:** Extend the `MediaUploadQueue` pattern to all mutation types.

**Implementation:** The existing `useOfflineQueue` store (`offlineQueue.ts`) is already the right shape — it has dedup, backoff, dead-letter, and persistence. What it needs is:
1. **A flush trigger** (the NetInfo reconnect listener from micro-improvement #1).
2. **A per-mutation-type retry policy** — not everything should retry 8 times. A wishlist toggle can retry aggressively; a bid should retry at most 2 times and then surface to the user.
3. **Jitter** in the backoff (micro-improvement #3).
4. **A persisted `retryCount` and `nextAttemptAt`** so the backoff schedule survives app restarts. The current `QueuedRequest` interface (`offlineQueue.ts:25-33`) has `retryCount` and `lastAttemptAt` but these are in the persisted store, so this is already correct — the schedule survives restarts. The gap is only the missing flush trigger.
5. **Integration with the sync engine** so the queue drains as part of the sync cycle, not as a separate ad-hoc process.

The 2026 consensus on retry queues is clear: "if the OS can kill the process between attempts, the backoff deadline must be a durable field, not a timer handle" ([storyie.com — exponential backoff survives app restarts](https://storyie.com/blog/exponential-backoff-survives-app-restarts)). ThryftVerse's queue already does this correctly — it just needs the drain to be wired.

---

## 8. Flagship Acceptance Criteria

A flagship-grade offline resilience implementation must satisfy all of the following:

| # | Criterion | Verification |
|---|---|---|
| AC-1 | **Offline browsing of cached content** — all major surfaces (Home, Explore, Item Detail, Auction Detail, Co-Own, Profile, Collections, Chat) render from local cache when offline | Airplane mode → navigate to each surface → content renders from cache, offline banner visible |
| AC-2 | **Optimistic updates with rollback** — every write mutation (wishlist, collection, bid, message, listing edit, profile update) applies optimistically, rolls back on failure, and reconciles on success | Tap "Add to wishlist" offline → heart fills → reconnect → heart stays filled (synced) or empties with explanation (server rejected) |
| AC-3 | **Automatic retry queue** — failed/queued mutations are replayed automatically on reconnection with exponential backoff + jitter, without user intervention | Queue a write offline → reconnect → write is submitted within 5s → no user action required |
| AC-4 | **Graceful degradation** — every screen degrades to less functionality, not no functionality, when offline | Offline on Item Detail → can view images, price, seller, description; cannot place bid (button disabled with "Reconnect to bid") |
| AC-5 | **Seamless reconnection** — on network restoration, the app silently syncs, updates UI to confirmed state, and dismisses offline indicators | Offline → reconnect → offline banner disappears, pending badges clear, fresh data renders |
| AC-6 | **No data loss** — no user action is ever silently lost; every write is either confirmed by the server or durably queued for replay | Kill app mid-write → reopen → queued write is still in queue → reconnect → write is submitted |
| AC-7 | **Conflict resolution transparency** — when server and local state diverge, the user is informed, not silently overwritten | Edit profile on two devices → reconnect → conflict surfaced with explanation and resolution action |
| AC-8 | **Truthful pending-state UI** — queued actions are shown as "pending" or "saved offline", not as "error" or "success" | Write while offline → toast says "Saved offline — will sync automatically" (info), not "Error" (error) |
| AC-9 | **Pending-action visibility** — user can see how many actions are queued for sync | Global indicator shows "3 changes pending" when queue depth > 0 |
| AC-10 | **Cold-start cache survival** — cached content survives app kill and relaunch | Kill app → relaunch offline → cached content still renders |

---

## 9. Priority & Sequencing

### Phase 1 — Close critical gaps (1-2 days)
1. Wire NetInfo reconnect → `flushQueue` (micro #1) — **unblocks all queued writes**
2. Distinguish queued-write toasts from errors (micro #2) — **truthful UI**
3. Add jitter to retry backoff (micro #3) — **thundering-herd safety**
4. Add `OfflineQueueIndicator` banner (micro #4) — **pending visibility**

### Phase 2 — Cache persistence (3-5 days)
5. Migrate Zustand storage from AsyncStorage to MMKV (macro #1) — **30x faster local reads**
6. Add `persistQueryClient` with MMKV storage (macro #1) — **cold-start cache survival**
7. Extend `useConnectivity` with `connectionQuality` (micro #6) — **adaptive degradation**

### Phase 3 — Sync engine + conflict resolution (5-8 days)
8. Build `NetworkProvider` context (macro #4) — **single connectivity source of truth**
9. Build `SyncEngine` with pull/push cycle (macro #2) — **background orchestration**
10. Implement per-entity conflict resolution (macro #3) — **predictable reconciliation**
11. Wire `flushQueue` into the sync engine cycle (macro #6) — **unified drain**

### Phase 4 — Optimistic system + wishlist sync (3-4 days)
12. Build `useOptimisticMutation` shared hook (macro #5) — **replaces scattered patterns**
13. Add `addToWishlistOnApi` + sync wishlist to server — **fixes fabricated persistence**
14. Generalise `MediaUploadQueue` retry pattern to all mutations (macro #6) — **uniform retry**

### Phase 5 — Local database (5-8 days, can be deferred)
15. Introduce Expo SQLite + Drizzle for structured data (macro #1) — **true offline-first reads**
16. Migrate listings, messages, trade hub data to SQLite — **queryable offline store**
17. Add `useLiveQuery` for reactive local queries — **automatic UI re-render on local change**

---

## 10. Token-Level Spec Table

| Pattern | Token / Value | Source | Rationale |
|---|---|---|---|
| **Query cache TTL (staleTime)** | 5 min (listings), 15 min (sold comparables), 2 min (recommendations), 1 min (Q&A), 30s (Co-Own order book) | `useListingQueries.ts:72,87,126,107`; `useCoOwnQueries.ts:23,32,41,50` | Already tuned per data type; keep current values |
| **Query cache GC (gcTime)** | 30 min (listings), 15 min (seller trust), 10 min (recommendations) | `useListingQueries.ts:73,177,157` | Keep current; persists in-memory for 30 min after unmount |
| **Persisted query maxAge** | 24 hours | New — `persistQueryClient` config | Cache is stale after 24h; user should see fresh data on next online session |
| **Mutation retry count (React Query)** | 0 (deferred to app layer) | `queryClient.ts:26` | Correct — mutation retry needs idempotency keys and user-visible state |
| **Fetch timeout** | 15s default, 10s for token refresh | `apiClient.ts:257, 621` | 15s is the 2026 consensus for mobile; 10s for auth prevents hung-login UX |
| **Fetch retry attempts** | 3 (transient errors only) | `apiClient.ts:259` | 3 retries with backoff = max ~45s total; sufficient for transient blips |
| **Retry backoff base** | 1000ms | `apiClient.ts:261` | 1s → 2s → 4s; matches Stripe/mobile consensus |
| **Retry backoff max** | 30000ms | `apiClient.ts:263` | 30s cap prevents pathological waits |
| **Retry jitter** | **ADD**: `+ Math.random() * 1000` (Equal Jitter) | New — `computeBackoffDelay` | Prevents thundering-herd ([getstream.io — resilient distributed systems](https://getstream.io/blog/resilient-distributed-systems-mobile/)) |
| **Offline queue max size** | 100 items (FIFO eviction) | `offlineQueue.ts:11` | Prevents unbounded storage; 100 pending writes is generous |
| **Offline queue max retries** | 8 | `offlineQueue.ts:9` | 8 retries with 2s base = ~8min total backoff; then dead-letter |
| **Offline queue backoff base** | 2000ms | `offlineQueue.ts:13` | 2s → 4s → 8s → ... → 60s cap |
| **Offline queue backoff max** | 60000ms | `offlineQueue.ts:15` | 60s cap; matches `fetchWithRetry` cap |
| **Offline queue flush trigger** | **ADD**: NetInfo `isConnected` false → true | New — reconnect listener | Currently no trigger; queue never drains |
| **Offline queue flush guard** | `isInternetReachable !== false` | `offlineQueue.ts:143-144` | Already correct — don't flush on captive portal |
| **Media upload concurrency** | 2 | `mediaUploadQueue.ts:43` | 2 parallel uploads; prevents bandwidth saturation |
| **Media upload max retries** | 3 | `mediaUploadQueue.ts:44` | 3 retries for upload; then user must manually retry |
| **Conflict resolution — wishlist** | Last-write-wins (server `updatedAt`) | New — macro #3 | Low contention, single-user |
| **Conflict resolution — chat** | None (append-only, UUID keys) | New — macro #3 | Messages never conflict; server orders by timestamp |
| **Conflict resolution — bids/trades** | Server-authoritative | `BidSheet.tsx:294-299` (existing pattern) | Server is single source of truth for trade state |
| **Conflict resolution — listing edits** | Field-level merge | New — macro #3 | Different fields can be edited concurrently |
| **Conflict resolution — profile** | LWW + human-in-the-loop fallback | New — macro #3 | Surface conflict only for concurrently-edited fields |
| **Optimistic update lifecycle** | Idle → Pending → Committed → Failed → Superseded | `matheuspalma.com` ([source](https://matheuspalma.com/blog/optimistic-ui-server-reconciliation-patterns)) | 5-state machine; skipping any state is a bug |
| **Optimistic update rollback** | Capture snapshot on `onMutate`, restore on `onError` | `InventoryManagementScreen.tsx:192-212` (existing pattern) | Already implemented in ~10 screens; needs shared abstraction |
| **Idempotency key scope** | Per user-intent (one per button tap, not per HTTP request) | `TradeConfirmScreen.tsx:63-69`; [getstream.io](https://getstream.io/blog/resilient-distributed-systems-mobile/) | Reused across retries; prevents duplicate orders |
| **Offline banner — commerce detail** | Warning-tinted, `cloud-offline-outline` 14pt icon, "Showing cached data · last synced X" | `CommerceDetailOfflineBanner.tsx:26-60` | Already canonical; extend to all surfaces |
| **Offline banner — full screen** | `FlagshipState` variant `offline`, `cloud-offline-outline` hero icon, "Check your connection and try again" | `FlagshipState.tsx:39,47,55` | Already canonical; use for surfaces with no cached data |
| **Pending badge** | "N changes pending" — `selectPendingCount` from offline queue | `offlineQueue.ts:244` (selector exists) | New component; place in tab bar or transient banner |
| **Reconnection toast** | "Back online — syncing your changes" (info, auto-dismiss 3s) | New | Silent sync + brief confirmation; no user action required |
| **Queued-write toast** | "Saved offline — will sync automatically" (info, not error) | New — micro #2 | Truthful UI: queued ≠ failed |
| **Sync retry banner** | Message + "Retry" button + telemetry | `SyncRetryBanner.tsx:23-81` | Already canonical; use for sync errors that need user action |
| **Connection quality tiers** | `good` / `poor` / `offline` | New — micro #6 | `poor` → reduce image quality, throttle sync; `offline` → pause sync |
| **Sync engine pull interval** | On foreground + on reconnect (event-driven, not polled) | `useConversationMessages.ts:156-179` (existing pattern for chat) | Event-driven is correct; polling drains battery |
| **Local database** | MMKV (key-value) + Expo SQLite/Drizzle (structured) | [reactnativerelay.com](https://reactnativerelay.com/article/building-offline-first-react-native-apps-2026-expo-sqlite-drizzle-orm-sync-strategies) | MMKV for speed; SQLite for queryable offline data |
| **Zustand storage backend** | MMKV (replace AsyncStorage) | New — macro #1 | 30x faster synchronous reads; no API change via `persist` |
| **Background sync (iOS)** | `BGAppRefreshTask` (best-effort, OS-scheduled) | [72technologies.com — RN background tasks 2026](https://www.72technologies.com/blog/react-native-background-tasks-ios-android-2026-2) | iOS limits background execution; foreground sync is primary |
| **Background sync (Android)** | `WorkManager` periodic (15-30 min) | [oneuptime.com — RN background sync](https://oneuptime.com/blog/post/2026-01-15-react-native-background-sync/view) | Android allows reliable periodic sync via WorkManager |

---

## References

### Web sources (2026)
1. [uxpatternsguide.com — web.dev Offline UX design guidelines](https://uxpatternsguide.com/sources/webdev-offline-ux-design-guidelines/) — Offline mobile retry + offline state patterns
2. [meetmushfiq.com — Offline-first mobile UX for field operators](https://meetmushfiq.com/blog/offline-first-mobile-ux-field-operators) — The three status indicators that matter; local-as-truth mental model
3. [codeyourreality.com — Building Offline-First Mobile Apps](https://www.codeyourreality.com/blog/building-offline-first-apps) — Local database selection, sync strategies, conflict resolution (May 2026)
4. [burncode.org — Offline-First Mobile Apps: The Architecture Patterns](https://burncode.org/blog/offline-first-mobile-architecture) — Four patterns: read-through cache, optimistic mutations, conflict resolution, sync watermarks
5. [developer.android.com — Build an offline-first app](https://developer.android.com/topic/architecture/data-layer/offline-first) — Data layer design, two data sources per repository
6. [reactnative.live — React Native Offline-First Guide](https://reactnative.live/react-native-offline-first-guide-storage-sync-conflict-handling-and-ux-patterns) — Storage, sync queues, conflict handling, UX patterns
7. [oneuptime.com — How to Implement Offline-First Architecture in React Native](https://oneuptime.com/blog/post/2026-01-15-react-native-offline-architecture/view) — NetInfo, NetworkContext, connection quality
8. [ajmani.dev — Mastering React Native Offline First Sync Strategy](https://ajmani.dev/react-native-offline-first-sync-strategy/) — Sync engine, dirty records, conflict resolver, optimistic updates
9. [reactnativerelay.com — Offline-First RN: SQLite + Drizzle 2026](https://reactnativerelay.com/article/building-offline-first-react-native-apps-2026-expo-sqlite-drizzle-orm-sync-strategies) — Expo SQLite, Drizzle ORM, `useLiveQuery`, sync engine design
10. [sadamkhan.spiralsync.com — Build an Offline-First React Native App](https://sadamkhan.spiralsync.com/blog/tutorials/build-offline-first-react-native-app) — MMKV, NetInfo context, persistent operation queue, LWW/merge conflict resolution
11. [thebeyondhorizon.com — Building Offline-First Mobile Apps with React Native](https://www.thebeyondhorizon.com/blog/building-offline-first-mobile-apps-react-native) — WatermelonDB, pull/push sync, reactive lazy-loading
12. [blog.duolingo.com — Frontend Prediction in Mobile Apps](https://blog.duolingo.com/frontend-prediction/) — Optimistic updates tradeoffs, state synchronization, conflict resolution, rollback
13. [toetech.hashnode.dev — Optimistic UI & Offline Payment States in Flutter](https://toetech.hashnode.dev/optimistic-ui-offline-payment-states-in-flutter-handling-backend-rail-failures-on-the-client) — Optimistic-first mental model, `isOptimistic` flag, atomic rollback
14. [github.com/Livsy90 — iOS optimistic-updates reference](https://github.com/Livsy90/iOS-Performance-Agent-Skills/blob/main/ios-perceived-performance/references/optimistic-updates.md) — Pending/syncing/failed/retry/rollback/queued state models, set-style vs toggle-style mutations
15. [matheuspalma.com — Optimistic UI with server reconciliation](https://matheuspalma.com/blog/optimistic-ui-server-reconciliation-patterns) — 5-state lifecycle (Idle/Pending/Committed/Failed/Superseded), merge rules
16. [137foundry.com — How to Implement Optimistic UI Updates That Roll Back Cleanly](https://137foundry.com/articles/how-to-implement-optimistic-ui-updates-that-roll-back-cleanly) — Hard rejection vs soft conflict, rollback path before happy path
17. [protective-computing.github.io — Degraded-Mode UX Patterns](https://protective-computing.github.io/docs/degraded-mode-ux-patterns.html) — Graceful degradation, critical path testing under 2G/airplane/intermittent
18. [adhdecode.com — Graceful Degradation UX Patterns](https://adhdecode.com/reliability-engineering/resilience-patterns-and-graceful-degradation/graceful-degradation-ux-patterns/) — Progressive enhancement flip, showing the right less
19. [getstream.io — Mobile App Stability](https://getstream.io/blog/mobile-app-stability/) — Real-time failure surfaces, session resumption, backpressure, multi-device sync
20. [developer.android.com — Connectivity for billions](https://developer.android.com/docs/quality-guidelines/build-for-billions/connectivity) — Offline state, queuing requests, "don't notify unless essential"
21. [web.dev — Offline UX design guidelines](https://web.dev/articles/offline-ux-design-guidelines) — Connection failure factors, success/failure definitions
22. [mvpfactory.io — Designing Idempotent APIs for Mobile Clients](https://mvpfactory.io/blog/designing-idempotent-apis-for-mobile-clients-retry-logic-idempotency-keys-and/) — Idempotency keys, exponential backoff + jitter, retry strategy comparison
23. [storyie.com — Designing an Offline Mutation Queue on SQLite](https://storyie.com/blog/designing-offline-mutation-queue-sqlite) — Durable status state machine, retry schedule as data
24. [storyie.com — Exponential Backoff That Survives App Restarts](https://storyie.com/blog/exponential-backoff-survives-app-restarts) — Persist `retryCount`/`nextRetryAt`, ready work is a query
25. [getstream.io — Designing Resilient Distributed Systems for Mobile](https://getstream.io/blog/resilient-distributed-systems-mobile/) — Full Jitter, retry amplification, idempotency key persistence
26. [techinterview.org — Design an Offline-First Mobile App: Sync, Conflicts, and CRDTs](https://www.techinterview.org/post/3233474986/design-offline-first-mobile-app/) — LWW with HLC, CRDTs, multi-device convergence
27. [dev.to — Offline-First Flutter: Syncing Local and Remote Data](https://dev.to/bimal-py/offline-first-flutter-syncing-local-and-remote-data-reliably-4fdh) — Outbox pattern, LWW vs merge, client-generated UUIDs
28. [mvpfactory.io — CRDTs for mobile sync: Automerge vs Yjs vs cr-sqlite](https://mvpfactory.io/blog/crdts-for-offline-first-mobile-sync-automerge-vs-yjs-merge-semantics-and-the/) — CRDT comparison, eliminating conflict dialogs
29. [back4app.com — Offline-First Data Sync (August 2026)](https://www.back4app.com/glossary/offline-first-data-sync/) — Local store as buffer vs replica, conflict resolution per field
30. [derkonline.com — Design Offline-First Mobile Sync That Survives Bad Networks](https://derkonline.com/blog/offline-first-mobile-sync-conflicts) — Silent data loss as worst failure, queued mutations, idempotency
31. [instagram-engineering.com — Improving performance with background data prefetching](https://instagram-engineering.com/improving-performance-with-background-data-prefetching-b191acb39898) — Response store, disk-as-network, Offline Mode experience
32. [pinterestlabs.com — Scaling Deep Social Feeds at Pinterest](https://www.pinterestlabs.com/media/yuhnu1jv/scaling-deep.pdf) — HBase feed storage, async fan-out, frontend never does heavy lifting
33. [sujeet.pro — Design Instagram: Photo Sharing at Scale](https://sujeet.pro/articles/design-instagram-photo-sharing) — Stories TTL, aggressive prefetch, MQTT session resumption
34. [devblogs.co — Making instagram.com faster: Part 3 — cache first](https://devblogs.co/posts/making-instagramcom-faster-part-3-cache-first) — Redux store to IndexedDB, stagingAction/stagingCommit rebase
35. [ebayinc.com — Exploring Progressive Web Apps to Enhance eBay's Mobile Experience](https://www.ebayinc.com/stories/news/exploring-progressive-web-apps-to-enhance-ebays-mobile-experience/) — Service worker for offline marketplace, inclusion for developing countries
36. [needlecode.com — Offline Data Sync in React Native Apps: A 2026 Architectural Guide](https://needlecode.com/blog/mobile-app/offline-data-sync-react-native-architectural-guide.html) — WatermelonDB sync engine, delta updates, change tracking
37. [oneuptime.com — How to Implement Background Sync in React Native](https://oneuptime.com/blog/post/2026-01-15-react-native-background-sync/view) — iOS BGAppRefreshTask, Android WorkManager, background sync flow
38. [72technologies.com — React Native Background Tasks in 2026: iOS vs Android Reality](https://www.72technologies.com/blog/react-native-background-tasks-ios-android-2026-2) — iOS background execution limits, what works and what doesn't
39. [medium.com — Why Fetch-on-Open Fails on Mobile](https://medium.com/@anshulkahar2211/why-fetch-on-open-fails-on-mobile-and-how-to-build-reliable-state-sync-in-react-native-6b89428fb355) — AppState foreground refetch failure modes, reliable state sync

### Codebase sources
- `frontend/src/hooks/useConnectivity.ts:23-48` — NetInfo hook
- `frontend/src/lib/offlineQueue.ts:73-244` — Offline write queue (Zustand + AsyncStorage)
- `frontend/src/lib/apiClient.ts:283-322, 369-448, 727-745, 776-791, 842-859` — Network error classification, timeout/retry, offline enqueue, queued request builder
- `frontend/src/platform/server/queryClient.ts:17-29` — React Query defaults (staleTime, gcTime, retry)
- `frontend/src/platform/server/useMobileQueryLifecycle.ts:6-32` — NetInfo → onlineManager, AppState → focusManager
- `frontend/src/platform/product/useListingQueries.ts:51-201` — Listing query hooks with per-type staleTime/gcTime
- `frontend/src/platform/server/useCoOwnQueries.ts:1-60` — Co-Own queries with staleTime tuning
- `frontend/src/services/mediaUploadQueue.ts:46-399` — Media upload retry queue
- `frontend/src/hooks/chat/useConversationMessages.ts:140-538` — Chat optimistic send, retry, reconnect sync, AppState foreground sync
- `frontend/src/components/commerce/detail/CommerceDetailOfflineBanner.tsx:26-60` — Commerce offline banner
- `frontend/src/components/coown/CoOwnOfflineBanner.tsx:24-49` — Co-Own offline banner
- `frontend/src/components/flagship/FlagshipState.tsx:23-183` — Canonical state component (loading/empty/error/offline/unavailable)
- `frontend/src/components/coown/CoOwnStateCanvas.tsx:9-136` — Co-Own state canvas (offline/stale/halted/restricted/thin)
- `frontend/src/components/SyncRetryBanner.tsx:23-81` — Sync retry banner with telemetry
- `frontend/src/components/RetryState.tsx:15-42` — Full-screen retry state
- `frontend/src/screens/InventoryManagementScreen.tsx:186-213` — Optimistic toggle with rollback
- `frontend/src/screens/TradeConfirmScreen.tsx:63-176` — Idempotency key per order attempt, network error handling
- `frontend/src/platform/product/useProductSocialState.ts:54-64` — Local-only wishlist (fabricated persistence)
- `frontend/src/store/useStore.ts:549-551` — Zustand persist with AsyncStorage
- `AGENTS.md:196, 206, 227, 446-475, 516-534` — Truthful UI, state completeness, full state coverage
- `Design.md:913, 926, 937, 1664` — State design, no raw errors, perceived performance, offline state checklist
