# Task 2A Brief — Focal-point-aware previews (FocalImage)

Repo: C:\Users\User\Desktop\thryftverse-upgrade. React Native + Expo ~57, expo-image ~57, TS strict.

## Mission

The user can set a focal point on a photo (CreatorCropSheet tap-to-set), but every
`expo-image` preview in the listing flow uses `contentFit="cover"` with centered
cropping — so faces/subjects end up cropped off-center despite explicit user intent.
Fix at the presentation layer with one shared component.

## Context (read first)

- frontend/src/creator/CreatorCropSheet.tsx ~332-342 — focal point is set as
  normalized {x, y} (0-1) and returned via `onFocalPointChange`.
- frontend/src/creator/CreatorCanvas.tsx ~1658-1669 — the ONLY place focal point is
  honored today (Skia path). Match its semantics: focal = the image point that should
  stay anchored in the viewport center under cover-fit.
- frontend/src/components/listing/ListingMediaStudio.tsx — cover render (~515-545,
  ExpoImage contentFit="cover") and thumb render in renderThumbItem (video/image).
- frontend/src/components/SortablePhotoStrip.tsx ~212 — thumbnail ExpoImage cover-fit.
- ListingMediaDraftItem (frontend/src/utils/mediaUploadAsset.ts) — check whether a
  focalPoint field exists on draft items; if not, ADD it (optional, additive) and
  thread it: ListingMediaStudio holds items; the crop sheet's onFocalPointChange must
  reach the host. The host contract today is `onTransformItem(itemId, transformedUri)`.
  Extend it additively: `onTransformItem(itemId, transformedUri, focalPoint?)` —
  update the two host call sites (SellScreen.tsx ~291, EditListingScreen.tsx ~925)
  to accept and store the third argument if their handler signatures allow; if the
  hosts' draft-item model makes this awkward, store focal on the draft item inside
  ListingMediaStudio's parent via the existing handler and note exactly what you did.

## Implementation

### 1. NEW frontend/src/components/media/FocalImage.tsx

A drop-in cover-fit image that anchors on a focal point:

```ts
interface FocalImageProps {
  uri: string;
  focalPoint?: { x: number; y: number }; // normalized 0-1, default center
  style: StyleProp<ImageStyle>;          // container size comes from style
  transition?: number;
  recyclingKey?: string;
  accessibilityLabel?: string;
}
```

- Measure the container (onLayout). Load the image natural size via expo-image's
  Image.loadAsync or Image.getSize (pick the expo-image-idiomatic API).
- Compute cover-fit scale, then translate the image so the focal point lands at the
  container center: translateX = (0.5 - fx) * (scaledWidth - containerWidth), same
  for Y. Render the image absolutely positioned at the scaled size inside an
  overflow-hidden container, with a transform — no re-render loops; memoize by
  [uri, focalPoint, containerSize].
- Default focal (0.5, 0.5) must render pixel-identical to today's contentFit="cover".
- No fallback images, no placeholders, no loading chrome — it's a preview primitive.

### 2. Consume it

- ListingMediaStudio cover: use FocalImage with the cover item's focalPoint.
- ListingMediaStudio thumbs + SortablePhotoStrip thumbnails: FocalImage with the
  item's focalPoint (SortablePhotoStrip takes a `photos: string[]` prop today —
  extend additively with an optional `focalPoints?: Record<string, {x,y}>` keyed by
  itemId, or an optional parallel array — choose the cleaner one and note it).
- Videos keep the existing Video element (focal for video poster frames is Wave 2C).

### 3. Thread focal from the crop sheet

- ListingMediaStudio's crop sheet invocation (Wave 1B) already renders
  CreatorCropSheet for the cover. CreatorCropSheet exposes `focalPoint` +
  `onFocalPointChange` props — wire them: pass the item's stored focal, and on change
  persist it through the host contract (see Context note above). Focal survives
  crop/rotate: the sheet already tracks it — verify its normalized coordinates stay
  correct after a crop completes and re-normalize if needed (document in report).

## Constraints

- TS strict, no `any`, no new deps. Reanimated only if already used in these files.
- Do NOT touch CreatorCropSheet's internal crop math beyond focal re-normalization,
  mediaTransforms.ts, services, hooks, or UploadManager.
- Keep ListingMediaStudio from growing: the cover/thumb swaps should be net-neutral.
- Accessibility: FocalImage passes through accessibilityLabel/aria-hidden as its
  call sites do today.
- Style: match repo conventions; no comments restating the obvious.

## Verification

1. npm run typecheck; scoped eslint on touched files; npm test (baseline: 7 pre-existing unrelated failures).
2. Reason through and document in the report: focal (0.5,0.5) === current cover behavior; focal (0,0) anchors top-left; focal (1,1) anchors bottom-right; translate clamped so no gaps appear at any aspect ratio.

## Report

Append to .flagship/sdd/task-2A-report.md; return ONLY status, one-line test summary, concerns.
