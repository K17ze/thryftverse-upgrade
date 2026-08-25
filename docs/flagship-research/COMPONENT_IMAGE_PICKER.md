# ThryftVerse Flagship Upgrade — Image Picker Component

**Component deep-dive:** photo grid, multi-select, camera integration, thumbnail preview strip, drag-to-reorder, inline editing (crop/rotate/filter).

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
- Native picker (iOS PHPicker / Android Photo Picker)
- Multi-select up to 10 photos
- Thumbnail preview at bottom, in selection order
- Inline editing: crop, filter, adjust after selection
- Camera tab within picker
- 3-column grid, sorted by recent

### iOS PHPicker (2026)
- No photo library permission needed
- Multi-select with order preservation
- Filter by type (images, videos)
- Privacy: app only sees selected photos

### Cross-cutting 2026 consensus
- System picker (PHPicker / Photo Picker) — privacy + no permissions
- Multi-select with thumbnail preview
- Inline editing after selection (crop, rotate, filter)
- Camera integration within picker
- 3-column grid, sorted by recent
- Drag-to-reorder selected photos
- Max selection enforcement

---

## 2. Psychology & Principles

### Capture-first for commerce
For a marketplace, the camera is the primary tool — sellers capture product photos. The picker should open to camera or have a prominent camera button. Gallery-first adds friction.

### Multi-select expectation
In 2026, one-at-a-time selection feels archaic. For listings (5-8 photos), multi-select is essential. The thumbnail strip shows what's been selected and in what order.

### Edit-after-select flow
Users want to edit after selecting, not before. Flow: select → edit → post. Faster than edit-each → select → post.

### Privacy and system picker
Using the system picker means no full library access. The user picks specific photos; the app only sees those. Privacy win + App Store review win.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `creator/CreatorAssetPicker.tsx` | 3821+ | Creator asset picker | ✅ Substantial (monolith) |
| `creator/CreatorCamera.tsx` | 1144+ | Creator camera | ✅ Substantial |
| `creator/tools/MediaBrowser/MediaBrowserSheet.tsx` | 815+ | Media browser | ✅ Substantial |
| `platform/media/mediaTransforms.ts` | 313+ | Media transforms | ✅ Substantial |
| `utils/mediaUploadAsset.ts` | 98+ | Media upload utility | ✅ Exists |

### Dependencies
- `expo-image-picker: ~57.0.10` ✅
- `expo-camera: ~57.0.3` ✅
- `expo-media-library: ~57.0.4` ✅

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No shared ImagePicker component** — CreatorAssetPicker is 3821-line monolith, creator-specific | High |
| 2 | **No inline editing** — no crop/rotate/filter after selection | High |
| 3 | **No thumbnail preview strip** — no bottom strip with selected photos | Medium |
| 4 | **No drag-to-reorder** — can't reorder selected photos | Medium |
| 5 | **No camera in sell flow** — SellScreen uses ImagePicker but not camera | High |
| 6 | **CreatorAssetPicker is too large** — 3821 lines needs decomposition | Medium |
| 7 | **No filter presets** — no product-friendly filters | Low |

---

## 4. Micro Improvements

### M1 — Create shared ImagePicker component
```tsx
interface ImagePickerProps {
  maxSelection: number;       // default 8
  onSelected: (uris: string[]) => void;
  allowCamera: boolean;       // default true
  enableEditing: boolean;     // default true
}
```
Uses expo-image-picker with multi-select + camera. Grid view, thumbnail strip, camera button.

### M2 — Add inline editing
After selection: crop (aspect ratio presets), rotate (90°), filter presets (6), adjust (brightness, contrast, saturation).

### M3 — Add thumbnail preview strip
Bottom strip: 48pt thumbnails, in selection order. Drag to reorder. Tap to remove. "3/8" count.

### M4 — Add camera to sell flow
In SellScreen, "Take Photo" button opens camera (expo-camera). Capture → add to selected.

### M5 — Add drag-to-reorder
Long-press thumbnail to drag to new position. Reanimated 3 + Gesture.Pan.

