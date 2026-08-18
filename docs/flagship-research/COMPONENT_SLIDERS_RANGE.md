# ThryftVerse Flagship Upgrade — Sliders & Range Controls

**Component deep-dive:** every slider, range picker, scrubber, and seek bar in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's price range filter uses a dual-thumb range slider with a filled track between the thumbs. The current min/max values are displayed as labels above the thumbs. The thumbs are 28pt circles with a subtle shadow. Haptic feedback fires on thumb release. eBay's lesson: **range sliders make price filtering tactile and immediate — typing min/max into text fields is the 2020 pattern.**

### Pinterest (2026)
Pinterest's filter sliders use a single-thumb slider for "similarity" and "popularity" thresholds. The track is thin (4pt), the thumb is 28pt, and the fill color is brand red. A label above the slider shows the current value ("Similar: High"). Pinterest's lesson: **sliders for subjective thresholds (similarity, relevance) are more intuitive than discrete options.**

### Cross-cutting 2026 consensus
- **Gesture.Pan + Reanimated** is the 2026 standard for sliders — PanResponder is the legacy pattern.
- **28pt thumb** with shadow for visibility against any background.
- **4pt track** for thin sliders, 8pt for prominent ones.
- **Haptic on release** (not on every drag tick) — selection haptic when the user lifts their finger.
- **Value labels** above the thumb or at the ends of the track.
- **Range sliders** (dual-thumb) for min/max selection — not two separate text inputs.
- **Accessibility:** `accessibilityRole="adjustable"` with increment/decrement actions.

---

## 2. Psychology & Principles

### Direct manipulation
Sliders are the purest form of direct manipulation — the user grabs the value and drags it. This creates a stronger sense of control than typing a number or selecting from a dropdown. The feedback loop is immediate: drag → value changes → visible result. This immediacy is why sliders feel more "premium" than text inputs for continuous values.

### Haptic confirmation
The haptic on release confirms the user's final value selection. Without it, the slider feels "floaty" — the user isn't sure when the value is committed. The haptic says "this is your final value." During the drag, no haptic is needed (it would be too noisy).

### Range visualization
A range slider visualizes the selected range as a filled track between two thumbs. This is more informative than two text inputs because the user sees the relationship between min and max — the width of the fill communicates the range size at a glance.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Slider components (14 files)

| File | Lines | Type | Gesture System | Haptic |
|------|-------|------|----------------|--------|
| `components/poster/shared/ColorSlider.tsx` | 790 | Hue/Sat/Size/Generic | Gesture.Pan | ✅ 60ms debounce |
| `creator/controls/CreatorSlider.tsx` | 393 | Generic creator slider | Gesture.Pan | ✅ 80ms debounce |
| `creator/color/HueSlider.tsx` | 187 | Hue (0-360°) | Gesture.Pan | ✅ |
| `creator/color/AlphaSlider.tsx` | 275 | Alpha (0-1) | Gesture.Pan | ✅ |
| `creator/poster/tools/AudioFadeControls.tsx` | ~285 | Audio fade | **PanResponder** | ✅ |
| `creator/poster/tools/FreezeFramePicker.tsx` | ~419 | Freeze frame | **PanResponder** | ✅ |
| `components/poster/drawing/SizePickerPanel.tsx` | 130 | Brush size | Shared SizeSlider | ✅ |
| `components/poster/filters/FilterStrip.tsx` | ~472 | Filter intensity | Reanimated worklet | ✅ 80ms debounce |
| `creator/poster/timeline/TimelineToolbar.tsx` | ~376 | Speed/volume | Gesture.Pan | ✅ |
| `components/commerce/detail/MakeOfferSheet.tsx` | ~660 | Offer price | **PanResponder** | ✅ |
| `components/sell/SmartSellCard.tsx` | ~215 | Price range | Custom | ✅ |
| `creator/surfaces/CutoutPreviewSheet.tsx` | ~1035 | Edge softness | **PanResponder** | ❌ Missing |
| `creator/look/BackgroundSheet.tsx` | ~779 | Blur | **PanResponder** | ❌ Missing |
| `creator/tools/captions/CaptionEditorSheet.tsx` | ~1276 | Caption offset | **PanResponder** | ❌ Missing |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No range slider (dual-thumb)** — price range filters use text inputs, not a slider | FilterScreen, VisualSearchScreen | High |
| 2 | **No video seek bar/scrubber** — video playback has no interactive seek | Video screens | High |
| 3 | **5 components still use PanResponder** instead of Gesture.Pan (AGENTS.md §17 violation) | AudioFadeControls, FreezeFramePicker, CutoutPreviewSheet, BackgroundSheet, CaptionEditorSheet | Medium |
| 4 | **3 sliders missing haptic feedback** on release | CutoutPreviewSheet, BackgroundSheet, CaptionEditorSheet | Medium |
| 5 | **Inconsistent thumb sizes** — 28pt (Color), 24pt (Hue/Alpha), 16pt (Background) | Multiple files | Medium |
| 6 | **Missing value labels** on some sliders | HueSlider, AlphaSlider, AudioFadeControls | Low |
| 7 | **No slider library installed** — all custom (no @react-native-community/slider) | package.json | Low |
| 8 | **Price range uses text inputs** instead of slider | FilterScreen:724-754, VisualSearchScreen:524-539 | High |
| 9 | **Hardcoded values** — HUE_SEGMENTS=12, TRACK_HEIGHT=4, THUMB_SIZE=28 | ColorSlider, CreatorSlider | Low |
| 10 | **Missing reduced motion** on some PanResponder sliders | CutoutPreviewSheet, BackgroundSheet, CaptionEditorSheet | Medium |

