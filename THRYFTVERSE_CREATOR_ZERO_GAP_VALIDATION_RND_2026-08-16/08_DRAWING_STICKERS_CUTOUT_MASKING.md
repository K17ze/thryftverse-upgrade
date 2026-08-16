# Drawing, Stickers, Cutout and Masking

## Drawing

### Strengths
- dedicated workspace;
- pen/marker/highlighter/neon/eraser;
- exact HEX entry;
- undo/clear;
- Skia rendering.

### Gaps
- PanResponder/legacy Animated still used for some high-frequency controls;
- point samples cross to JS;
- no shared professional color system;
- no palette architecture;
- no emoji brush;
- no pinch-to-resize brush;
- some controls are visually 40px;
- native Alert breaks editor continuity.

### Upgrade
- keep active stroke on UI/GPU side;
- batch semantic stroke on end;
- shared color picker;
- pinch brush size + accessible slider;
- emoji brush;
- custom confirmation sheet.

## Stickers

Baseline categories already present or partially present should include:
- emoji;
- GIF;
- location;
- time/weather;
- poll/quiz/question;
- link;
- product;
- mention.

### Missing reference-class behaviors
- video object pinning/tracking;
- Auto Stickers/media-derived stickers;
- deeper search/catalog integration;
- mature style customization.

Object pinning is a substantial CV feature and belongs in the explicit parity ledger rather than hidden under “stickers done.”

## Cutout

### Current architecture
UI and service abstraction exist, but normal dependencies do not include a segmentation provider.

### Production decision
Choose and own exactly one backend:
- native platform vision API;
- vetted RN/Expo native module;
- server segmentation;
- custom on-device model.

Add build configuration, versioning, device support matrix and tests.

### Real mask refinement
Implement rasterization for:
- Keep;
- Erase;
- Restore;
- feather;
- invert;
- undo.

Store the mask as a separate project asset and reference it non-destructively from the media layer.

### Canonical renderer
`CreatorCanvas` must actually composite the mask. Today it displays the raw media, so even a successful mask backend cannot be called end-to-end WYSIWYG until the canvas understands it.

## Green screen

Separate concept from subject cutout:
- select source background;
- key color;
- tolerance;
- spill suppression;
- feather;
- live preview.

Snapchat currently exposes Green Screen as a camera creation tool; include it on the long-term parity ledger.
