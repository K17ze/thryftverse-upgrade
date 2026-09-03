# Media Handling QA Matrix — `FlagshipImage`

> **Owner:** `frontend/src/components/flagship/FlagshipImage.tsx`
> **Source of geometry:** `frontend/src/theme/mediaAssets.ts`
> **Charter refs:** AGENTS.md §4 (anti-AI / real media is the colour), §9.6 (Design.md media system), §11/§17/§18 (accessibility & motion), §27.2 (motion tiers).
>
> This matrix is the canonical edge-case verification document for the
> ThryftVerse media surface. Every cell states the expected behaviour, the
> mechanism that implements it, and the verification status. When behaviour
> changes, update the matrix in the same PR.

---

## 0. Component contract

`FlagshipImage` is the canonical media surface. It wraps `expo-image` and
implements the full state machine:

```
loading → loaded → error/corrupt ──→ retry → loading
              ↘ sensitive (blurred) ──tap──→ revealed (loaded)
              ↘ video (poster + play affordance)
```

Props (see `FlagshipImageProps`):
`source`, `category`, `placeholder` (BlurHash), `focalPoint`, `aspectRatio`,
`accessibilityLabel`, `isVideo`, `videoDuration`, `contentWarning`,
`attribution`, `style`, `onPress`, `testID`.

Geometry (aspect ratio, content fit, focal-point policy) is a property of the
`MediaCategory`, resolved via `mediaAssets.ts` — never a per-call magic number.

---

## 1. Loading states

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 1.1 | BlurHash placeholder | A real decoded BlurHash placeholder is shown immediately at the correct aspect ratio — never a flat grey box. | `placeholder={{ blurhash }}` on a dedicated `ExpoImage` in the loading skeleton, crossfaded out on load. `AGENTS §4`: real media is the colour. | ✅ Handled |
| 1.2 | Shimmer sweep | A subtle horizontal shimmer sweeps across the frame while loading; stops the instant the image loads. | `AnimatedLinearGradient` driven by `shimmerX` shared value, `withRepeat`/`withSequence`. Sweep distance `SHIMMER_SWEEP_DISTANCE`. | ✅ Handled |
| 1.3 | Progressive load / large-image decode | Large images decode progressively and are downscaled to the container before rendering to avoid memory spikes. | `enforceEarlyResizing` + `allowDownscaling` on `ExpoImage`. **Note:** `expo-image` in this SDK has no `progressiveRenderingEnabled` prop; `enforceEarlyResizing` is the equivalent progressive-decode / memory-budget lever. | ✅ Handled (added) |
| 1.4 | Source change reset | Switching `source` resets to loading, clears any prior loaded/error state, and re-runs the placeholder + shimmer. | `useEffect` on `uri`/`placeholder` resets `loaded`, `failed`, `imageOpacity`, `placeholderOpacity`. | ✅ Handled |
| 1.5 | Crossfade from placeholder to image | The placeholder crossfades into the final image; never pops. | `imageOpacity` → 1, `placeholderOpacity` → 0 via `withTiming` at `Motion.transitions.mediaLoad.duration` (250ms). | ✅ Handled |
| 1.6 | No BlurHash supplied | A neutral `surfaceAlt` ground with shimmer is shown (still not a flat grey card — the shimmer communicates active loading). | Skeleton renders `backgroundColor: colors.surfaceAlt` + shimmer when `placeholder` is absent. | ✅ Handled |

---

