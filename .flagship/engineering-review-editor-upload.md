# Editor & Upload — Engineering Review

**Reviewer perspective:** Staff mobile engineer, 20 years full-stack, FAANG-level architecture.
**Date:** 2026-01-24
**Scope:** `CreatorCropSheet`, `ListingMediaStudio`, `SortablePhotoStrip`, `UploadProgressRing`, `MediaUploadQueue`, `xhrUploadTransport`, `listingPublication`, `useListingPublishPipeline`, `ListingPublishFooter`.

This is not a feature list. This is what I see when I read the code.

---

## The structural problem

The department has two personalities and they don't talk to each other.

**Personality A** lives in `frontend/src/creator/` — the poster/look composer. It has a full creative tool suite: `AdjustPanel` (8 color parameters), 14 LUT filter presets, `DrawingWorkspace`, `InlineTextEditor`, `StickerBrowserSheet`, `AIEffectBrowserSheet`, a timeline video editor with trim/split/speed/reverse/freeze-frame/audio-fade. This is genuinely deep work. The adjust math is matrix-based. The LUT system is real color grading. The drawing workspace runs on a proper stroke model.

**Personality B** lives in `frontend/src/components/listing/` — the listing upload flow. It has `ListingMediaStudio` (a 632-line component), `SortablePhotoStrip`, `UploadProgressRing`, and the crop sheet. It does crop, rotate, flip, straighten, focal point, and upload. This is also real work — the crop math is correct, the upload queue is durable, the state machine is honest.

The problem: **Personality B doesn't know Personality A exists.** A seller uploading a listing photo has access to crop, rotate, flip, straighten, and focal point. A creator making a poster has access to all of that plus 8 adjustment sliders, 14 filter presets, drawing, text, stickers, AI effects, and a video timeline. Same app. Same media. Different planet.

This is not a feature gap. This is an **architecture decision that hasn't been made yet.** The creative tools were built for the composer surface and never extracted as shared primitives. A senior engineer would have built `AdjustPanel` as a shared media tool from day one, not as a creator-only component. The fact that `AdjustPanel` lives in `creator/tools/effects/` instead of `components/media/tools/` is the tell — it was scoped to the creator feature, not designed as a platform primitive.

**The fix is not building new features. The fix is moving the seam.** The adjustment panel, filter presets, and crop sheet should live in a shared media-editing layer that both the composer and the listing flow consume. This is a refactor, not a build.

---

## What's actually good

Before I tear it apart, let me be precise about what's working, because this is not all bad code.

### The upload queue is honest engineering

`MediaUploadQueue` is the strongest piece of engineering in this department. It's a real state machine, not a fake one:

- 6 states (`pending → preparing → uploading → uploaded → failed → cancelled`) with correct transitions
- Durable persistence via AsyncStorage with debounced snapshots (250ms) — not every byte tick
- Progress throttle at ~10/s per item — prevents render storms without freezing the UI
- AbortController-based cancellation that actually aborts the XHR, not just a flag
- Network-aware pause/resume via NetInfo with a generation counter to discard stale subscriptions
- In-flight items restored as `pending` on app restart (safe re-upload, not fake resume)
- Concurrency control (max 2) with a slot resolver pattern that's correctly FIFO
- Retry budget (max 3) with per-item and bulk retry paths
- The snapshot stores metadata only, never byte offsets or payloads

This is better than what most marketplace apps ship. Instagram's resumable upload API is server-side byte-offset resume, which we don't have, but that's a backend capability gap, not a client engineering gap. The client queue is correct.

### The crop math is correct

`largestInscribedRect` is the right formula. The inscribed-rect problem for a rotated crop is: find the largest axis-aligned rectangle of aspect `a` that fits inside a `W×H` rectangle rotated by `θ`. The solution `y ≤ W/(2·(a·cosθ + sinθ))` and `y ≤ H/(2·(a·sinθ + cosθ))` is mathematically correct. I checked it.

