# 41 — Image Picker & Gallery: Flagship Research Report

> **Department:** Image picker, multi-select gallery, camera roll, image editing, crop/rotate/filter, camera capture, media browser
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Instagram · Snapchat · iOS Photos · Android Google Photos
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's image picker is the benchmark for social apps:
- **Native picker** — uses iOS PHPicker / Android Photo Picker (system-level, no permissions needed)
- **Multi-select** — select up to 10 photos for a carousel post
- **Thumbnail preview** — selected photos show as thumbnails at the bottom
- **Inline editing** — crop, filter, adjust after selecting, before posting
- **Camera tab** — switch to camera within the picker
- **Recent first** — photos sorted by most recent
- **Grid view** — 3-column grid on phone, 4-5 on tablet

### Snapchat (2026)
Snapchat's camera-first approach:
- **Camera as default** — opens to camera, not gallery
- **Multi-snap** — take multiple photos in sequence
- **Filters/lenses** — AR filters applied in real-time
- **Quick edit** — crop, text, draw, sticker after capture
- **Gallery access** — swipe up from camera to access gallery

### iOS Photos Picker (2026)
Apple's PHPicker (iOS 14+):
- **No photo library permission needed** — system picker handles access
- **Multi-select** — configurable max selection
- **Filter by type** — images, videos, live photos
- **Selection order** — preserves selection order
- **Privacy** — app only sees selected photos, not the full library

### Cross-cutting 2026 consensus
- **System picker** — use iOS PHPicker / Android Photo Picker (privacy + no permissions)
- **Multi-select** — select multiple photos with order
- **Thumbnail preview** — selected photos as thumbnails
- **Inline editing** — crop, rotate, filter after selection
- **Camera integration** — switch between camera and gallery
- **Grid view** — 3-column grid, sorted by recent
- **Max selection** — configurable (typically 5-10)
- **Loading state** — progressive loading of thumbnails

---

## 2. Psychology & Principles

### The capture-first principle
For a social-commerce app, the camera is the primary tool — sellers capture product photos, creators capture looks. The image picker should open to the camera by default (Snapchat pattern) or have a prominent camera button (Instagram pattern). Making the user navigate to the gallery first adds friction.

### The multi-select expectation
In 2026, users expect to select multiple photos at once — picking one at a time feels archaic. For listings (which need 5-8 photos), multi-select is essential. The thumbnail preview at the bottom shows what's been selected and in what order.

### The edit-after-select flow
Users want to edit photos after selecting them, not before. The flow is: select → edit → post. This is faster than: edit each photo → select → post. The 2026 standard: after selection, show an edit screen with crop, rotate, and filter options.

### Privacy and the system picker
Using the system picker (PHPicker / Photo Picker) means the app doesn't need full photo library access. The user picks specific photos, and the app only sees those. This is a privacy win and an App Store review win. The 2026 standard: always use the system picker, never build a custom gallery that requires full library access.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Image picker/gallery files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `creator/CreatorAssetPicker.tsx` | 3821+ | Creator asset picker | ✅ Substantial |
| `creator/CreatorCamera.tsx` | 1144+ | Creator camera | ✅ Substantial |
| `creator/tools/MediaBrowser/MediaBrowserSheet.tsx` | 815+ | Media browser | ✅ Substantial |
| `creator/tools/MediaBrowser/index.ts` | — | Media browser exports | ✅ Exists |
| `creator/camera/GreenScreenSheet.tsx` | 122+ | Green screen | ✅ Exists |
| `creator/camera/CameraEffectPreview.tsx` | — | Camera effect preview | ✅ Exists |
| `components/VisualSearchCamera.tsx` | 209+ | Visual search camera | ✅ Exists |
| `utils/mediaUploadAsset.ts` | 98+ | Media upload utility | ✅ Exists |
| `platform/media/mediaTransforms.ts` | 313+ | Media transforms | ✅ Substantial |
| `hooks/useProfileMediaUpload.ts` | 138+ | Profile media upload | ✅ Exists |
| `components/look/LookMediaComposer.tsx` | 82+ | Look media composer | ✅ Exists |
| `components/poster/MultiPhotoCollage.tsx` | — | Multi-photo collage | ✅ Exists |

