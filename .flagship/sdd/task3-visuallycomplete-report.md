# Task 3 — F02: Mount recorded as visual completion

## Status: DONE

`tsc --noEmit -p tsconfig.json` — **0 errors** (whole project, and specifically zero
hits for `visuallyComplete|useReadiness|useVisuallyComplete` and every touched consumer file).

## What was wrong

`useVisuallyComplete` and `useReadiness` both called `markVisuallyComplete(surface)` inside a
mount `useEffect`. Every instrumented surface reported "visually complete" at mount —
before data loaded, media decoded, or controls became interactive. Milestones were keyed by
bare surface name in module-level Maps, so repeat visits reused stale timing.

## How visit-scoped milestones work now

`frontend/src/performance/visuallyComplete.ts` was rewritten around a visit model:

- `beginVisit(surface)` → returns a unique visit ID (`v1`, `v2`, …), records a
  `VisitRecord { id, surface, startedAt, ended }` in a `visits` map, and makes it the
  surface's current visit (`currentVisits: Map<surface, visitId>`).
- `endVisit(surface, visitId?)` → marks the visit ended and clears the surface's current
  pointer. Visit data is retained for telemetry until pruned (FIFO cap, 200 visits).
- Storage keys are per-visit: `milestones`/`marks` are keyed by `` `${surface}#${visitId}` ``.
  `resolveKey()` falls back to the surface's current visit, then to a legacy bare-surface
  bucket, so `markVisuallyComplete(surface)` without a visit ID still works.
- `marks` also mirrors the latest completion under the bare surface name for any legacy
  surface-level readers.

### Visit lifecycle in hooks

- `useVisitRef(surface)` (internal) / `useVisitId(surface)` (public): a visit is begun
  eagerly on first render so `useVisitId` always returns a valid string; a
  `useFocusEffect` then owns the lifecycle — on each route focus it begins a new visit if
  the ref's visit ended or is no longer current, and the effect cleanup ends the visit on
  blur/unmount. Navigating away and back therefore starts fresh timing. No state, no
  re-renders.
- `useReadiness(surface, { required? })`: on focus it applies the surface's required set
  (via a ref-mirror so inline arrays don't destabilize the effect) and marks `mounted`
  against the visit. Returns a stable `report(milestone)` callback that always targets this
  hook instance's own visit ID.
- `useVisuallyComplete(surface, options?)` is now a thin alias over `useReadiness` —
  it marks `mounted`, returns the `report` callback, and **never auto-completes**.
  The return-type change (`void` → callback) is backward compatible.

### Completion gating

- `ReadinessMilestone` extended with `'visually-complete'`; `MILESTONE_ORDER` appended.
- `DEFAULT_REQUIRED_MILESTONES = ['data-ready', 'interaction-ready']`. `first-media` is
  deliberately not required by default — media-free or video-first feeds may never decode
  an image, and gating on an unproducible milestone would leave a surface permanently
  incomplete. Per-surface override via `setRequiredMilestones(surface, [...])` or
  `useReadiness(surface, { required })`.
- `markMilestone` is first-write-wins per visit; after each milestone it auto-derives
  `visually-complete` when every required milestone is present.
- `markVisuallyComplete(surface, visitId?)` is gated: if required milestones are missing it
  is a no-op (dev `console.warn` listing the missing set). `report('visually-complete')`
  delegates to the same gated path.
- `getMilestone`/`isReady` gained an optional `visitId` param; `getCompletionTime` added;
  `resetMilestones(surface, visitId?)` clears the current visit's data (plus legacy buckets).

## Consumers updated

| File | Change |
|---|---|
| `src/screens/HomeScreen.tsx` | `useVisuallyComplete('Home')` → `reportReady`. New effect reports `data-ready` + `interaction-ready` when feed data resolves (listings/for-you items, an error, or a sync that actually began then settled — a `feedSyncBeganRef` guards the `isSyncing`-starts-false window). |
| `src/screens/ItemDetailScreen.tsx` | `reportReady` effect: `data-ready` when `!data.isLoading` (query settled — success/error/not-found are all terminal), `interaction-ready` once `item` renders. |
| `src/screens/UserProfileScreen.tsx` | `reportReady` effect: `data-ready` + `interaction-ready` when `publicProfileQuery.isLoading` clears (disabled query ⇒ nothing to load ⇒ immediate, which is accurate). |
| `src/screens/InboxScreen.tsx` | `reportReady` effect: fires when `isLoading` flips false in `loadConversations`' `finally` (covers success + error). |
| `src/screens/ChatScreen.tsx` | `reportReady` effect: `data-ready` + `interaction-ready` when messages exist, a sync error occurs, or the first sync that began settles (`chatSyncBeganRef` guards the pre-sync `isSyncing === false` window). |
| `src/screens/LookDetailScreen.tsx` | `reportReady` effect on `!isLoading` (fetch `finally`) + `interaction-ready` when `look` present; `first-media` wired via new `onFirstMediaLoad` on `LookMediaCarousel`. |
| `src/components/look/LookMediaCarousel.tsx` | Added optional `onFirstMediaLoad` prop → forwarded to page 0 only: `MediaPage` fires it from the existing `ExpoImage.onLoad`; `VideoPage` fires it on `readyToPlay`. Additive prop, no visual change. |
| `src/components/explore/LooksTab.tsx` | `LookTile` gained optional `onMediaLoad` → `ExpoImage.onLoad`; `renderItem` passes it for `index === 0` → `reportReady('first-media')`. `data-ready`/`interaction-ready` reports were already correct. |
| `src/scenes/discovery/DiscoverScene.tsx` | No change needed — already reports `data-ready` (supplemental fetch settles) and `interaction-ready` (units rendered). Now actually drives completion under the gated model. |

## Verification

- `tsc --noEmit -p tsconfig.json`: **clean, 0 errors** (full project output empty).
- `*visual*` test files in `src/__tests__/`: `nativeVisualAcceptance.test.ts`,
  `productDetailFlagshipVisualAcceptance.test.ts`, `themeMigrationVisualIntegrity.test.ts`,
  `visualRegressionPlan.test.ts`, `visual-baseline-manifest.json` — all source-assertion /
  plan tests; none render these screens, so the new `useFocusEffect` dependency is safe.
- No layout/visual changes; only additive optional props (`onFirstMediaLoad`, `onMediaLoad`)
  and telemetry effects.

## Concerns

- `useFocusEffect` requires a navigation context — all current consumers are screens or
  screen children inside navigators, and no test renders them outside a
  `NavigationContainer`. A future consumer outside a navigator would throw; that surface
  should use `beginVisit`/`endVisit` imperatively instead.
- `first-media` is reported opportunistically (LooksTab tile 0, LookDetail hero page 0) but
  is not in the default required set — Home/Discover/Inbox/Chat/ItemDetail/UserProfile do not
  report it (no decode hook without invasive plumbing through `PinterestMasonryGrid` /
  `CommerceMediaStage`). They still record real `data-ready`/`interaction-ready` timing.
- Eager `beginVisit` during first render is a render-phase side effect; it's guarded
  (first render only) and self-corrects via the focus effect, including StrictMode
  double-mounts. Worst case under a discarded concurrent render is a superseded visit
  record — cosmetic only.
- A surface that never reports its required milestones now simply never completes — that is
  the intended honest telemetry (incomplete beats falsely instant).