`mapFocalToOutput` chains flip → straighten-rotate → crop → rotate-90°k and re-normalizes the focal point through each transform. This is the right approach — the focal point lives in source space and gets mapped to output space on confirm. The math is correct for each step. The clamping to `[0,1]` at the end is the right call (a focal outside the cropped region lands on the edge, not at infinity).

### The XHR transport is correct

`xhrPutFile` does the right thing: native `send({ uri })` streams from disk with no JS-memory copy, `xhr.upload.onprogress` reports real bytes, AbortSignal hard-cancels, timeout prevents hung requests. The `settled` flag prevents double-resolve. The `cleanup` removes the abort listener and progress handler. This is clean.

### The publication pipeline is idempotent

`executePublication` reserves a client-generated listing ID before the first create attempt, so retries reuse the same ID. The backend upserts by ID. Media is uploaded before the listing row is created, so a media failure never leaves an orphan listing. The recovery context (`uploadedMediaByAssetId`, `attachedAssetIds`) is threaded through retries so only missing work is redone. This is correct recoverable publication design.

---

## What's not good — the engineering tells

### 1. `ListingMediaStudio` is a 632-line component doing four jobs

This component:
- Renders the empty state (lines 271-301)
- Renders the cover image with video/photo branching (lines 363-418)
- Renders the thumbnail rail via `SortablePhotoStrip` (lines 421-428)
- Renders the quiet action row (lines 436-459)
- Manages crop sheet state and URI resolution (lines 195-269)
- Manages upload status transitions and haptic feedback (lines 199-215)
- Renders per-thumbnail edit/remove/progress overlays (lines 304-358)
- Defines all styles inline (lines 484-632)

A staff engineer would split this into:
- `ListingMediaStudio` (orchestrator, <100 lines) — owns state, wires children
- `MediaCover` — cover display + overlays
- `MediaThumbRail` — wraps `SortablePhotoStrip` with listing-specific overlays
- `MediaEmptyState` — the empty surface
- `MediaActionRow` — the quiet actions

The 632-line component is the AI tell: it does everything in one file because it was generated as one unit, not factored from a design. A human engineer would have factored it during the second pass.

### 2. The `themed` proxy in `SellScreen` is a code smell

Lines 165-204 of `SellScreen.tsx` define a `themed` object with 40+ color overrides that are applied to static styles. This is a workaround for not having a proper theme-aware stylesheet system. It means every new style addition requires a corresponding `themed` entry. It's brittle and it grows. A senior engineer would either use a themed `StyleSheet.create` factory (like `ListingMediaStudio` already does with `createStyles(colors, ...)`) or use a CSS-in-JS system that handles theme automatically. The `themed` proxy is the kind of thing you write at 2am and never refactor.

### 3. The grid lines that vanish

`CreatorCropSheet` line 547-553:
```ts
const gridStyle = useAnimatedStyle(() => ({
  opacity: interpolate(
    isGestureActive.value,
    [0, 1],
    [0, 0.35],
    Extrapolation.CLAMP ) }));
```

The rule-of-thirds grid is invisible at rest and fades in only during a gesture. This means the user cannot study the grid to decide their crop — it disappears the moment they lift their finger. Instagram's grid is toggleable and stays visible. This is not a feature gap, it's a **design decision that's wrong.** The grid should be visible at `0.2` opacity at rest and `0.35` during gesture. One line change.

### 4. The straighten range is artificially limited

`CreatorCropSheet` uses a slider with range -10° to +10°. The math (`largestInscribedRect`) works correctly for any angle. The limitation is in the slider config, not the math. Instagram and standard editors offer -45° to +45°. For a marketplace, -15° or -20° would be the right range — enough to fix a tilted horizon without encouraging creative rotation. -10° is too tight. A seller photographing on a table will often have 12-15° of tilt.

### 5. The `handleTransformItemWithFocal` wrapper is a leaky abstraction