### What exists (genuinely substantial)
1. **CreatorAssetPicker** — 3821-line asset picker. This is a **massive** component — it handles media selection, camera roll, multi-select, and more for the creator tools.
2. **CreatorCamera** — 1144-line camera component with capture, effects, and more.
3. **MediaBrowserSheet** — 815-line media browser sheet.
4. **mediaTransforms** — 313-line media transformation utility (resize, compress, format).
5. **mediaUploadAsset** — 98-line media upload utility.
6. **useProfileMediaUpload** — 138-line hook for profile photo uploads.
7. **LookMediaComposer** — 82-line media composer for looks.
8. **MultiPhotoCollage** — multi-photo collage component.
9. **VisualSearchCamera** — 209-line camera for visual search.

### Dependencies (from package.json)
- `expo-camera: ~57.0.3` ✅
- `expo-image-picker: ~57.0.10` ✅
- `expo-media-library: ~57.0.4` ✅

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No shared ImagePicker component** — CreatorAssetPicker is 3821 lines but creator-specific, not used in sell flow | High |
| 2 | **No inline editing after selection** — no crop/rotate/filter after picking photos | High |
| 3 | **No multi-select thumbnail preview** — no bottom thumbnail strip showing selected photos | Medium |
| 4 | **No system picker (PHPicker)** — may use custom gallery requiring full library access | Medium |
| 5 | **No camera in sell flow** — SellScreen uses ImagePicker but not camera for capture | High |
| 6 | **No image compression before upload** — mediaTransforms exists but may not be applied everywhere | Medium |
| 7 | **No filter presets** — no pre-defined filter presets for product photos | Low |
| 8 | **No drag-to-reorder** — can't reorder selected photos by dragging | Medium |
| 9 | **No max selection enforcement** — no visual indicator of max photos | Low |
| 10 | **CreatorAssetPicker is too large** — 3821 lines is a monolith, needs decomposition | Medium |

---

## 4. Micro Improvements

### M1 — Create shared ImagePicker component
Extract from CreatorAssetPicker into a reusable component:
```tsx
interface ImagePickerProps {
  maxSelection: number;       // default 8
  onSelected: (uris: string[]) => void;
  allowCamera: boolean;       // default true
  enableEditing: boolean;     // default true
}
```
Uses expo-image-picker with `launchImageLibrary` (multi-select) and `launchCamera`. Shows grid, multi-select, thumbnail preview, camera button.

### M2 — Add inline editing after selection
After selection, show an edit screen with:
- **Crop** — aspect ratio presets (1:1, 4:5, 16:9, free)
- **Rotate** — 90° rotate left/right
- **Filter presets** — 5-6 product-friendly filters (Original, Bright, Warm, Cool, Mono)
- **Adjust** — brightness, contrast, saturation sliders

### M3 — Add multi-select thumbnail preview
Bottom strip showing selected photos as 48pt thumbnails, in selection order. Drag to reorder. Tap to remove. Shows "3/8" count.

### M4 — Use system picker (PHPicker)
Use expo-image-picker's `launchImageLibraryAsync` with `allowsMultipleSelection: true`. This uses the iOS PHPicker / Android Photo Picker — no full library permission needed. Privacy win + App Store review win.

### M5 — Add camera to sell flow
In SellScreen, add a "Take Photo" button that opens the camera (expo-camera). Capture → add to selected photos. Allows sellers to capture product photos directly in the sell flow without leaving to the camera app.

### M6 — Add image compression before upload
Apply `mediaTransforms` to all selected images before upload:
- Resize to max 1080p (longest edge)
- Compress to JPEG 0.8 quality
- Strip EXIF metadata (privacy)
- Generate thumbnail (200pt) for feed preview

### M7 — Add drag-to-reorder
In the thumbnail preview strip, long-press a thumbnail to drag it to a new position. Reorder updates the selection order. Uses Reanimated 3 + Gesture.Pan.

---

## 5. Macro Improvements

### A1 — Unified media pipeline
Create a single media system:
- `ImagePicker` — shared picker component (multi-select, camera, system picker)
- `ImageEditor` — inline editing (crop, rotate, filter, adjust)
- `ThumbnailStrip` — selected photos preview with drag-to-reorder
- `CameraCapture` — shared camera component (capture, flash, switch)
- `useMediaUpload` — hook for upload with compression + progress
- `mediaTransforms` — already exists, extend with filter presets

### A2 — Capture-first sell flow
The sell flow should be capture-first:
1. **Open sell** → camera opens immediately
2. **Capture 5-8 photos** → multi-snap mode, tap shutter for each
3. **Edit** → crop, filter, adjust each photo
4. **Reorder** → drag thumbnails to set cover photo
5. **Details** → enter title, price, description
6. **Publish** → compressed upload with progress

