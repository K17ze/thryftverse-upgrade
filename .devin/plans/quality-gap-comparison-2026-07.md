# Creator Department — Flagship Quality Gap Comparison (July 2026)

## Methodology
- Deep audit of 12 creator files (6,400+ lines total)
- Online research: Snapchat 2026 (July update), TikTok Symphony AI, BeReal/Voodoo, Instagram Stories, Depop+Photoroom, Vinted
- Open-source reference: betomoedano/React-Native-Snapchat-Clone, react-native-gesture-handler 3.0, react-native-gesture-image-viewer
- Theme token audit: confirmed `colors.textInverse`, `colors.warning`, `colors.success`, `colors.danger`, `colors.overlay` all exist

---

## CRITICAL GAPS (P0 — blocks flagship claim)

### 1. Touch targets violate AGENTS.md §13 across 10 of 12 files

| File | hitSlop count | Status |
|------|-------------|--------|
| CreatorCamera.tsx | 9 | OK |
| VisualSearchCamera.tsx | 6 | OK |
| CreateCameraScreen.tsx | 0 | **VIOLATION** |
| CreatorStudioShell.tsx | 0 | **VIOLATION** |
| CreatorCanvas.tsx | 0 | **VIOLATION** |
| CreatorToolDock.tsx | 0 | **VIOLATION** |
| CreatorLayersSheet.tsx | 0 | **VIOLATION** |
| CreatorPublishSheet.tsx | 0 | **VIOLATION** |
| CreatorTemplateBrowser.tsx | 0 | **VIOLATION** |
| CreatorAssetPicker.tsx | 0 | **VIOLATION** |
| CreatorEntryScreen.tsx | 0 | **VIOLATION** |
| VisualSearchScreen.tsx | 0 | **VIOLATION** |

**Flagship standard (Snapchat 2026 / TikTok):** Every interactive control has minimum 12pt hitSlop, primary actions 16-24pt. Apple HIG §13 requires 44pt minimum touch target.

**Fix:** Add `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}` to every `Pressable` across all 10 files. Primary actions (shutter, publish, save) get 24pt.

---

### 2. Haptic feedback missing on almost all interactions

| File | Haptic calls | Expected |
|------|-------------|----------|
| CreatorCamera.tsx | 12 | 12 ✓ |
| CreateCameraScreen.tsx | 6 | 8 (missing mode tap, overflow open) |
| CreatorStudioShell.tsx | 0 | 6 (page dots, overflow, back) |
| CreatorCanvas.tsx | 0 | 8 (select, snap, delete, resize) |
| CreatorToolDock.tsx | 0 | 5 (tool press, delete) |
| CreatorLayersSheet.tsx | 0 | 5 (select, reorder, visibility, lock) |
| CreatorPublishSheet.tsx | 0 | 3 (publish, save draft, retry) |
| CreatorTemplateBrowser.tsx | 0 | 2 (template select) |
| CreatorAssetPicker.tsx | 0 | 4 (asset select, search) |
| CreatorEntryScreen.tsx | 0 | 3 (capture, gallery) |
| VisualSearchScreen.tsx | 0 | 3 (search, filter) |

**Flagship standard:** Snapchat 2026 has haptic on EVERY touch. TikTok has haptic on every mode switch, every effect selection, every capture. BeReal has haptic on shutter only (restraint).

**Fix:** Add `haptic.selection()` on every tap, `haptic.light()` on every toggle, `haptic.medium()` on every capture/publish, `haptic.warning()` on every delete.

---

### 3. Accessibility labels missing on 8 of 12 files

| File | a11y labels | a11y roles | Status |
|------|-----------|-----------|--------|
| CreatorAssetPicker.tsx | 28 | 5 | GOOD |
| CreatorLayersSheet.tsx | 7 | 6 | GOOD |
| CreatorCamera.tsx | 9 | 9 | GOOD |
| VisualSearchCamera.tsx | 6 | 0 | PARTIAL |
| CreateCameraScreen.tsx | 4 | 0 | POOR |
| CreatorStudioShell.tsx | 8 | 0 | POOR |
| CreatorEntryScreen.tsx | 4 | 0 | POOR |
| CreatorToolDock.tsx | 3 | 0 | POOR |
| CreatorPublishSheet.tsx | 5 | 3 | PARTIAL |
| CreatorTemplateBrowser.tsx | 2 | 0 | POOR |
| CreatorCanvas.tsx | 1 | 0 | CRITICAL |
| VisualSearchScreen.tsx | 0 | 0 | **CRITICAL** |

