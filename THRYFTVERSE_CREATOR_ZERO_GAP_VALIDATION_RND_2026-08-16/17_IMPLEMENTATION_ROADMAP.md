# Zero-Gap Implementation Roadmap

## Z0 — Truth correction
Before new features:
- rename static Auto Adjust → Enhance unless analysis is implemented;
- call upload `retryable` rather than `resumable` until transport supports ranges/parts;
- hide Cutout when provider absent;
- remove or implement disabled Background Image;
- add this competitive ledger to the repo.

## Z1 — Creator control system
Build/migrate:
- CreatorGlyph;
- CreatorIconButton;
- CreatorToolButton;
- CreatorSlider;
- CreatorSegmentControl;
- CreatorColorPicker.

Exit: consistent buttons/icons/slider/color, 44–48pt targets, true active state.

## Z2 — Color + text fidelity
- exact shared color;
- gradients;
- text fill/background/stroke/shadow;
- schema migration;
- renderer parity.

Exit: every visible text/color control maps to exact persisted/rendered values.

## Z3 — Canonical native media renderer
- source/crop;
- effect graph;
- masks;
- keyframes;
- temporal visibility;
- playback integration.

Exit: one render path powers editor, preview and viewer/export semantics.

## Z4 — Native effects
- real matrices/LUTs;
- Skia/native previews;
- intensity;
- before/after;
- video proxy preview.

## Z5 — Timeline canonicalization
- vNext temporal schema;
- one playback clock;
- clip source ranges;
- overlay ranges;
- transitions/keyframes;
- migrations.

## Z6 — Audio
- real waveform;
- music/source volume;
- fades;
- voiceover;
- ducking optional.

## Z7 — Production cutout/mask
- installed provider;
- alpha-mask asset;
- real brush refinement;
- renderer integration;
- device capability matrix.

## Z8 — ProjectStore source of truth
- stable project from session start;
- import all assets;
- schema validation;
- explicit migrations;
- robust checkpoint/recovery;
- AsyncStorage index only.

## Z9 — Genuine resumable/background upload
- multipart/TUS;
- real byte progress;
- correct MIME;
- background transfer;
- kill/relaunch resume;
- idempotency.

## Z10 — Capture/sticker/caption parity
- hands-free;
- longer/speed capture;
- green screen;
- auto captions;
- emoji brush;
- object pin/tracking R&D.

## Z11 — 2026 AI creative gap
After deterministic editor is strong:
- localized generative edit;
- object removal;
- generative fill;
- style/effect transformations;
- optional prompt-assisted composition.

## Z12 — Device flagship QA
No 9/10 claim until the real-device ledger is closed with screenshots, recordings and metrics.