---

## 6. Flagship Acceptance Criteria

- **Shared ImagePicker component** — used in sell, creator, profile, reviews
- **Inline editing** — crop, rotate, filter, adjust after selection
- **Multi-select thumbnail preview** — bottom strip with drag-to-reorder
- **System picker** — PHPicker / Photo Picker (no full library access)
- **Camera in sell flow** — capture-first, not gallery-first
- **Image compression** — 1080p, JPEG 0.8, EXIF stripped
- **Filter presets** — 5-6 product-friendly filters
- **Max selection enforcement** — visual indicator
- **Drag-to-reorder** — long-press to reorder thumbnails
- **Accessibility** — VoiceOver labels for all controls

### Thumbnail test
At 25% scale, the image picker must show: a 3-column grid of photos, a camera button, and selected thumbnails at the bottom. The grid must be media-dominant (photos dominate, not chrome).

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared ImagePicker | Medium | All media surfaces |
| P0 | M5 — Camera in sell flow | Medium | Capture-first sell |
| P1 | M2 — Inline editing | Medium | Post-capture quality |
| P1 | M6 — Image compression | Low | Upload performance |
| P1 | M3 — Thumbnail preview | Low | Selection UX |
| P2 | M4 — System picker | Low | Privacy |
| P2 | M7 — Drag-to-reorder | Medium | Cover photo selection |
| P3 | A1 — Unified media pipeline | High | All media surfaces |
| P3 | A2 — Capture-first sell flow | High | Sell UX |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `imagePicker.grid.columns` | 3 | Phone, 4-5 on tablet |
| `imagePicker.grid.gap` | 2pt | Between thumbnails |
| `imagePicker.grid.thumbnail` | 1:1 | Square thumbnails |
| `imagePicker.cameraButton.size` | 44pt | Control.touchable |
| `imagePicker.maxSelection` | 8 | Default for listings |
| `thumbnailStrip.height` | 56pt | Bottom strip |
| `thumbnailStrip.thumb.size` | 48pt | Selected photo |
| `thumbnailStrip.thumb.gap` | Space.xs | Between thumbnails |
| `thumbnailStrip.thumb.radius` | Radius.sm | |
| `thumbnailStrip.count.font` | Type.caption | "3/8" |
| `imageEditor.crop.aspectRatios` | ['1:1', '4:5', '16:9', 'free'] | |
| `imageEditor.filter.presets` | 6 | Original, Bright, Warm, Cool, Mono, Vivid |
| `imageEditor.adjust.sliders` | brightness, contrast, saturation | |
| `imageCompression.maxResolution` | 1080p | Longest edge |
| `imageCompression.quality` | 0.8 | JPEG quality |
| `imageCompression.stripExif` | true | Privacy |
| `imageCompression.thumbnailSize` | 200pt | Feed preview |

---

*Generated 2026-08-18. Verified sources: developer.apple.com/videos/play/wwdc2020/10652 (PHPicker: system picker, no permission needed, multi-select, search, zoom, out-of-process, privacy-first), developer.apple.com/videos/play/wwdc2021/10046 (iOS 15: ordered selection, pre-selecting assets, PHCloudIdentifier, Limited Photos Library), developer.apple.com/videos/play/wwdc2020/10641 (Limited Photos Library, user controls which photos app can access), swiftcrafted.dev/article/swiftui-photospicker-ios-26-guide (iOS 26 PhotosPicker: same API shape, smarter out-of-process host, HDR-aware transfers, VoiceOver cues), alicinaroglu.dev/photosui-picker-vs-photokit (PHPicker no permission, can't access EXIF, one-shot picking vs PhotoKit for library apps), github.com/Yummypets/YPImagePicker (Instagram-like picker: library/photo/video, crop, filters, multi-select, video trimming, 2026-04 last push), github.com/Syafiqq/FMPhotoPicker (multi-select, filter, crop, force crop, batch selection), github.com/SteveJKing/ZLPhotoBrowser (WeChat-like: drag/slide selection, image editor draw/crop/sticker/mosaic/filter/adjust, multi-language, selected index, drag-to-sort). Production codebase audit: CreatorAssetPicker, CreatorCamera, MediaBrowserSheet, mediaTransforms, mediaUploadAsset, expo-image-picker, expo-camera.*