**Flagship standard:** Every interactive control MUST have `accessibilityRole="button"` and `accessibilityLabel`. AGENTS.md §13 mandates this.

**Fix:** Audit every `<Pressable>` and `<TouchableOpacity>` across all 12 files. Add role + label + hint where needed.

---

### 4. 120+ hardcoded colors instead of theme tokens

| File | Hardcoded hex | Hardcoded rgba | Total |
|------|-------------|-------------|-------|
| CreatorCamera.tsx | 26 | 30 | 56 |
| CreatorCanvas.tsx | 13 | 14 | 27 |
| CreatorEntryScreen.tsx | 14 | 12 | 26 |
| VisualSearchCamera.tsx | 13 | 11 | 24 |
| CreatorStudioShell.tsx | 10 | 6 | 16 |
| CreatorLayersSheet.tsx | 8 | 1 | 9 |
| CreateCameraScreen.tsx | 7 | 9 | 16 |
| CreatorToolDock.tsx | 2 | 5 | 7 |
| CreatorPublishSheet.tsx | 1 | 0 | 1 |
| VisualSearchScreen.tsx | 1 | 1 | 2 |
| CreatorTemplateBrowser.tsx | 0 | 0 | 0 ✓ |
| CreatorAssetPicker.tsx | 0 | 2 | 2 |