`SellScreen.tsx` lines 150-160:
```ts
const handleTransformItemWithFocal = useCallback(
  (itemId: string, transformedUri: string, focalPoint?: { x: number; y: number }) => {
    handleTransformItem(itemId, transformedUri);
    if (focalPoint) {
      setMediaDraftItems((prev) =>
        prev.map((m) => (m.id === itemId ? { ...m, focalPoint } : m))
      );
    }
  },
  [handleTransformItem, setMediaDraftItems]
);
```

This wrapper exists because `useSellScreenActions` returns a `handleTransformItem` that takes two args, but `ListingMediaStudio` expects three (with focal point). Instead of fixing the actions hook to accept the focal point, the screen captures the third arg and does its own state update. This is **child-layer compensation** — the screen is working around a missing parameter in its own actions hook. The fix is to add the focal parameter to `handleTransformItem` in `useSellScreenActions` and delete this wrapper.

### 6. No aggregate upload state in the UI

`MediaUploadQueue` exposes `completedCount`, `failedCount`, and `totalCount` in `UploadQueueState`. `ListingMediaStudio` receives `queueItems` (the full item array) but never computes or displays an aggregate. The user sees per-item progress rings but no "3 of 5 uploaded" summary. Instagram shows this. The data is there. The UI doesn't use it. This is a wiring gap in our own data — the queue knows, the UI doesn't show it.

### 7. No offline state communication

`MediaUploadQueue` pauses when `internetReachable === false`. The queue stops starting new items. In-flight items fail naturally. But `ListingMediaStudio` has no idea this happened — it just sees items transition to `failed`. There's no "Uploads paused — will resume when online" state. The queue has the information (`internetReachable`), but it's not exposed in `UploadQueueState`. The UI can't show what it doesn't receive.

The fix: add `isOffline: boolean` to `UploadQueueState`, expose it from the queue, and render a compact "Waiting for connection" row in `ListingMediaStudio` when it's true.

### 8. The `getPublishLabel` dead branch

`ListingPublishFooter.tsx` line 29-38:
```ts
function getPublishLabel(mode: string, isPublishing: boolean): string {
  if (isPublishing) {
    if (mode === 'sell_now') return 'Publishing…';
    if (mode === 'co_own') return 'Sending…';
    return 'Starting…';
  }
  ...
}
```

This function is called at line 133 with `getPublishLabel(mode, false)` — the `isPublishing` branch is never reached because the `isPublishing` case is handled separately at line 120-121 with an `ActivityIndicator`. The function is always called with `false`. This is dead code that looks like it's doing something. A staff engineer would delete the `isPublishing` parameter and the dead branch.

### 9. The empty state has two competing CTAs

`ListingMediaStudio` lines 271-301 renders an empty state with "Add photos" as the primary surface and "Take photo" as a secondary button below. But `SellScreen` lines 260-269 renders a *different* empty state (`EmptyState` component) with "Upload from library" and "Take photo" as dual CTAs. These are two different empty states for the same condition (`mediaDraftItems.length === 0`). The screen-level one wins because it renders first. The `ListingMediaStudio` empty state is dead code — it's never reached when the screen handles the empty case. But it's still in the component, adding 30 lines of unreachable render path.

### 10. The `editScrim` circle on thumbnails

`ListingMediaStudio` lines 596-602:
```ts
editScrim: {
  width: 36,
  height: 36,
  borderRadius: Radius.full,
  backgroundColor: 'rgba(0,0,0,0.35)',
  ...
}
```

The edit button on thumbnails renders a 36pt dark circle behind a 28pt edit glyph. The AGENTS.md charter says "Separate hit area from visible shape" and "Visible containment must have meaning." A 36pt scrim circle behind an edit glyph is decorative chrome — it's the kind of thing that reads as "AI added a circle because it looked bare without one." The cover edit button has the same scrim. The remove buttons don't have it — they use `glyphStyle` with text shadow for contrast. The edit buttons should use the same grammar: glyph + text shadow, no circle. Consistency.

