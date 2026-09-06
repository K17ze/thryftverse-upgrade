# Task 2C Report — Real video poster frames in the listing flow

Date: 2026-02-15 · Branch: `feat/product-detail-contract-media-device-closure` · HEAD: `03153b23`

## Status: DONE_WITH_CONCERNS

## Scope delivered

- **NEW `frontend/src/platform/media/videoPoster.ts`** (128 lines)
  - `getVideoPoster(uri, timeMs?): Promise<VideoThumbnail | null>` — generates a real frame via
    `createVideoPlayer({ uri })` + `player.generateThumbnailsAsync(timeSec, { maxWidth: 320 })`,
    takes `[0]`, caches, returns. Never throws: any failure (web, corrupted file, unsupported
    codec, empty result) resolves `null` and is negative-cached so remounts don't re-spawn a
    native player.
  - Module-level `Map<string, VideoThumbnail>` cache keyed `"<seconds>|<uri>"` (uri + time),
    FIFO-capped at 32 entries (each entry holds a native image ref). Concurrent generations for
    the same key are coalesced through an in-flight promise map.
  - Player lifecycle: `createVideoPlayer` returns a direct instance that is **not** auto-released
    (unlike `useVideoPlayer`) — `player.release()` (from `SharedObject`, expo-modules-core
    `ts-declarations/SharedObject.d.ts:18`) is called in a `finally` after the frame is out.
    The `VideoThumbnail` refs are intentionally *not* released; the cache holds them for
    expo-image to render.
  - Web guard: `Platform.OS === 'web'` → `null` immediately (no native module touch).
  - `useVideoPoster(uri, timeMs?)` hook: sync-hydrates from cache in the `useState` initializer
    (no fallback flash on remount/reorder), ignores stale responses via a cancelled flag on
    unmount/URI change.
- **`frontend/src/components/listing/ListingMediaStudio.tsx`**
  - New `VideoPosterThumb` (memoized; rendered per item inside `SortablePhotoStrip`'s
    `SortableItem`, keyed by item id): video thumbs now render the real poster frame via
    expo-image with a compact 22pt scrim-circle play glyph (`Ionicons play`, `colors.overlay`,
    same grammar as the existing `thumbVideoBadge`), centered on the frame. Glyph is
    `aria-hidden` (decorative); no new animation; the strip's existing accessibility label
    (`Media item N of M, … video`) is untouched.
  - Fallback when poster is `null` (generating, web, failed): the previous videocam tile,
    pixel-identical to the old render (tile + top-right badge moved inside the component).
  - The old inline `<View thumbVideoTile>` branch and the standalone top-right videocam badge
    block were replaced by the component (one video indicator on poster state — restraint).
  - Net size: +44 lines (1114 → 1158), dominated by the documented component; the heavy path
    (N live players for N thumbs → 0 players, 1 native decode per video) is the point of the task.

## Verified API claims (against installed node_modules)

- `createVideoPlayer` exported from `expo-video/build/index.d.ts:6`; `VideoThumbnail` type at :5.
- `generateThumbnailsAsync(times: number | number[], options?: VideoThumbnailOptions):
  Promise<VideoThumbnail[]>` — `VideoPlayer.types.d.ts:269`. NATIVE ONLY (android/ios) — no web
  implementation in the package.
- `VideoThumbnailOptions` = `{ maxWidth?: number; maxHeight?: number }` — **no `quality` field**
  (brief's sketch said `quality?`; the installed ~57.0.2 typings have `maxHeight` instead). Used
  `maxWidth: 320`.
- `VideoThumbnail extends SharedRef<'image'>` (`VideoThumbnail.d.ts:8`) with
  width/height/requestedTime/actualTime. expo-image `ImageProps.source` accepts
  `SharedRefType<'image'>` (`expo-image/build/Image.types.d.ts:113`; `SharedRefType` is an alias
  of expo-modules-core `SharedRef`) — **VideoThumbnail-as-source compiles clean under
  `tsc --noEmit`**, confirmed by the passing typecheck with `source={poster}`.
- Time units: expo-video works in **seconds** (`VideoThumbnail.requestedTime` doc: "time in
  seconds"). The brief's sketch passed `timeMs` straight through; this implementation converts
  ms → s at the boundary so callers can keep thinking in ms like the rest of the media pipeline.
  Default `0` (first frame) is unaffected.

## Web behavior (fallback path)

`getVideoPoster` returns `null` immediately on web (guard before any native call);
`useVideoPoster` therefore stays `null` and `VideoPosterThumb` renders the pre-existing
videocam tile — identical to the previous thumbnail render. No web user sees a broken image or
a thrown error. (Vitest runs under `react-native-web`, so the suite exercises this same guard.)

## Cover decision (kept as-is, per brief's "do not force it")

The compat `Video` (`frontend/src/components/compat/Video.tsx`) does expose `usePoster` /
`posterSource`, but wiring the generated frame into it was rejected for two concrete reasons:

1. `posterSource` is typed `{ uri: string } | number` (Video.tsx:35) — a `VideoThumbnail`
   (SharedRef) does not fit without an unsafe cast.
2. More importantly, the shim's poster overlay **never unmounts**: it renders whenever
   `usePoster && !!posterSource` with no ready-to-play state to hide it (Video.tsx:257-279), so
   passing a poster would permanently occlude cover playback — violating the "cover keeps
   playback" requirement. Left as-is; noted here rather than forcing it.

## Focal-point note

`FocalImage` takes `uri: string` and calls `ExpoImage.loadAsync(uri)` — a SharedRef source is
incompatible with that path, so video posters render expo-image directly (the brief's sanctioned
fallback). This is lossless in practice: focal points are set through the crop sheet, which is
image-only (`canEditCover` excludes videos), so video items carry no focal point today.

## Verification

- `npm run typecheck` — **clean** (0 errors).
- Scoped eslint on both touched files — **0 errors**, 38 warnings, all pre-existing classes
  (i18next literal-string on prop literals/copy, `has-accessibility-hint` on legacy Pressables,
  `max-lines` on the pre-existing monolith). The two warnings on the new component
  (`contentFit="cover"`, `pointerEvents="none"`) are the same prop-literal class already
  flagged on untouched lines (e.g. 207, 253) — file grammar, not new debt.
- `npm test` (vitest) — **7 failed | 1730 passed | 2 skipped**, exactly the stated baseline of
  7 pre-existing unrelated failures (`groupChatInfoParity.test.tsx` source-string assertions ×6,
  `pricingDisplayModes.test.ts` snapshot ×1). No test touches ListingMediaStudio or videoPoster.

## Concerns

1. **Untested on device.** `generateThumbnailsAsync` is native-only; CI/test env exercises only
   the web guard. First real-device run should confirm frame decode for the app's video sources
   (local `file://`/`content://` and remote `publicUrl`) and that the SharedRef renders in
   expo-image on Android/iOS. The failure path degrades to the old tile, so risk is visual, not
   functional.
2. **`quality` option doesn't exist** in the installed typings (used `maxWidth: 320` instead) —
   brief's "verified API" section was slightly off; flagged above.
3. **Cover poster intentionally not wired** — the compat shim would need a `posterSource`
   widening (accept SharedRef) *and* a ready-driven unmount before a poster can be shown without
   occluding playback. Out of scope here (compat/Video is not mine to touch).
4. **Cache holds native image refs** (≤32 × ~320px frames). Bounded and small, but if the app
   later wants strict memory discipline, an LRU with `release()` on evict is the upgrade path.
