# THRYFTVERSE POSTER DEPARTMENT — FLAGSHIP FIX ROADMAP

**Date:** 2026-08-08 (HONEST REVISION)
**Honest Score:** 4/10 → Target 9/10
**Method:** Wave 1 (shared abstractions) → Wave 2 (split monoliths + fix legacy) → Wave 3 (missing features)

---

## THE PROBLEM (HONEST)

We are at 4/10, not 8.6/10. The previous audit was dishonest — it checked for pattern presence (does the file import GestureHandler?) without verifying actual quality. The real problems are architectural:

1. **Massive monoliths** — CreatorAssetPicker is 4038 lines, CreatorCanvas is 2524, CreatorCamera is 1736
2. **Copy-paste patterns** — color utils in 5+ files, gradient ring in 5+ files, spring configs in multiple files
3. **Missing shared abstractions** — no ColorSlider, no DraggableLayer, no GradientRing, no ContextMenu
4. **Hardcoded values** — gradient colors, accent colors, overlay colors all bypass tokens
5. **Legacy patterns** — CreatorCamera still uses Animated.Value + PanResponder
6. **Fake features** — CreatorCutoutSheet draws paths, no actual background removal
7. **Dead code** — CameraCapture.tsx is a 17-line wrapper
8. **Missing features** — only 4 fonts (all Inter weights), no eyedropper, no text stroke, no pressure sensitivity

---

## WAVE 1: SHARED ABSTRACTIONS (FOUNDATION)

Create these new files in `frontend/src/components/poster/shared/`:

| File | Purpose | Replaces copy-paste in |
|------|---------|----------------------|
| `colorUtils.ts` | hslToHex, hexToHsl, isLightColor, interpolateColor | FilterStrip, DrawingCanvas, BackgroundPicker, CreatorAssetPicker, TextOverlayCanvas |
| `ColorSlider.tsx` | GestureHandler-based HSL/hue/saturation/lightness slider | DrawingCanvas, BackgroundPicker, CreatorAssetPicker |
| `GradientRing.tsx` | Spring-animated gradient ring for active state | LayoutPicker, TemplatePicker, PosterHighlightsRail, CreativeToolbar, CreatorToolDock |
| `layerAccents.ts` | Accent color constants per layer type | CreatorCanvas, CreatorLayersSheet, PosterStickerLayer |
| `ContextMenu.tsx` | Long-press context menu with spring animation | CreatorCanvas, PosterStickerLayer, MultiPhotoCollage |
| `DraggableLayer.tsx` | Shared gesture component (pan/pinch/rotate) for text + stickers | TextOverlayCanvas, PosterStickerLayer, CreatorCanvas |

---

## WAVE 2: SPLIT MONOLITHS + FIX LEGACY (PARALLEL)

Each subagent touches independent files. All use shared abstractions from Wave 1.

### 2A: Split CreatorAssetPicker.tsx (4038 → 20+ files)
- Extract each picker mode into its own file: MediaPicker, ProductPicker, MentionPicker, LookPicker, TextPicker, ShapePicker, VotePicker, DrawPicker, GifPicker, MusicPicker, QuizPicker, QuestionPicker, EmojiSliderPicker, CountdownPicker, StickerPicker, LinkPicker, LocationPicker, HashtagPicker, TimePicker, WeatherPicker
- Extract MediaGridItem, PickerShell components
- Use shared colorUtils

### 2B: Split CreatorCanvas.tsx (2524 → 8 files)
- Extract LayerRenderer, TextLayerRenderer, MediaLayerRenderer, StickerLayerRenderer, DrawingLayerRenderer
- Extract EmptyCanvasState, LayerContextMenu
- Use shared DraggableLayer, layerAccents, ContextMenu

### 2C: Fix + Split CreatorCamera.tsx (1736 → 7 files)
- REMOVE legacy Animated.Value and PanResponder imports
- Migrate all Animated.Value to Reanimated useSharedValue
- Extract FocusReticle, ShutterButton, ControlsRail, GalleryCarousel, RecordingRing, PermissionState
- Use Motion tokens instead of hardcoded spring configs

### 2D: Split DrawingCanvas.tsx (1767 → 4 files)
- Extract BrushPicker, ColorSlider (use shared), colorUtils (use shared)
- Keep Skia rendering, Catmull-Rom smoothing, 6 brush types, undo/redo

### 2E: Split StickerPicker.tsx (1741 → 6 files)
- Extract StickerTabButton, PollForm, QuizForm, QuestionForm, CountdownForm
- Move emoji data to emojiData.ts
- Use shared colorUtils

### 2F: Split TextOverlayCanvas.tsx (1327 → 4 files)
- Extract DraggableText (use shared DraggableLayer), TextEditSheet, FontColorPicker
- ADD more fonts (15+ distinct typefaces, not just Inter weights)
- ADD eyedropper tool
- ADD text stroke effect

### 2G: Split FilterStrip.tsx (1021 → 3 files)
- Extract filterConfig.ts, ColorSlider (use shared)
- Keep Skia ColorMatrix, 10 filters, intensity slider

### 2H: Split BackgroundPicker.tsx (920 → 3 files)
- Extract ColorSlider (use shared), colorUtils (use shared)
- Keep 9 gradient presets, HSL sliders

### 2I: Fix CreatorToolDock.tsx + CreatorStudioShell.tsx
- Replace hardcoded spring configs with Motion tokens
- Remove PanResponder from CreatorStudioShell
- Extract Tooltip, PageMenu, OverflowMenu

### 2J: Clean up dead code + fake features
- Delete CameraCapture.tsx (17-line dead wrapper)
- Either implement real AI cutout in CreatorCutoutSheet or remove the feature
- Fix hardcoded gradient/accent colors across all files → use tokens

---

## WAVE 3: MISSING FEATURES (AFTER ARCHITECTURE IS CLEAN)

- Real-time camera filters (Skia frame processor)
- Pressure sensitivity (Apple Pencil via GestureHandler stylusData)
- Segmented upload for publishing
- Background upload (WorkManager/URLSession)
- Story expiration pipeline
- Prefetch for stories
- More text animations (character-by-character)

---

## VERIFICATION

After all waves:
- [ ] 0 typecheck errors
- [ ] No file > 800 lines (except CreatorAssetPicker which may need 20+ files)
- [ ] No copy-paste patterns (all shared abstractions used)
- [ ] No legacy Animated/PanResponder in any poster/creator file
- [ ] No hardcoded gradient/accent/overlay colors (all tokenized)
- [ ] No fake features
- [ ] No dead code
- [ ] 15+ fonts in text tool
- [ ] All springs from Motion tokens
- [ ] All gestures use GestureHandler
- [ ] All lists use FlashList
- [ ] All filters use Skia ColorMatrix
- [ ] All drawing uses Skia Canvas
- [ ] All haptics use useHaptic with consistent grammar
- [ ] All animations have reduced motion fallbacks
- [ ] All controls ≥44pt with accessibility labels