### 11. The `VideoPosterThumb` passes `styles` as a prop

`ListingMediaStudio` lines 108-137:
```ts
const VideoPosterThumb = React.memo(function VideoPosterThumb({
  uri,
  styles,
  dimmed }: {
  uri: string;
  styles: ReturnType<typeof createStyles>;
  ...
```

This component receives the parent's entire `StyleSheet` as a prop. This is a pattern I've only seen in generated code — a human engineer would either pass specific style objects or let the component create its own styles from the theme. Passing the parent's stylesheet as a prop creates tight coupling: any change to the parent's styles can break the child's render. It also means the child can't be reused outside this parent. This should be a self-contained component that calls `useAppTheme()` and creates its own styles.

### 12. The `SortablePhotoStrip` has a dead `onAddPhoto` path

`SortablePhotoStrip` lines 71-84 render an add button when `showAddButton && onAddPhoto` are truthy. But `ListingMediaStudio` passes `showAddButton={false}` (line 426). No other consumer in the codebase passes `showAddButton={true}` with an `onAddPhoto` handler. This is dead code — the add button path is never exercised in production. It was probably built for an earlier design where the strip had its own add button, then superseded by the "Add more" row in `ListingMediaStudio`. A staff engineer would delete it.

---

## What Instagram and Snapchat do better (engineering, not features)

This is not about what features they have. It's about how they engineer the same features we have.

### Instagram's crop is simpler and more confident

Instagram's crop editor does one thing: pinch the image to zoom, drag to pan, tap to toggle aspect. No straighten, no flip, no focal point, no corner handles. It's simpler than ours. But it's **more confident** — the grid is always visible, the aspect toggle is a single button (not a scrollable chip row), and the crop result is previewed live (you see what you'll get, not what you'll cut).

Our crop is more capable but less confident. We have 6 aspect chips in a scrollable row, 4 tool buttons (rotate, flip H, flip V, straighten), a straighten slider that appears conditionally, and a focal point reticle. That's 11 controls for a crop screen. Instagram has 3. Snapchat has 1 (pinch). The capability depth is real, but the **control density** reads as "someone listed every feature they could think of and put a button for each." A senior designer would group these: aspect + crop in one mode, rotate/flip/straighten in a second mode, focal in a third. Not all flat in one row.

### Snapchat's gesture model is more natural

Snapchat's pinch-to-zoom is on the **image**, not the **crop frame**. You pinch to see more or less of the photo. The crop frame stays fixed; the image moves underneath. This is the mental model most users have: "I want to see more of the photo" not "I want a smaller crop box." Our model (pinch resizes the frame) is more precise for crop control but less intuitive. Instagram uses the same model as Snapchat (pinch the image). We're the outlier.

This doesn't mean our model is wrong — it's more powerful. But it means users familiar with Instagram/Snapchat will pinch the image and nothing will happen, then have to learn our model. The onboarding cost is real.

### Instagram's upload feedback is more communicative

Instagram shows:
- Linear progress bar with percentage
- "Posting..." → "Processing..." → "Posted" stage labels
- "Couldn't post — try again" with a tappable retry
- Upload speed and ETA for large files

We show:
- Circular ring with real byte progress (per item)
- Indeterminate spinner while preparing
- Fade-out on completion
- Retry button on failure

Our per-item ring is more precise (real bytes, not a fake bar). But we don't show:
- Aggregate progress ("3 of 5")
- Stage labels ("Uploading..." → "Creating listing..." → "Attaching media...")
- Offline state ("Waiting for connection")
- Upload speed / ETA

The stage labels are particularly important. `listingPublication.ts` has 4 stages (`uploading_media`, `creating_listing`, `attaching_media`, `completed`) and `ListingPublishFooter` maps them to text. But the mapping is lossy: `uploading_media` and `creating_listing` both render as "Publishing…" (lines 42-45). The user can't tell whether their photos are uploading or their listing is being created. Instagram distinguishes these. We collapse them.