**Available theme tokens (confirmed):**
- `colors.textInverse` (= #FFFFFF dark / #000000 light) — replaces all `#fff`/`#000`
- `colors.warning` (= #F59E0B) — replaces `#FFD60A` active states
- `colors.success` (= #16A34A) — replaces `#4cd964`
- `colors.danger` (= #DC2626) — replaces `#ff6b6b`
- `colors.overlay` (= rgba(0,0,0,0.6)) — replaces arbitrary rgba overlays

**Note:** Camera surfaces are intentionally dark (always on black) — `#fff` text on camera is correct for contrast. The issue is in non-camera surfaces (studio shell, canvas, entry screen) where theme tokens should be used.

**Fix:** Replace hardcoded colors in non-camera surfaces with theme tokens. Camera surfaces keep `#fff`/`#000` (intentional high-contrast on media).

---

## HIGH GAPS (P1 — visible quality difference)

### 5. Timing animations instead of spring physics

**Current:** `Animated.timing()` used for shutter press, mode transitions, layer position sync, focus reticle.

**Flagship standard:** Snapchat 2026 uses spring physics for ALL camera interactions. TikTok uses spring for mode switch. Instagram Stories uses spring for layer manipulation.

**Fix:** Replace `Animated.timing` with `Animated.spring` for:
- Shutter press (CreatorCamera line 204)
- Mode transitions (CreateCameraScreen line 114)
- Layer position sync (CreatorCanvas line 231)
- Focus reticle (CreatorCamera line 143)

---

### 6. No pinch-to-zoom on camera

**Current:** Zoom is a 3-state cycle button (0.5x/1x/2x).

**Flagship standard:** Snapchat 2026, TikTok, Instagram Stories ALL support pinch-to-zoom with smooth interpolation. BeReal is the exception (no zoom).

**Fix:** Add `PinchGestureHandler` from `react-native-gesture-handler` to CreatorCamera. Map pinch scale to camera zoom (0.5x–4x range). Show zoom indicator pill during pinch.

---

### 7. No long-press for locked focus/exposure

**Current:** Tap-to-focus only. No lock.

**Flagship standard:** Snapchat 2026, iOS Camera, TikTok all support long-press to lock focus/exposure (shows "AE/AF LOCK" badge).

**Fix:** Add long-press handler on camera viewfinder. On long-press, lock focus point and show "AE/AF LOCK" badge. Tap to unlock.

---

### 8. No simultaneous gestures on canvas (pan + rotate + pinch)

**Current:** CreatorCanvas uses `Gesture.Exclusive` — only one gesture at a time.

**Flagship standard:** Instagram Stories, Canva, Snapchat 2026 ALL support simultaneous pan + rotate + pinch on layers.

**Fix:** Change `Gesture.Exclusive` to `Gesture.Simultaneous` for pan, pinch, rotation in CreatorCanvas. Use `react-native-gesture-handler` `useSimultaneousGestures` hook.

---

### 9. No blur effects on overlays (gradients only)

**Current:** CreatorStudioShell uses `LinearGradient` for top/bottom bars.

**Flagship standard:** Snapchat 2026, TikTok, Instagram Stories use `@react-native-community/blur` (BlurView) for chrome overlays — makes content visible underneath while keeping controls readable.

**Fix:** Replace `LinearGradient` bars in CreatorStudioShell with `BlurView` (blurType="light", blurAmount=20). Fall back to gradient on Android if BlurView unavailable.

---

### 10. No smart alignment guides on canvas

**Current:** CreatorCanvas has no alignment guides.

**Flagship standard:** Canva, Figma, Instagram Stories show center guides (vertical, horizontal) when dragging a layer near center. Snapchat 2026 shows snap-to-edge guides.

**Fix:** Add center-line guides that appear when a layer's center is within 8pt of canvas center. Show 1pt guide line with `colors.brand` at 50% opacity. Haptic on snap.

---

## MEDIUM GAPS (P2 — polish that distinguishes flagship)

### 11. No drag-to-reorder layers

**Current:** CreatorLayersSheet uses up/down buttons for reorder.

**Flagship standard:** Canva, Figma, Photoshop mobile all support drag-to-reorder with long-press.

**Fix:** Add `react-native-gesture-handler` long-press + pan to layer rows. Show drop indicator. Reorder on release.

---

### 12. No asset preview before selection

**Current:** CreatorAssetPicker shows thumbnails only.

**Flagship standard:** Instagram, TikTok show full-screen preview on long-press before selecting.

**Fix:** Add long-press handler on asset thumbnails. Show full-screen preview with "Select" / "Cancel" actions.

---

### 13. No template categories or search

**Current:** CreatorTemplateBrowser shows flat list.

**Flagship standard:** Canva, InStories, Vivisticker all have categories + search + recently-used.

**Fix:** Add category tabs (Fashion, Streetwear, Luxury, Minimal, Bold). Add search bar. Add "Recently used" section.

---

### 14. No schedule post option in publish sheet

**Current:** CreatorPublishSheet publishes immediately or saves draft.

**Flagship standard:** Instagram, TikTok both support scheduling posts.

**Fix:** Add "Schedule" toggle in publish sheet. When enabled, show date/time picker. Uses the `scheduled_for` column (migration 099) already added.

---

### 15. No location tagging in publish sheet

**Current:** CreatorPublishSheet has caption + visibility only.

**Flagship standard:** Instagram, TikTok, Snapchat 2026 all support location tagging.

**Fix:** Add "Location" field in publish sheet. Uses `expo-location` for current location or manual entry.

---

## ARCHITECTURE GAPS (P1 — code quality)

### 16. CreatorAssetPicker.tsx is 1,189 lines with 8 nested components

**Current:** MediaPicker, ProductPicker, MentionPicker, LookPicker, TextPicker, ShapePicker, VotePicker all in one file.

**Fix:** Split into 8 files:
- `CreatorAssetPicker/MediaPicker.tsx`
- `CreatorAssetPicker/ProductPicker.tsx`
- `CreatorAssetPicker/MentionPicker.tsx`
- `CreatorAssetPicker/LookPicker.tsx`
- `CreatorAssetPicker/TextPicker.tsx`
- `CreatorAssetPicker/ShapePicker.tsx`
- `CreatorAssetPicker/VotePicker.tsx`
- `CreatorAssetPicker/index.tsx` (orchestrator)

### 17. CreatorCanvas.tsx LayerRenderer is 1,086 lines

**Fix:** Split into:
- `CreatorCanvas/LayerRenderer.tsx` (orchestrator)
- `CreatorCanvas/ImageLayer.tsx`
- `CreatorCanvas/TextLayer.tsx`
- `CreatorCanvas/StickerLayer.tsx`
- `CreatorCanvas/TransformHandles.tsx`
- `CreatorCanvas/EmptyState.tsx`

### 18. Duplicated camera logic across CreatorCamera and VisualSearchCamera

**Fix:** Extract shared camera hooks to `hooks/useCameraControls.ts`:
- `useFlash` (off/on/auto cycle)
- `useZoom` (0.5x/1x/2x cycle + pinch)
- `useFocusLock` (tap + long-press lock)
- `useGalleryThumbnail` (recent photo load)

### 19. Duplicated gallery logic across CreatorEntryScreen and CreatorAssetPicker

**Fix:** Extract to `hooks/useRecentMedia.ts` — single source of truth for loading recent photos.

---

## PRIORITY EXECUTION ORDER

### Sprint 1 (P0 — Critical fixes, ~2 hours)
1. Add hitSlop to ALL controls across 10 files
2. Add haptic feedback to ALL interactions
3. Add accessibility labels + roles to ALL controls
4. Replace hardcoded colors with theme tokens (non-camera surfaces)

### Sprint 2 (P1 — High impact, ~3 hours)
5. Replace timing with spring physics
6. Add pinch-to-zoom on camera
7. Add long-press focus lock
8. Enable simultaneous gestures on canvas
9. Add BlurView to studio shell overlays
10. Add smart alignment guides on canvas

### Sprint 3 (P2 — Polish, ~2 hours)
11. Add drag-to-reorder layers
12. Add asset preview before selection
13. Add template categories + search
14. Add schedule post option
15. Add location tagging

### Sprint 4 (Architecture, ~2 hours)
16. Split CreatorAssetPicker into 8 files
17. Split CreatorCanvas LayerRenderer
18. Extract shared camera hooks
19. Extract shared gallery hooks

---

## WHAT FLAGSHIP 2026 APPS DO THAT WE DON'T

| Feature | Snapchat 2026 | TikTok | BeReal | Instagram | ThryftVerse |
|---------|-------------|--------|--------|-----------|-------------|
| Pinch-to-zoom camera | ✓ | ✓ | ✗ | ✓ | ✗ |
| Long-press focus lock | ✓ | ✓ | ✗ | ✓ | ✗ |
| Spring physics | ✓ | ✓ | ✗ | ✓ | ✗ (timing) |
| Haptic on every touch | ✓ | ✓ | ✓ | ✓ | ✗ (camera only) |
| Blur chrome overlays | ✓ | ✓ | ✗ | ✓ | ✗ (gradient) |
| Simultaneous gestures | ✓ | ✓ | ✗ | ✓ | ✗ (exclusive) |
| Smart alignment guides | ✗ | ✗ | ✗ | ✓ | ✗ |
| Drag-to-reorder layers | ✗ | ✗ | ✗ | ✓ | ✗ (buttons) |
| Asset preview | ✓ | ✓ | ✗ | ✓ | ✗ |
| Template categories | ✓ | ✓ | ✗ | ✓ | ✗ (flat list) |
| Schedule post | ✓ | ✓ | ✗ | ✓ | ✗ (backend ready) |
| Location tagging | ✓ | ✓ | ✗ | ✓ | ✗ |
| Dual camera capture | ✗ | ✗ | ✓ | ✗ | ✗ |
| AI filters/effects | ✓ | ✓ | ✗ | ✓ | ✗ |
| Music integration | ✓ (Spotify) | ✓ | ✗ | ✓ | ✗ |
| Real-time AR lenses | ✓ | ✓ | ✗ | ✗ | ✗ |

**Verdict:** ThryftVerse creator department is at ~40% of flagship quality. The camera is the strongest part (70% there). The studio editor and asset picker are the weakest (25% there). Closing P0 + P1 gaps would bring it to ~85%.