## 2. Error states

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 2.1 | Network failure | Frame shows an honest error state with an icon, copy, and a retry affordance — never a broken-image rectangle. | `onError` → `handleError` sets `failed=true`, hides the image, renders the error column. | ✅ Handled |
| 2.2 | 404 / missing asset | Same error state as network failure (expo-image surfaces all fetch failures via `onError`). | `onError` path. | ✅ Handled |
| 2.3 | Corrupt / undecodable image | Treated as an error; the retry affordance forces a fresh fetch via a new `recyclingKey`. | `onError` + `recyclingKey` includes `retryToken` so retry re-mounts the native image view and bypasses any cached failure. | ✅ Handled |
| 2.4 | Retry affordance | Tapping retry clears the error, restores the placeholder, bumps the retry token, and re-fetches. Medium haptic confirms the tap. | `handleRetry`: `haptic.medium()`, resets state, `setRetryToken(t => t+1)`. | ✅ Handled |
| 2.5 | Retry accessibility | The retry button is a labelled, role-`button` accessible element. | `accessibilityRole="button"`, `accessibilityLabel="Retry loading image"`. | ✅ Handled |
| 2.6 | Error state legibility (dark/light) | Error icon and copy use theme tokens that meet contrast in both themes. | `colors.textMuted` (icon), `colors.textSecondary` (copy), `colors.surface` (button), `colors.border` (button outline). | ✅ Handled |

---

## 3. Offline / cache

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 3.1 | Cached image display while offline | Previously fetched images render instantly from cache with no network call. | `cachePolicy="memory-disk"` — memory first, disk fallback. | ✅ Handled |
| 3.2 | No cache + offline | The error state is shown (the fetch fails offline with no cache). The BlurHash placeholder still renders during the attempt. | `onError` path; placeholder renders in the loading skeleton before failure. | ✅ Handled |
| 3.3 | Cache invalidation on retry | Retry bypasses a cached failure by changing the `recyclingKey`. | `recyclingKey = ${uri}::${retryToken}`. | ✅ Handled |

---

## 4. Performance

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 4.1 | Large images (10MB+) | The decoder downscales the bitmap to the container size before rendering; memory stays bounded. | `enforceEarlyResizing` + `allowDownscaling` on `ExpoImage`. | ✅ Handled (added) |
| 4.2 | Many images in a list (grid/feed) | Recycled views do not flash the previous source; cache is shared across instances. | `recyclingKey` per source+retry; `cachePolicy="memory-disk"` shares the cache. | ✅ Handled |
| 4.3 | Memory pressure | Memory cache is evicted automatically by the OS; disk cache survives. Early resizing prevents holding full-resolution bitmaps. | `cachePolicy="memory-disk"` (memory evictable, disk persistent) + `enforceEarlyResizing`. | ✅ Handled |
| 4.4 | Cache policy | Explicit memory-disk policy — never `none`. | `cachePolicy="memory-disk"` set explicitly at the call site. | ✅ Handled |
| 4.5 | Downscale | Native downscale-to-container is enabled. (CDN-side `downscaleWidth` URL shaping lives on `CachedImage` for legacy surfaces; `FlagshipImage` uses the native early-resize lever.) | `enforceEarlyResizing` + `allowDownscaling`. | ✅ Handled (added) |

---

## 5. Aspect ratios

Geometry is a property of `MediaCategory` (`mediaAssets.ts`), not a per-call
guess. Callers may pass an `aspectRatio` override for non-standard assets.

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 5.1 | Square (profile/avatar, auction) | 1:1 frame. | `profile` / `auction` → `ratio: 1`. | ✅ Handled |
| 5.2 | Portrait (product 4:5, look 3:4) | Editorial portrait crop. | `product` → 4/5, `look` → 3/4. | ✅ Handled |
| 5.3 | Landscape (cover 16:9) | Banner crop. | `cover` → 16/9. | ✅ Handled |
| 5.4 | Vertical full-bleed (story 9:16) | Full-bleed vertical, no focal override. | `story` → 9/16, `allowFocalPoint: false`. | ✅ Handled |
| 5.5 | Panoramic / detail-preserving (evidence 4:3) | `contain` fit — never crops out detail. | `evidence` → 4/3, `contentFit: 'contain'`, `allowFocalPoint: false`. | ✅ Handled |
| 5.6 | Mixed grid | Each tile uses its own category geometry; the grid does not impose a uniform ratio. | Per-tile `category` prop drives `getMediaAspectRatio`. | ✅ Handled |
| 5.7 | Server-supplied non-standard ratio | Caller passes `aspectRatio` override; category fit/focal policy still applies. | `getMediaAspectRatio(category, override)`. | ✅ Handled |

