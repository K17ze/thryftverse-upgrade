# 07 — Media Toolchain: Camera, Timeline, Text, Effects, Drawing, Audio

## 1. Camera

### Preserve
Current componentization is good. Keep:
- `ShutterButton`
- `RecordingRing`
- `FocusReticle`
- `ControlsRail`
- `GalleryCarousel`
- `PermissionState`

### Reconstruct state ownership
`CreatorCamera` should orchestrate state; leaf components should remain pure as far as practical.

Create:
- `useCreatorCameraSession`
- `useCameraCapabilities`
- `useCaptureQueue`
- `useCameraPermissionsIntent`

### Permission design
Camera permission: request when user enters camera.
Photo library: request when user chooses library access, not merely to paint a thumbnail.

### Zoom
If platform capability cannot truthfully identify lens focal factors, use continuous zoom UI rather than fabricated lens names.

### Recording
Separate:
- device capture max;
- editor source clip;
- publish clip policy.

Do not hard cap raw capture to 15s for engineering convenience.

## 2. Gallery / media browser

### Current
Two systems exist:
- entry gallery grid;
- media picker inside `CreatorAssetPicker`.

Consolidate into one media browsing foundation.

### New `MediaBrowser`
Capabilities:
- recent;
- albums;
- photos;
- videos;
- ordered multi-select;
- full-screen preview;
- limited-library handling;
- duration badges;
- selection count/order;
- camera tile where appropriate;
- optional system picker fallback;
- pagination;
- cached thumbnails;
- semantic source metadata.

### Gesture
- tap selects;
- long press previews;
- swipe down closes preview;
- horizontal swipe preview next/previous.

## 3. Timeline

Build from:
- `PosterTimeline.tsx`
- `PrimaryClipTrack.tsx`
- `OverlayTrack.tsx`
- `WaveformTrack.tsx`
- `TimelinePlayhead.tsx`
- `ClipTrimHandles.tsx`
- `TimelineRuler.tsx`

### Rendering
Generate low-res thumbnail strips/proxies asynchronously.

Do not decode full-res frames on JS for every scrub event.

Use UI-thread gesture values and batched/derived state.

## 4. Text

### Text model additions
Add:
- fontFamilyId;
- fontWeight/style;
- letterSpacing;
- maxWidth;
- textBoxMode;
- stroke width/color;
- shadow parameters;
- background pill padding/radius;
- animation timing;
- line break policy.

### Fonts
Five distinct families is an improvement over weight-only variation, but flagship text requires a coherent **curated family system**, not a huge novelty-font dump.

Recommend 8–12 launch styles across:
- neutral sans;
- condensed display;
- elegant serif;
- geometric;
- handwritten/signature;
- rounded/bubble;
- high-impact poster.

## 5. Effects / adjustments

### Non-destructive effect graph

```ts
type MediaEffect =
  | { type: 'adjust'; exposure: number; contrast: number; ... }
  | { type: 'filter'; id: string; amount: number }
  | { type: 'blur'; radius: number; mask?: MaskRef }
  | { type: 'vignette'; amount: number }
```

Do not export a new file after every slider movement.

### Thumbnail rendering
Precompute 8–12 visible effect thumbs using Skia.
Cancel work for off-screen options.

## 6. Crop

Current `expo-image-manipulator` is suitable for deterministic final crop/export, but live crop UI should remain non-destructive until commit/export.

Store:
- crop rect;
- rotation;
- mirror;
- perspective if later supported.

## 7. True cutout / masking

Do not simulate with a trace bounding box.

Pipeline:
1. segmentation;
2. mask preview;
3. edge refinement;
4. store alpha mask;
5. GPU compose;
6. only flatten at export/share preview.

## 8. Drawing

Core tools:
- pen;
- marker;
- highlighter;
- neon;
- eraser;
- undo/redo stroke;
- size;
- color.

Performance:
- keep active stroke on UI/GPU side;
- batch committed stroke;
- do not append React state point-by-point from JS at high frequency.

## 9. Stickers / interactive objects

Split browse from configure.

Example:
`Stickers` opens visual tray.
Tap Poll → poll object appears on canvas → inline/editor panel asks question/options.

Don't route every object through a long generic configuration form before it exists.

## 10. Audio

Poster should treat audio as temporal.

P0:
- select sound;
- preview;
- start offset;
- volume;
- original audio volume.

P1:
- fade in/out;
- beat markers;
- waveform;
- voiceover;
- sound effects.

P2:
- beat-synced cut suggestions;
- automatic ducking.

## 11. Haptics

Use haptics for state transitions:
- select;
- snap;
- threshold crossing;
- trim handle contact;
- reorder landing;
- destructive confirmation.

Do not haptic every tap identically.

## 12. Tool registry

```ts
type CreatorToolDefinition = {
  id: CreatorToolId;
  modes: Array<'poster-photo'|'poster-video'|'look'>;
  contexts: SelectionContext[];
  priority: number;
  icon: IconName;
  label: string;
  open: (ctx: ToolContext) => void;
}
```

This enables:
- mode-specific defaults;
- pinned tools;
- recent tools;
- A/B ordering;
- centralized availability;
- no monolithic switch implementation.