### M6 — Decompose CreatorAssetPicker
Split 3821-line monolith into: ImagePicker (shared), CameraCapture (shared), MediaBrowser (shared), CreatorAssetPicker (creator-specific wrapper).

---

## 5. Macro Improvements

### A1 — Media component system
- `ImagePicker` — shared picker (multi-select, camera, system picker)
- `ImageEditor` — inline editing (crop, rotate, filter, adjust)
- `ThumbnailStrip` — selected photos with drag-to-reorder
- `CameraCapture` — shared camera component
- `useMediaUpload` — hook with compression + progress

---

## 6. Flagship Acceptance Criteria

- **Shared ImagePicker** — used in sell, creator, profile, reviews
- **Inline editing** — crop, rotate, filter, adjust
- **Thumbnail preview strip** — with drag-to-reorder
- **System picker** — PHPicker / Photo Picker
- **Camera in sell flow** — capture-first
- **Image compression** — 1080p, JPEG 0.8, EXIF stripped
- **Filter presets** — 6 product-friendly filters
- **Max selection enforcement**

### Thumbnail test
At 25% scale, picker shows: 3-column grid of photos, camera button, selected thumbnails at bottom. Grid is media-dominant.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared ImagePicker | Medium | All media surfaces |
| P0 | M4 — Camera in sell flow | Medium | Capture-first sell |
| P1 | M2 — Inline editing | Medium | Post-capture quality |
| P1 | M3 — Thumbnail strip | Low | Selection UX |
| P2 | M5 — Drag-to-reorder | Medium | Cover photo selection |
| P2 | M6 — Decompose CreatorAssetPicker | Medium | Maintainability |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `imagePicker.grid.columns` | 3 | Phone, 4-5 tablet |
| `imagePicker.grid.gap` | 2pt | |
| `imagePicker.grid.thumbnail` | 1:1 | Square |
| `imagePicker.cameraButton.size` | 44pt | |
| `imagePicker.maxSelection` | 8 | Default for listings |
| `thumbnailStrip.height` | 56pt | |
| `thumbnailStrip.thumb.size` | 48pt | |
| `thumbnailStrip.thumb.gap` | Space.xs | |
| `thumbnailStrip.thumb.radius` | Radius.sm | |
| `thumbnailStrip.count.font` | Type.caption | "3/8" |
| `imageEditor.crop.aspectRatios` | ['1:1', '4:5', '16:9', 'free'] | |
| `imageEditor.filter.presets` | 6 | Original, Bright, Warm, Cool, Mono, Vivid |
| `imageEditor.adjust.sliders` | brightness, contrast, saturation | |
| `imageCompression.maxResolution` | 1080p | |
| `imageCompression.quality` | 0.8 | JPEG |
| `imageCompression.stripExif` | true | Privacy |

---

*Generated 2026-08-18. Verified sources: developer.apple.com/videos/play/wwdc2020/10652 (PHPicker: system picker, no permission, multi-select, search, zoom, out-of-process, privacy-first), developer.apple.com/videos/play/wwdc2021/10046 (iOS 15: ordered selection, pre-selecting, PHCloudIdentifier, Limited Photos Library), developer.apple.com/videos/play/wwdc2020/10641 (Limited Photos Library, user controls access), swiftcrafted.dev/article/swiftui-photospicker-ios-26-guide (iOS 26 PhotosPicker: smarter out-of-process host, HDR-aware, VoiceOver cues), alicinaroglu.dev/photosui-picker-vs-photokit (PHPicker no permission, no EXIF, one-shot vs PhotoKit for library apps), github.com/Yummypets/YPImagePicker (Instagram-like: crop, filters, multi-select, video trimming, 2026-04 last push), github.com/SteveJKing/ZLPhotoBrowser (drag/slide selection, editor: draw/crop/sticker/mosaic/filter/adjust, drag-to-sort selected). Production codebase audit: CreatorAssetPicker, CreatorCamera, MediaBrowserSheet, mediaTransforms, expo-image-picker.*