---

## 6. Focal points

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 6.1 | Center (default) | Image is centred when no focal point is supplied and the category has no default. | `contentPosition` left `undefined` → expo-image centres. | ✅ Handled |
| 6.2 | Top | Focal point `{ x: 0.5, y: 0 }` crops to preserve the top. | `contentPosition = { top: '0%', left: '50%' }`. | ✅ Handled |
| 6.3 | Custom focal point | Caller-supplied `{x,y}` (0–1) maps to `contentPosition` percentages. | `getMediaFocalPoint` + `contentPosition` template. | ✅ Handled |
| 6.4 | Focal override on a no-focal category | Override is ignored for `story`/`evidence` (subject is framed; art direction must not crop it out). | `getMediaFocalPoint` returns the category default (or `undefined`) when `allowFocalPoint` is false. | ✅ Handled |

---

## 7. Video

`FlagshipImage` renders a **poster frame** for video items (the thumbnail).
Native video playback lives on `CachedImage`/`MediaPreview` (viewability-driven).

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 7.1 | Video thumbnail | A still poster image is shown (the caller passes the poster `source`). | `isVideo` only toggles the affordance overlay; the `source` is the poster. | ✅ Handled |
| 7.2 | Play overlay | A centred play glyph in a circular scrim is rendered over the poster. | `playCircle` with `colors.overlay` background + `Ionicons name="play"`. | ✅ Handled |
| 7.3 | Duration chip | When `videoDuration` is supplied, a `m:ss` chip is rendered bottom-right. | `durationLabel` memo + `durationChip` (`colors.mediaOverlayScrim`). | ✅ Handled |
| 7.4 | Autoplay control | `FlagshipImage` never autoplays — it is a poster surface. Autoplay is the responsibility of the viewability-driven `MediaPreview`/`CachedImage` (`shouldPlay`). | By design — poster-only. | ✅ Handled (by design) |
| 7.5 | Mute | N/A for a poster frame. Native video surfaces (`CachedImage`) play muted by default. | N/A on this component. | ✅ N/A |
| 7.6 | Video + error | If the poster fails to load, the error/retry state is shown and the play affordance is hidden. | `isVideo && !failed` gates the overlay. | ✅ Handled |

---

## 8. Content warning / sensitive media

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 8.1 | Blurred preview | The real image is rendered with a **real gaussian blur** (`blurRadius`), not an opacity veil. The user sees a recognizable but obscured preview. | `blurRadius={contentWarning && !revealed ? SENSITIVE_BLUR_RADIUS : 0}` on `ExpoImage`. `SENSITIVE_BLUR_RADIUS = 30`. | ✅ Handled (fixed — was opacity-only) |
| 8.2 | Legibility scrim | A semi-transparent scrim (`mediaOverlayScrim`) sits over the blurred image so the warning copy is legible — without fully hiding the asset. | `backgroundColor: colors.mediaOverlayScrim` (rgba(0,0,0,0.6)). | ✅ Handled (fixed) |
| 8.3 | Tap to reveal | Tapping the reveal button removes the blur and scrim. Light haptic confirms. | `handleReveal`: `haptic.light()`, `setRevealed(true)`. `blurRadius` becomes 0. | ✅ Handled |
| 8.4 | Reveal accessibility | The reveal button is a labelled, role-`button` element with a hint describing the action. | `accessibilityRole="button"`, `accessibilityLabel="Reveal sensitive media"`, `accessibilityHint="Removes the blur and shows the uncensored image"`. | ✅ Handled (hint added) |
| 8.5 | Container accessibility hint | The frame announces that tapping reveals sensitive media. | `accessibilityHint` on the container when `contentWarning` is set. | ✅ Handled |
| 8.6 | No flat grey card | Even in the warning state, real (blurred) media is the colour — never a flat grey rectangle. | Real `blurRadius` + translucent scrim. `AGENTS §4`. | ✅ Handled (fixed) |

