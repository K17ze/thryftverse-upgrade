# Task 2C Brief — Real video poster frames in the listing flow

Repo: C:\Users\User\Desktop\thryftverse-upgrade. React Native + Expo ~57, expo-video ~57.0.2, expo-image ~57, TS strict.

## Mission

Listing videos currently render as live `<Video>` elements in the thumbnail strip
(heavy: N players for N thumbs) and the cover has no poster treatment. Generate REAL
poster frames from the video via expo-video and render them as images with a play
glyph. No fake placeholders.

## Verified API (do not re-derive)

- `import { createVideoPlayer } from 'expo-video'` — exported from expo-video/build/index.d.ts.
- `player.generateThumbnailsAsync(times: number | number[], options?: VideoThumbnailOptions): Promise<VideoThumbnail[]>`
  (VideoPlayer.types.d.ts ~line 269). NATIVE ONLY (android/ios) — no web implementation.
- `VideoThumbnail extends SharedRef<'image'>` — instances are valid `source` for
  expo-image's `Image` component directly. Has width/height/requestedTime.
- `VideoThumbnailOptions`: `{ maxWidth?, quality? }` (check the .d.ts for exact fields).

## Implementation

### 1. NEW frontend/src/platform/media/videoPoster.ts

```ts
export type VideoPoster = { source: VideoThumbnail | null };
export async function getVideoPoster(uri: string, timeMs?: number): Promise<VideoThumbnail | null>
```

- Module-level `Map<string, VideoThumbnail>` cache keyed by uri (+time) — generate once.
- Create a player via `createVideoPlayer({ uri })`, call `generateThumbnailsAsync(timeMs ?? 0)`,
  take [0], cache, return. On ANY failure (web, corrupted file, codec) return null —
  never throw to the caller.
- Release the player after generation if the player API exposes a release/dispose
  (check VideoPlayer.d.ts); if not, note it in the report and keep one player per
  generation (cache makes this once per video).
- Guard: `Platform.OS === 'web'` → return null immediately.

### 2. Consume in ListingMediaStudio

- Thumbnail strip (renderThumbItem): for video items, replace the inline `<Video>`
  with a poster image: `getVideoPoster(uri)` in a small hook (`useVideoPoster(uri)`
  inside the file or the util module — your call, keep it tidy), render expo-image
  with the thumbnail source (or the current Video as fallback when null) + a small
  play glyph overlay (Ionicons 'play' in a compact scrim circle — match the file's
  existing overlay grammar). The poster must respect the item's focalPoint if the
  Wave 2A FocalImage primitive accepts a plain source — if FocalImage is
  VideoThumbnail-incompatible, render expo-image directly for video posters and note it.
- Cover: keep the playable Video element (users expect cover playback) but add the
  generated poster as the Video's `poster`-equivalent if the compat Video component
  supports one (check frontend/src/components/compat/Video); if not supported, leave
  the cover as-is and note it. Do not force it.
- Memoize per item id; cancel/ignore results for unmounted items (stale-response guard).

## Constraints

- TS strict, no `any`, no new dependencies (expo-video is installed).
- Do NOT touch: CreatorCropSheet, FocalImage, SortablePhotoStrip internals, services,
  hooks, screens, UploadManager. ListingMediaStudio is yours for this task.
- Keep ListingMediaStudio size neutral or smaller.
- Reduced motion / a11y: play glyph is decorative (aria-hidden); the thumb keeps its
  existing accessibility label.

## Verification

1. npm run typecheck; scoped eslint; npm test (baseline 7 pre-existing unrelated).
2. Report: confirm the VideoThumbnail-as-expo-image-source usage compiles and matches
   the installed typings; state the web behavior (fallback path).

## Report

Append to .flagship/sdd/task-2C-report.md; return ONLY status, one-line test summary, concerns.
