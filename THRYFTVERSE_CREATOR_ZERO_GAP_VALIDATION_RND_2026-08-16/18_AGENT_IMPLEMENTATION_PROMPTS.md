# Agent Implementation Prompts — Zero-Gap Closure

Run sequentially. Every agent must read `AGENTS.md`, `Design.md`, this pack and the live branch before changing code.

---

## Prompt 01 — Canonical creator control system

Reconstruct creator buttons/glyphs/sliders/active states.

Must:
- create purpose-built CreatorGlyph for specialized editorial concepts;
- migrate ContextToolRail to CreatorToolButton;
- implement idle/pressed/selected/disabled/loading;
- 48pt preferred targets;
- adaptive contrast over media;
- remove new ad-hoc PanResponder sliders;
- capture screenshot matrix.

Do not add decorative glass/gold as a shortcut to premium.

---

## Prompt 02 — Professional shared color engine

Create one creator color module with:
- SV plane;
- hue;
- alpha;
- HEX #RGB/#RRGGBB/#RRGGBBAA;
- numeric fields;
- eyedropper;
- recents;
- project palette;
- media palette;
- gradient stops.

Migrate text fill/background/stroke/shadow, drawing, shapes, background, gradients and configurable sticker themes. Delete duplicate HSL/HEX helpers.

---

## Prompt 03 — Repair text schema truth

Replace coarse `textEffect` strength UI with real:
- stroke width/color;
- shadow blur/offset/color;
- background padding/radius/color;
- typography properties.

Add migration and editor/viewer parity fixtures. Thin/Thick and Soft/Strong must render materially differently and persist.

---

## Prompt 04 — Canonical CreatorCanvas media pipeline

This is a P0 architecture prompt.

`CreatorCanvas` must consume:
- crop;
- effects;
- maskRef;
- opacity/blend;
- keyframes;
- temporal visibility;
- external playback clock.

Editor, Preview and Poster/Look viewer must use the same evaluator. Add deterministic fixtures.

---

## Prompt 05 — Native effects

Delete CSS-filter production dependency.

Implement:
- Skia matrix/LUT presets;
- native thumbnail previews;
- intensity;
- adjustments;
- before/after;
- proxy video preview;
- export/viewer parity.

---

## Prompt 06 — Make Auto truthful

Either rename static constants to `Enhance`, or implement image-aware analysis using histogram/luminance/clipping/white-balance/saturation. Never call constants intelligent.

---

## Prompt 07 — Canonical Poster timeline/playback engine

Move timeline source of truth into composition vNext.

Fix:
- clip ranges;
- overlay time ranges;
- trim/speed math;
- split/reorder;
- one playback clock;
- temporal visibility;
- transitions;
- keyframes.

The canvas Video player must follow timeline play/pause/seek, not auto-loop independently.

---

## Prompt 08 — Real waveform/audio

Implement native/sample waveform extraction + cache, music/source volume, trim/offset, fades and voiceover. No fabricated waveform.

---

## Prompt 09 — Production cutout

Select exactly one segmentation provider and install/configure it.

Implement:
- capability matrix;
- segmentation;
- mask asset;
- real Keep/Erase/Restore rasterization;
- feather/invert;
- canonical canvas compositing;
- transparent output tests.

Remove speculative module probing after the provider choice.

---

## Prompt 10 — Canonical ProjectStore

Make filesystem project package the source of truth.

Requirements:
- proper `Paths.document` path;
- robust checkpoint/atomic semantics;
- Zod project schema;
- explicit migration chain;
- never stamp unknown version current;
- camera/gallery/replace all import project-owned media;
- video proxies/thumbs/waveform assets;
- AsyncStorage index only.

---

## Prompt 11 — Genuine resumable uploader

Replace whole-Blob PUT with S3 multipart/TUS/provider resumable.

Persist:
- upload session;
- ranges/parts;
- ETags;
- bytes;
- retries.

Implement real progress, MIME detection, background continuity, kill/relaunch resume and idempotency.

---

## Prompt 12 — Finish CreatorAssetPicker decomposition

Extract remaining Media/Product/Mention/Look/Shape/Poll/Quiz/Question/GIF/Link/Location/etc. domains. Reduce CreatorAssetPicker to a temporary compatibility adapter, then remove it.

---

## Prompt 13 — Camera parity

Validate/implement:
- hands-free;
- longer source capture;
- speed capture;
- exposure where safe;
- green screen architecture;
- capability/lens truth;
- multi-clip direct timeline handoff.

---

## Prompt 14 — Drawing + sticker parity

Drawing:
- UI-thread path;
- pinch brush size;
- palette switching;
- emoji brush.

Stickers:
- mature categories/search;
- Auto Sticker strategy;
- object tracking/pinning R&D and implementation plan.

---

## Prompt 15 — Caption pipeline

Build speech-to-text captions with editable transcript, canonical timing, styles, safe zones and publish validation.

---

## Prompt 16 — Final art-direction pass

Only after truth P0s are closed. Tune spacing, glyph weight, scrims, selected state, sheet detents, typography, empty/loading/error states from **real device evidence**, not code review taste.

---

## Prompt 17 — Zero-gap verification

Run `15_ZERO_GAP_COMPETITIVE_LEDGER.md` row by row. Every red requires implementation or explicit scope decision. Every yellow requires device/output evidence. Every unverified P0 blocks the zero-gap claim.