---

## 9. Dark mode

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 9.1 | Placeholder colour | The loading ground uses a theme token that reads correctly in both themes. | `colors.surfaceAlt` (light `#EFEFEF` / dark recessed tier). | ✅ Handled |
| 9.2 | Overlay legibility | Text-on-media scrims are always white-on-dark in both themes (semantic `scrim*` / `mediaOverlay*` tokens are theme-invariant). | `colors.scrimTextPrimary`, `colors.scrimTextTertiary`, `colors.mediaOverlayScrim` — identical values in light/dark. | ✅ Handled |
| 9.3 | Geometry parity | Frame geometry, hierarchy and density are identical across themes — dark mode adds no glow/translucency. | No theme-conditional geometry; `useAppTheme().colors` only swaps palette tokens. | ✅ Handled |

---

## 10. Accessibility

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 10.1 | Alt text / accessibilityLabel | The frame exposes a screen-reader label describing the image. | `accessibilityLabel` prop on the container. | ✅ Handled |
| 10.2 | Role | The frame is `image` by default; `button` when `onPress` is supplied. | `accessibilityRole={onPress ? 'button' : 'image'}`. | ✅ Handled |
| 10.3 | Reduced motion | All motion collapses to instant when OS / in-app reduced-motion is on: no shimmer sweep, instant crossfade, instant placeholder fade. | `useReducedMotion()` gates `withTiming` durations (→ 0) and cancels the shimmer animation. | ✅ Handled |
| 10.4 | Interactive element labels | Every interactive element (retry, reveal) has an `accessibilityLabel` and `accessibilityRole`. | Retry: `"Retry loading image"`; Reveal: `"Reveal sensitive media"` + hint. | ✅ Handled |
| 10.5 | Hit targets | Retry and reveal buttons meet the 44pt minimum hit target. | `minHeight: Control.hit` on both buttons. | ✅ Handled |
| 10.6 | Inner image hidden from screen reader | The inner `ExpoImage` is marked `accessible={false}` so the container's label is the single announcement. | `accessible={false}` on `ExpoImage`. | ✅ Handled |

---

## 11. Attribution / sponsored

| # | Edge case | Expected behaviour | Mechanism | Status |
|---|-----------|--------------------|-----------|--------|
| 11.1 | Attribution chip | A scrim chip top-left renders the sponsored/attribution label legibly over media. | `attributionChip` with `colors.mediaOverlayScrim` + `colors.scrimTextPrimary`. | ✅ Handled |
| 11.2 | Attribution hidden on error | The chip is suppressed when the media has failed (no orphan label over an error state). | `attribution && !failed` gate. | ✅ Handled |

---

## Verification

Typecheck (from `frontend/`):

```bash
npx --package typescript tsc --noEmit
```

`FlagshipImage.tsx` and `mediaAssets.ts` produce **0 errors**. (Pre-existing
unrelated errors in `SellerAnalyticsScreen.tsx` are out of scope for this
media-handling pass.)

---

## Change log

| Date | Change |
|------|--------|
| 2026-09-02 | Added `enforceEarlyResizing` + `allowDownscaling` for progressive decode / memory budget (§1.3, §4.1, §4.5). Replaced opacity-only content-warning veil with a real `blurRadius` gaussian blur + translucent legibility scrim (§8.1, §8.2, §8.6). Added `accessibilityHint` to the reveal button (§8.4). Switched sensitive-state icon/copy/border to theme-invariant `scrim*` tokens for dark/light parity (§8, §9). |
