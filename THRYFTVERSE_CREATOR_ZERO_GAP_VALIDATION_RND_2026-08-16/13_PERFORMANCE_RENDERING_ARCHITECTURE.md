# Performance and Rendering Architecture

## 1. High-frequency rule

No drag/scrub/slider/drawing gesture should require React reconciliation for every frame.

## 2. UI-thread ownership

Use RNGH/Reanimated shared values for:
- layer drag/scale/rotate;
- timeline scrub;
- trim handles;
- sliders;
- color plane cursor;
- brush size.

Commit semantic data once at gesture end.

## 3. Drawing

Current drawing path crosses point updates through JS. Move active path ownership to Skia/worklet-friendly state and commit a stroke in batches/end-of-stroke.

## 4. Sliders

Replace PanResponder implementations with one optimized `CreatorSlider`:
- tap/drag;
- shared value;
- steps/snap;
- zero haptic;
- accessibility increment/decrement.

## 5. Canonical media renderer

Create a render pipeline that consumes:
- source/crop;
- masks;
- effects;
- opacity/blend;
- keyframes;
- temporal visibility.

`CreatorCanvas` currently displays source media directly. This is the highest-value renderer refactor.

## 6. Video editing

- generate 540p/720p proxies;
- retain full-quality original;
- cache frame thumbnails;
- use native video seek/playback;
- full-quality export after edit.

## 7. Timeline

Use one shared time→pixel transform across tracks. Virtualize longer projects and avoid full-resolution thumbnail decoding.

## 8. Memory classes

Profile:
- one 12MP photo;
- six-photo Look;
- 3×1080p video;
- 10-frame Poster;
- 4K source with proxy;
- masked + filtered media.

Measure:
- JS heap;
- native heap;
- GPU memory;
- dropped frames;
- decode latency.

## 9. Upload memory

Never require a large video to exist as one JS Blob for a production uploader. Prefer native/file-stream multipart transfer.

## 10. Device targets

Project targets:
- press feedback same frame;
- 60fps common transforms;
- exploit 120Hz where supported;
- no autosave freeze;
- no full-canvas rerender for simple tool press;
- progressive gallery thumbnail loading.

Test on mid-tier hardware, not just simulator/flagship phone.