---

## 4. Micro Improvements

### M1 — Create RangeSlider component
Build a dual-thumb range slider using Gesture.Pan + Reanimated for price range filters. Show min/max labels above thumbs. Haptic on release.

### M2 — Migrate PanResponder sliders to Gesture.Pan
Update AudioFadeControls, FreezeFramePicker, CutoutPreviewSheet, BackgroundSheet, CaptionEditorSheet to use `react-native-gesture-handler` Gesture.Pan per AGENTS.md §17.

### M3 — Add haptic feedback to missing sliders
Add selection haptic on thumb release to CutoutPreviewSheet, BackgroundSheet, CaptionEditorSheet.

### M4 — Standardize thumb size
Use 28pt for all sliders (matching ColorSlider and CreatorSlider). Extract to `Control.sliderThumb` token.

### M5 — Add value labels to all sliders
Show current value above the thumb or at track ends. Format: "£45" for price, "50%" for intensity, "2.5s" for duration.

### M6 — Create video seek bar component
Build a scrubber with: draggable thumb, buffered track (lighter fill ahead of current position), time labels (current / total), tap-to-seek.

### M7 — Replace price range text inputs with RangeSlider
In FilterScreen and VisualSearchScreen, replace the min/max TextInput fields with a RangeSlider component.

---

## 5. Macro Improvements

### A1 — Slider component system
Create a unified slider family:
- `Slider` — single-thumb (price threshold, intensity, blur)
- `RangeSlider` — dual-thumb (price min/max, date range)
- `Scrubber` — video/audio seek bar with buffered track
- `GradientSlider` — hue/alpha with gradient track (already exists in ColorSlider)

All share: Gesture.Pan, 28pt thumb, 4pt track, haptic on release, value labels, reduced motion, accessibility.

---

## 6. Flagship Acceptance Criteria

- **RangeSlider** component for price min/max filters
- **Scrubber** component for video/audio seek
- **All sliders use Gesture.Pan** (no PanResponder)
- **Haptic on release** on all sliders
- **28pt thumb** consistently
- **Value labels** on all sliders
- **Reduced motion** support
- **Accessibility** — `adjustable` role with increment/decrement

### Thumbnail test
At 25% scale, a slider must show: the track (thin line), the fill (colored portion), and the thumb (circle). The fill proportion must be legible.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — RangeSlider component | Medium | Price filters |
| P0 | M7 — Replace price text inputs | Low | Filter UX |
| P1 | M6 — Video seek bar | Medium | Video playback |
| P1 | M2 — Migrate PanResponder | Medium | Gesture consistency |
| P1 | M3 — Haptic on missing sliders | Low | Haptic consistency |
| P2 | M4 — Standardize thumb size | Low | Visual consistency |
| P2 | M5 — Value labels | Low | UX clarity |
| P3 | A1 — Full slider system | High | All slider surfaces |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `slider.thumb.size` | 28pt | Consistent |
| `slider.thumb.radius` | Radius.full | Circle |
| `slider.thumb.shadow` | elevation.sm | Visibility |
| `slider.track.height` | 4pt (thin), 8pt (prominent) | |
| `slider.track.color` | colors.surfaceAlt | Unfilled |
| `slider.fill.color` | colors.brand | Filled |
| `slider.haptic` | selection on release | Not during drag |
| `slider.label.format` | Context-dependent (£, %, s) | |
| `slider.gesture` | Gesture.Pan | Not PanResponder |
| `slider.accessibilityRole` | `adjustable` | ARIA |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay/Pinterest filter patterns, AGENTS.md §17 (Gesture.Pan).*
