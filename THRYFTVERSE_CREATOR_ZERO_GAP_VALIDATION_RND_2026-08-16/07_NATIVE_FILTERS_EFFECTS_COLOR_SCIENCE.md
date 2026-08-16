# Native Filters, Effects and Color Science

## P0 problem

Current filter preset thumbnails rely on CSS-like filter strings while the native path does not actually render them, and `CreatorCanvas` itself ignores the media effect stack. This invalidates native WYSIWYG.

## 1. Canonical effect graph

Use a native GPU-capable graph (Skia is already in the stack):

```ts
type EffectNode =
  | { type: 'adjust'; exposure?: number; contrast?: number; highlights?: number; shadows?: number; saturation?: number; temperature?: number; tint?: number; fade?: number; vignette?: number; sharpness?: number }
  | { type: 'matrix'; matrix: number[] }
  | { type: 'lut'; assetId: string; amount: number }
  | { type: 'blur'; radius: number }
  | { type: 'grain'; amount: number }
  | { type: 'mask'; maskId: string; children: EffectNode[] };
```

The same graph powers:
- effect thumbnail;
- editor canvas;
- preview;
- viewer;
- export.

## 2. Real filter presets

A preset contains actual render data, not a CSS label/string:
- matrix or LUT;
- adjustment defaults;
- intensity;
- supported color space;
- version.

## 3. Preview rail

- render current media/current video frame;
- low-res Skia previews;
- cache by media hash + preset + render version;
- cancel work for offscreen thumbnails;
- selected state unambiguous.

## 4. Adjustment sliders

Create one shared RNGH/Reanimated `CreatorSlider`:
- drag;
- tap to jump;
- keyboard/accessibility increment;
- haptic at neutral value;
- numeric label;
- one history commit on release.

Retire new PanResponder sliders.

## 5. Before/after

Press-and-hold preview bypasses the graph. Release restores. This is a high-value trust interaction.

## 6. Auto/Enhance truth

Current `computeAutoAdjust()` is static.

Option A: rename to `Enhance` and present it as a curated preset.

Option B: implement actual analysis:
- luminance histogram;
- clipping;
- white-balance estimate;
- saturation distribution;
- conservative scene/face-aware constraints if responsibly implemented.

Never label constants “intelligent.”

## 7. Video

Use proxy-resolution native preview and full-resolution export. No per-frame JS color pipeline.

## 8. Color management

Baseline:
- deterministic sRGB working space;
- orientation/profile handling;
- documented HDR→SDR strategy.

Future:
- Display P3/HDR after editor/export/viewer are all color-managed.

## Acceptance

- [ ] Native filter thumbnail visibly changes on iOS/Android.
- [ ] Same preset produces same canvas/viewer/export result.
- [ ] Effect intensity works.
- [ ] Before/after works.
- [ ] No CSS filter hack remains in production path.
- [ ] Auto is content-aware or honestly named Enhance.