---

## What I'd do (prioritized)

These are engineering fixes, not feature additions. Each one makes the existing code better without adding surface area.

### Fix 1: Move the grid to always-visible (1 line)
Change the interpolate input from `[0, 1]` to `[0, 1]` with output `[0.2, 0.35]` instead of `[0, 0.35]`. The grid is visible at rest, slightly brighter during gesture. This is the highest-impact one-line change in the department.

### Fix 2: Expose offline state from the queue (3 changes)
Add `isOffline: boolean` to `UploadQueueState`. Set it from `internetReachable` in `getState()`. Render a compact "Waiting for connection" row in `ListingMediaStudio` when `queueState.isOffline` is true and there are pending/failed items.

### Fix 3: Surface aggregate upload progress (1 component)
Add a compact `UploadSummary` row above the thumbnail rail: "3 of 5 uploaded" with a thin progress bar. Data comes from `queueState.completedCount` / `queueState.totalCount`. Already in the state, just not rendered.

### Fix 4: Distinguish publication stages in the footer (1 function)
Change `getStageText` so `uploading_media` renders as "Uploading photos…" and `creating_listing` renders as "Creating listing…". The data is already there. The mapping is just lossy.

### Fix 5: Widen straighten range to -15° (1 prop)
Change the slider min/max from -10/+10 to -15/+15. The math handles it. The inscribed-rect formula is valid for any angle. -15° covers tilted-table product shots without encouraging creative rotation.

### Fix 6: Remove the edit scrim circles (2 style objects)
Delete `editScrim` from the stylesheet. Apply `glyphStyle={styles.mediaGlyph}` to the edit icons (same as remove icons). Consistent contrast grammar, less chrome.

### Fix 7: Factor `ListingMediaStudio` into 4 components (refactor)
Extract `MediaCover`, `MediaThumbRail`, `MediaEmptyState`, `MediaActionRow`. The orchestrator drops to ~100 lines. Each child is self-contained with its own theme access. This is the biggest change but the most important for maintainability.

### Fix 8: Fix the `handleTransformItem` leaky abstraction (1 hook change)
Add the `focalPoint` parameter to `handleTransformItem` in `useSellScreenActions`. Delete the `handleTransformItemWithFocal` wrapper in `SellScreen`. The screen should not be doing state updates that its own actions hook should handle.

### Fix 9: Delete dead code (cleanup)
- `getPublishLabel`'s `isPublishing` branch (never called with `true`)
- `SortablePhotoStrip`'s `onAddPhoto` path (never used with `showAddButton={true}`)
- `ListingMediaStudio`'s internal empty state (never reached, screen handles empty)

### Fix 10: Move the seam (architecture)
This is the long-term fix. `AdjustPanel`, filter presets, and `CreatorCropSheet` should move from `creator/tools/` to a shared `components/media/tools/` layer. The listing flow and the composer flow should consume the same media-editing primitives. This is not adding features — it's removing an artificial boundary that prevents the listing flow from using tools that already exist.

---

## Confidence

I've read every file cited above. The line numbers are accurate as of the current workspace. The math claims (`largestInscribedRect`, `mapFocalToOutput`) I verified by hand. The state machine claims I traced through every transition path. The dead code claims I grep-verified. The "two personalities" claim I verified by searching for consumers of `AdjustPanel` and `FilterEditorSheet` — they are only imported from `creator/` paths, never from `components/listing/`.

The one thing I did not do is run the app and observe the render. This is a code review, not a visual audit. The visual quality of the rendered output is a separate concern from the engineering quality of the code, and the user's complaint is about the engineering reading as AI-generated. The fixes above address the engineering tells: dead code, leaky abstractions, unfactored components, inconsistent chrome, lossy state mappings, and artificial boundaries between features that should share primitives.
