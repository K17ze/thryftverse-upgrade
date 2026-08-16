# Zero-Gap Creator Color System

Color is one of the most obvious remaining “2016 editor” signals. The department currently has fragmented mechanisms instead of one professional color model.

## 1. Canonical color data

Use structured RGBA as canonical state:

```ts
export type CreatorColor = {
  space: 'srgb';
  r: number; // 0..1
  g: number;
  b: number;
  a: number; // 0..1
};
```

Serialize deterministically to `#RRGGBBAA` when needed. Raw unvalidated strings should not be the internal source of truth.

## 2. Shared `CreatorColorPicker`

### Compact row
- current color well;
- recent/project swatches;
- eyedropper;
- exact HEX field.

### Expanded panel
- two-dimensional saturation/value plane;
- hue slider;
- alpha slider;
- HEX;
- RGB values;
- HSL/HSV under Advanced;
- recents;
- project palette;
- palette extracted from current media.

### HEX behavior
Accept:
- `#RGB`;
- `#RRGGBB`;
- `#RRGGBBAA`.

Normalize case, sanitize paste, reject invalid values and never commit malformed colors.

## 3. Eyedropper

Sample the actual composition:
- Skia/canvas snapshot or GPU readback strategy;
- magnifying loupe;
- crosshair;
- current pixel preview;
- light haptic on commit;
- video samples current displayed frame.

Alternative accessibility path: expose dominant/media palette swatches without spatial sampling.

## 4. Recent + project palette

Persist only committed colors, not every slider frame.

- last 12 colors;
- currently used project colors;
- optional favorites;
- duplicate normalization by RGBA.

## 5. Media-derived palette

Generate 5–8 suggestions:
- dominant;
- light;
- dark;
- accents;
- complementary neutral.

Especially valuable for Look composition.

## 6. Text channels

Independent authoring for:
- fill;
- background/pill;
- stroke;
- shadow.

No effect may silently force black/white unless it is a documented style preset that can be expanded/customized.

## 7. Drawing

Use the same picker:
- exact HEX;
- alpha;
- recents;
- palette;
- eyedropper.

Add pinch-to-resize as a high-frequency gesture and retain accessible slider/numeric controls.

## 8. Shapes

Shapes need:
- fill color;
- stroke color;
- stroke width;
- opacity.

Lines/arrows need stroke-only semantics and explicit arrowhead/endpoints.

## 9. Background gradients

Replace hard-coded-only gradients with a true editor:
- 2–4 stops;
- add/remove;
- draggable stop positions;
- angle;
- alpha;
- reverse;
- linear/radial if supported;
- media-derived suggestions.

## 10. Interactive sticker themes

Poll/question/quiz/link/location visual themes should expose controlled channels:
- background;
- foreground;
- accent.

Maintain legibility and contrast validation.

## 11. Contrast intelligence

- warn about low text contrast;
- offer `Improve contrast`;
- never silently rewrite the authored color;
- for media backgrounds, approximate local luminance around text when feasible.

## 12. History semantics

Dragging hue/SV/alpha = transient preview. One history entry on gesture end.

Typing HEX = commit on valid submit/blur.

## 13. Wide-gamut policy

Use sRGB first for cross-platform determinism. Only add Display-P3/HDR after editor, export and viewer all share a verified color-management path.

## 14. Suggested module structure

```text
creator/color/
  ColorTypes.ts
  ColorMath.ts
  ColorParser.ts
  CreatorColorPicker.tsx
  SVPlane.tsx
  HueSlider.tsx
  AlphaSlider.tsx
  HexColorField.tsx
  NumericColorFields.tsx
  Eyedropper.tsx
  RecentColors.tsx
  ProjectPalette.tsx
  MediaPalette.ts
  GradientEditor.tsx
  useCreatorColorHistory.ts
```

Delete duplicate `hslToHex` and ad-hoc string parsing from individual tools.

## Acceptance

- [ ] Text fill exact HEX.
- [ ] Text background exact HEX.
- [ ] Text stroke exact HEX.
- [ ] Text shadow exact HEX.
- [ ] Drawing same picker.
- [ ] Shapes same picker.
- [ ] Background same picker.
- [ ] Gradient stops same picker.
- [ ] Alpha supported.
- [ ] Eyedropper works on canvas/video frame.
- [ ] Recent/project colors work.
- [ ] Invalid colors never enter persisted document state.
- [ ] Undo produces one semantic entry per committed color choice.
