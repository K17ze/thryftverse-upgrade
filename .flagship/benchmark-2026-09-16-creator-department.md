# Creator Department Benchmark — vs Snapchat / Instagram / Edits / CapCut

**Date:** 2026-09-16 · **Method:** 5 parallel read-only domain audits + main-agent spot verification + live competitor research (primary docs: Snap Help, Instagram Creators, Meta developer docs; secondary: CapCut guides, press coverage of IG Edits/First Draft) · **Scope:** `frontend/src/creator` (233 files, ~88K lines) + coupled backend contracts.

## Headline score: 68 / 100

Feature breadth is genuinely impressive — this is far past prototype. Upload honesty, gesture architecture, and publish failure handling are flagship-grade pockets. But three independently verified P0s (broken slide-to-lock, misplaced alignment guides, broken draw rendering), a structural timeline liability, ~2.5K lines of dead/gated features, and zero on-device validation keep it clearly below Snap/IG quality.

## Domain scores

| Domain | /100 | Headline |
|---|---|---|
| Capture / camera | 74 | Capture safety engineering senior-grade; signature hold grammar broken at the seam |
| Canvas / layer editing | 72 | UI-thread gesture core flagship-grade; guides render in wrong space; preview-that-commits |
| Timeline / audio / keyframes | 45 | Weakest domain — page-based storage makes duplicate/reorder/delete incorrect; audio stack is a facade |
| Tools / effects / color | 68 | Controls exemplary; draw broken on canvas (P0); "Cutout" over-promises; Poster regressed vs Look |
| Publish / drafts / share | 74 | Upload honesty best-in-class; scheduling built-but-unreachable; no share-out |
| Upload / reliability | 85 | Strongest domain — durable, resumable, honest, reconciled; above observable IG behavior |
| Backend / contracts | 78 | Was publish-dead pre-campaign (missing column + JSONB bug); now aligned; drift risk tamed via passthrough |
| Accessibility | 65 | Broad coverage; wrong layer cycling; no scale/rotate a11y path; no device pass |
| Performance | 60 | Worklet discipline good; shutter/slide-zoom/drawing on JS thread; unprofiled |
| Architecture | 60 | Strong primitives; monoliths (4.7K-line asset picker); Look/Poster grammar divergence |
| Testing / observability | 60 | Good unit suites; mocks masked two publish-killing P0s; no e2e/device validation |

## Verified P0s (independently confirmed this session)

1. **Slide-to-lock defeated by trailing `onPress`** — `CreatorCamera.tsx:1020-1054`: `isRecording → stopRecording()` checked before the long-press guard; RN Pressable fires `onPress` after `onLongPress` release, so lifting the finger after locking kills the take. Signature Snap grammar broken.
2. **Alignment guides in layer-local space** — `CreatorCanvas.tsx:1381`: `AlignmentGuides` mounts inside the dragged layer's rotated/scaled transform (canvas-space values rendered in layer space). `GestureBadge` at :1387 is correctly outside — guides landed on the wrong side of the boundary.
3. **Draw strokes broken on canvas** — `DrawingWorkspace.tsx:559-585` stores raw gesture pixels; `CreatorCanvas.tsx:2652-2661` renders points as normalized 0–1 (`x * width`). Drawn content lands massively off-layer. Emoji-brush stamps never render at all (:2670-2685).
4. **"Cutout" truthfulness violation** — rail hint promises "on-device subject segmentation" (`posterToolRailConfig.ts:308`); `CutoutService.automaticSegment` throws — it delivers a manual brush mask. The code comments say "never fake a cutout" while the label does.

## Structural liabilities

- **Page-based timeline storage** (`TimelineProjector.findMediaLayer` takes first media layer per page): duplicate creates invisible ghost layer; reorder maps clip-index→page-index (breaks when media-less pages exist); delete leaves an empty page gap; split at 10-page cap silently degrades to trim; transition misattributed after split. This is the root of most timeline defects — the fix is a clip-sequence model, not more page surgery.
- **Dead/gated feature mass (~2.5K lines):** green screen (517-line sheet), speed modes, GIPHY, music picker, voiceover, captions module, AudioMixer, sticker pinning, DrawPicker, StickerTray, scheduling UI writer — all built, all unreachable. Capability registry honestly gates backend-less features, but the dead mass lives inside already-oversized files.
- **Monoliths:** CreatorAssetPicker 4735, CreatorCanvas 3370, CreatorCamera 2313, LookComposer 2474, PosterComposer 2746 — 24 files >800 lines vs the 400-line charter cap.
- **Look/Poster divergence:** multi-select, floating menu, SafeZoneOverlay, intensity slider, AI effects, adjust-panel commit semantics — all Look-only or worse on Poster. Two interaction dialects on one canvas.

## What's genuinely flagship

- **Upload honesty** — real byte progress, measured-only ETA, durable jobs, stall/confirm phases, persisted idempotent attempts, unknown-outcome reconciliation. Exceeds observable IG behavior.
- **Gesture core** — worklet pan/pinch/rotate, epoch-guarded multi-drag commit, throttled smart-guide computation, edge haptics, velocity-aware sheets.
- **Capture safety** — permission ownership, recorder lifecycle, token-cancellable countdowns, app-background cleanup, honest mic-degraded recording.
- **Contract honesty (post-fix)** — capability registry is executable truth; unsupported stickers hidden not faked; publish now renders server-side so edits survive to viewers.

## vs each competitor

- **Snapchat:** capture grammar ~matched in breadth (minus dual-cam/boomerang); Timeline Editor ops mostly present but several incorrect; Director-Mode equivalents absent.
- **Instagram Edits:** frame-accurate trim/split/slip present; keyframes/speed curves present but don't preview; no project versions/folders, auto-captions, or voice enhancement; export parity via server render is actually a *strength* (IG Edits renders client-side).
- **CapCut:** tool breadth comparable; our timeline correctness and audio pipeline are well below; their template/depth advantage is matched by our 48-template browser (though previews lack sample imagery).
- **Instagram Reels (in-app):** share-sheet depth (audience, scheduling, cross-post) is our clearest product gap; our reliability engineering is deeper.

## Remaining P1 highlights

Poster effects parity regression (history-spam + missing intensity/AI entry); tap-to-abort countdown unreachable; gallery video thumbs broken; no a11y scale/rotate path; audio stack unwired; no ambient upload surface; scheduling unreachable; scrub position not persisted; no drag frame reorder.

## Confidence & caveats

- Static analysis is thorough; **no ADB device** — the slide-to-lock P0 is inferred from documented RN Pressable semantics and needs on-device confirmation.
- Mocks previously masked real-driver bugs (JSONB parse); unit-green ≠ production-correct.
- Competitor claims sourced from primary docs where possible; some feature claims (CapCut internals) are secondary-source.

## Recommended next waves

1. **Wave P0-fix (days):** slide-to-lock guard, guides hoist to canvas space, draw coordinate normalization + emoji rendering, layout-preview revert, cutout label honesty.
2. **Wave timeline-model (the big one):** migrate pages → clip-sequence model; fixes duplicate/reorder/delete/split-cap/transition-attribution in one stroke.
3. **Wave dead-code sweep:** strip or complete gated features; decompose the 5 monoliths; unify Look/Poster grammar.
4. **Wave device-validation:** ADB gesture pass + TalkBack/VoiceOver + profiling; convert static inferences to verified claims.
