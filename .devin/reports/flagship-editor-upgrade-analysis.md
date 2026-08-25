# ThryftVerse Creator Studio — Flagship Convergence Research and Implementation Blueprint

**Research cut-off:** 24 August 2026  
**Repository snapshot:** `ab0b99d8f8ea54c0f156fa4ae39b8c99fe6716ce`; revalidated against the 24 August 2026 working tree  
**Scope:** camera entry, Poster, Look, Moodboard, asset selection, media processing, composition rendering, publication, backend persistence, playback, accessibility, observability  
**Status:** research and implementation blueprint; no product code was changed by this report  
**Quality policy:** `AGENTS.md`, `Design.md`, anti-AI design rules, upload-department and visual-convergence workflows

---

## 0. Executive verdict

The previous version of this report diagnosed the creator department as a token-and-material problem and recommended more blur, glass, springs, pills, and rounded chrome. That diagnosis was too shallow and would have increased the exact AI-made appearance ThryftVerse is trying to remove.

The creator department is not blocked by a lack of visual effects or an old framework. The repository already uses a current native stack:

- Expo `57.0.15`
- React Native `0.86.2`
- React `19.2.3`
- React Native Skia `2.6.2`
- Reanimated `4.5.1`
- Gesture Handler `2.32.0`
- VisionCamera `5.2.3`
- `expo-video` `57.0.2`
- `@callstack/liquid-glass` `0.8.0`

The flagship gap is **semantic and architectural convergence**:

1. The camera, editor, viewer, serializer, upload pipeline, and backend do not yet share one capability truth.
2. Tap-to-focus is now wired to VisionCamera on devices that report focus support. It remains a native-validation item, not a missing implementation.
3. Camera and microphone permissions now have a dedicated owner and the recorder can be configured without audio. One important semantic defect remains: when microphone permission is granted during the first long-press, the already-rendered recorder configuration is still muted, so the user must begin a second recording to obtain sound.
4. Image effects render through Skia, while video effects are stored but not rendered by the current native video path; there is no authoritative cross-platform export engine in this department.
5. Poster publication no longer performs the previously observed lossy sticker coercion. Unsupported interactive semantics are withheld rather than relabelled, which is the correct fail-closed policy; the remaining requirement is an executable parity test for every layer type.
6. Moodboard no longer uses the earlier in-memory demo fallback in its canonical service. It now fails honestly and uses real authenticated sources, but its backend still stores a narrow item model instead of the full authored scene, so crash recovery, revisions, render receipts and atomic publication remain incomplete.
7. Very large orchestration files still make state ownership and interaction truth hard to verify: `CreatorAssetPicker.tsx` is about 4,874 lines, `PosterComposerScreen.tsx` 3,300, `CreatorCanvas.tsx` 2,961, `LookComposerScreen.tsx` 2,276, and `CreatorPublishSheet.tsx` 1,903.

There is meaningful strong work already in place. Effects have been moved out of the persistent camera mode rail; single capture defaults to direct-to-editor; multi-capture is opt-in; Poster and Look have distinct composition owners; the contextual tool rail limits visible actions to four; camera-to-editor pinned-media transitions have real destination geometry; Look and Poster publication persist versioned composition documents; backend creation uses stable IDs and payload hashes; and the publish sheet models unknown network outcomes rather than fabricating success.

The correct strategy is therefore not “redesign everything.” It is:

> Preserve the good interaction structure, remove dishonest capability claims, establish one scene/render/publication contract, bring Moodboard onto the same durable creative foundation, then complete native visual validation and performance closure.

### Deployment verdict

The creator department is **not production-ready as a whole**. Look and Poster publication have a credible base, but the following are release blockers:

- P0: the first video intent after granting microphone access can silently produce a muted recorder configuration; permission grant and recorder reconfiguration must be one deterministic state transition;
- P0: edit/preview/publish/view/export capability parity is not enforced;
- P0: unsupported Poster layers need executable edit → persist → view parity fixtures so the closed coercion defect cannot regress;
- P0: Moodboard cannot yet persist a full versioned composition, durable revision history, render receipt, or atomic media bindings;
- P0: native device validation has not proved geometry, crop parity, accessibility, or frame performance across the target device matrix.

No amount of glass, icon polish, or Skia usage percentage can override these blockers.

### 0.1 Working-tree revalidation delta — 24 August 2026

This upgrade deliberately re-ran the earlier findings against the current working tree rather than repeating the report as historical truth. The following changes materially alter the plan:

| Earlier finding | Current implementation | Correct status |
|---|---|---|
| Focus reticle was cosmetic | `CreatorCamera.tsx` converts the tap into camera coordinates, checks device focus support and calls the camera focus method | **Implemented; native device proof pending** |
| Audio was always enabled without a permission owner | `useCreatorCapturePermissions` owns camera/microphone states and the recorder supports muted configuration | **Mostly corrected; first-grant recorder reconfiguration remains P0** |
| Poster publication coerced unsupported stickers | Current projection no longer maps unrelated layer types to `text` or slider to poll | **Known corruption closed; parity fixtures still required** |
| Moodboard canonical API used mock/in-memory success | Canonical service now uses real endpoints and honest failure states | **Mock-success defect closed** |
| Moodboard picker was always mock-backed | Picker now resolves authenticated ThryftVerse sources | **Source honesty improved; full source-state and scale validation pending** |
| Moodboard backend was basic CRUD only | CRUD and item persistence remain, with broader authenticated integration | **Still architecturally incomplete: no full scene/revision/render contract** |

This is not a claim that the editor department is finished. It changes the priority from re-implementing closed work to closing the seams that users can still feel: deterministic permission-to-record behavior, video render parity, full Moodboard document durability, export, accessibility alternatives, performance, and native EAS validation.

---

## 1. What flagship quality means here

Flagship creator quality is not a screenshot style. It is the user’s confidence that every creative action is immediate, reversible, predictable, and faithfully preserved.

The benchmark apps differ visually, but their durable product principles converge:

- **The media or composition is the dominant object.** Chrome supports it and recedes during manipulation.
- **The first action is obvious.** Capture, add, arrange, and publish are never competing calls to action.
- **Power is contextual.** Advanced capabilities appear after the user has an object or timeline context that makes them meaningful.
- **The result is continuously visible.** The preview is the canvas; editing is direct manipulation, not form filling.
- **Actions are reversible.** Undo, redo, retake, replace, and recover lower the cost of experimentation.
- **The system is honest.** A filter visible in edit appears in playback and export. A product tag remains a product tag. A saved draft survives process death.
- **The workflow is continuous.** Capture does not lead through unnecessary confirmation screens; selected media keeps its crop and visual position across transitions.
- **Failure is designed.** Permission denial, offline media, partial upload, unknown publication outcome, missing assets, and unsupported codecs are product states rather than generic toasts.
- **Performance is interaction quality.** A beautiful editor that drops frames during pinch, crop, or timeline scrub is not flagship.

Apple’s 2025 design guidance is useful precisely because it does **not** say to turn every surface into glass. Apple says content should remain primary, controls form a distinct functional layer, and hierarchy should be expressed through layout and grouping instead of decoration. It also advises limiting custom glass to important interactive elements and avoiding overlapping glass layers. That supports ThryftVerse’s anti-AI policy: one restrained control layer over media, not glass on every row or sheet.[^apple-design-system][^apple-liquid-glass]

### 1.1 Anti-AI design test for the creator department

A creator screen fails when any of these are true:

- the thumbnail silhouette is mostly toolbars, pills, sheets, or equal rounded containers;
- an ordinary close, flash, gallery, camera-flip, or overflow glyph has a persistent grey plate without a state reason;
- every tool has an icon, label, subtitle, badge, and container;
- the canvas is visually smaller than the editor chrome needs it to be;
- a decorative material is applied to compensate for weak hierarchy;
- multiple bottom rails are visible at once;
- animations occur because a component mounted, not because state or spatial ownership changed;
- a tool exists in the UI because a type or handler exists, even though playback/export/backend semantics are incomplete;
- an empty state is avoided with mock content;
- a code comment calls a component “premium” or “flagship” without measurable evidence.

The correction order is always composition → hierarchy → behavior → state truth → performance → material. Material comes last.

---

## 2. Research method and evidence confidence

This report uses three evidence classes:

| Class | Meaning | How it is used |
|---|---|---|
| A — code fact | Directly observable in the current repository | Defect and architecture conclusions |
| B — platform fact | Current official platform or library documentation | Feasibility and implementation choice |
| C — product benchmark | First-party product announcement or official product listing | Capability direction, never pixel-copy claims |

Competitor visual measurements are intentionally not fabricated. No claim such as “Instagram uses exactly 24pt here” is treated as fact without a first-party specification. User-supplied screenshots and native ThryftVerse captures remain the authority for visual comparison.

The analysis traced both directions:

```text
intent → entry → capture/select → composition → edit → preview → upload → publish → persistence → viewer
viewer → stored document → backend projection → publication serializer → editor capability → source media
```

The highest-risk files inspected include:

| Area | Canonical implementation | Approx. lines | Observation |
|---|---|---:|---|
| Camera | `frontend/src/creator/CreatorCamera.tsx` | 1,998 | Real native capture/focus/permissions; first-grant audio transition remains |
| Entry | `frontend/src/creator/CreatorEntryScreen.tsx` | 522 | Strong camera-first shell |
| Canvas | `frontend/src/creator/CreatorCanvas.tsx` | 2,961 | Shared scene renderer, but mixed image/video/export capabilities |
| Asset picker | `frontend/src/creator/CreatorAssetPicker.tsx` | 4,874 | Severe orchestration and reviewability risk |
| Poster | `frontend/src/creator/poster/PosterComposerScreen.tsx` | 3,300 | Feature-rich, requires capability fixtures and decomposition |
| Look | `frontend/src/creator/look/LookComposerScreen.tsx` | 2,276 | Strong separate owner, requires renderer/export closure |
| Publish | `frontend/src/creator/CreatorPublishSheet.tsx` | 1,903 | Mature state model, oversized owner |
| Moodboard | `frontend/src/screens/MoodboardEditorScreen.tsx` | 1,351 | Real data integration on a narrow composition model |
| Moodboard service | `frontend/src/services/moodboardApi.ts` | 377 | Canonical API is honest; durability contract remains narrow |
| Moodboard backend | `backend/api/src/routes/moodboards.ts` | 725 | Authenticated CRUD/items, not full composition persistence |
| Look backend | `backend/api/src/routes/looks.ts` | 1,274 | Stronger transactional publication |
| API monolith | `backend/api/src/index.ts` | 44,944 | Poster Story implementation remains buried in a high-risk monolith |

Line count is not itself a defect. It is a signal that a single file may own unrelated state machines. A split is justified only around real ownership boundaries, not around arbitrary component length.

---

## 3. Current capability map

Legend: **Yes** = directly implemented; **Partial** = some paths or media types only; **No** = no authoritative implementation found; **Hidden** = code exists but UI correctly withholds it; **Unverified** = code suggests support but native behavior was not proven.

| Capability | Capture/select | Editor preview | Stored contract | In-app viewer | Export/share file | Backend semantics | Verdict |
|---|---|---|---|---|---|---|---|
| Single photo | Yes | Yes | Yes | Yes | No authored render export found | Yes | Usable in-app |
| Multi-photo Look | Yes | Yes | Yes | Yes | No authored render export found | Yes | Usable in-app |
| Multi-frame Poster | Yes | Yes | Yes | Yes | No authoritative composed export found | Yes | Usable in-app |
| Image filter/effect | Yes | Yes, Skia | Yes | Yes through shared canvas | No authoritative export found | Stored in composition | In-app only until export exists |
| Video capture | Yes | Yes | Yes | Yes | Source media only; authored export absent | Stored | First-grant audio bug; otherwise implemented |
| Video effect | Capture disables video when effect active | Metadata path exists | Yes | Native video path does not fully render Skia effects | No | Stored only | Must remain unavailable |
| Tap-to-focus | Real focus call on supported devices | N/A | N/A | N/A | N/A | N/A | Implemented; native proof pending |
| Green screen | Hidden | Partial metadata/hooks | Partial | Unproven | No | No authoritative result | Correctly hidden |
| Speed curve | Hidden in camera; editor tool exists | Unverified | Yes | Unverified end-to-end | No | Metadata only | Gate until proven |
| Keyframes | N/A | Yes | Yes | Shared evaluator exists | No authored export found | Metadata only | In-app capability, not file export |
| Text/draw/decorative layers | N/A | Yes | Yes | Shared canvas | No authored export found | Full document plus narrowed projections | Require parity fixtures; no known coercion |
| Interactive Poster stickers | N/A | Yes | Yes | Partial by type | N/A | Unsupported semantics fail closed | Expand only with exact semantic matrix |
| Product binding | N/A | Yes | Yes | Yes | N/A | Yes | Preserve fail-closed |
| Draft crash recovery | N/A | Yes | Local journal | N/A | N/A | N/A | Strong base; validate process death |
| Look publication | N/A | N/A | Full composition | Yes | N/A | Transaction + payload hash | Strong base |
| Poster Story publication | N/A | N/A | Full composition | Yes | N/A | Transaction + payload hash | Strong base |
| Unknown publish outcome | N/A | N/A | Stable document ID | Check-result path | N/A | Idempotent lookup | Strong base |
| Moodboard creation | Real sources | Basic transform | Basic item positions only | Basic | No | Authenticated CRUD/items | Honest but architecturally narrow |
| Moodboard offline save | N/A | Explicit online/offline state | No durable operation journal found | No | No | No | Do not promise until implemented |

This matrix must become executable product configuration, not remain documentation. A tool should be visible only when all required columns for its promised outcome are green.

---

## 4. Camera entry and capture

### 4.1 What is already right

The current camera has corrected several defects visible in earlier device captures:

- Look / Poster / Search are the only persistent intent choices.
- Timer, grid, effects, hands-free, and multi-capture live behind the Tools sheet.
- Multi-capture initializes to `false`; ordinary capture is one-shot.
- Poster and Look captures go directly to the editor without a redundant quick-review screen.
- Visual Search keeps a confirmation step because its intent differs.
- The shutter is guarded by camera readiness.
- Camera release and app-background recording cleanup are considered.
- The recent-library thumbnail is optional and does not trigger broad library access merely to decorate the camera.
- Speed and green-screen rows are hidden because their result path is incomplete.

These are structural improvements, not cosmetic changes. They should be preserved.

### 4.2 P0 — microphone permission ownership

The permission owner now exists. `CreatorCamera.tsx` consumes `useCreatorCapturePermissions`, renders muted state honestly, and creates the recorder with audio enabled only when microphone access is already granted. That closes the earlier always-audio defect.

The remaining P0 is a state-transition race in product semantics: the long-press requests microphone access, but the `videoOutput` instance for that render was constructed from the old permission value. If the user grants access, the first recording intent cannot safely continue as an audio-enabled recording until React has re-rendered and the recorder has been reconfigured. VisionCamera explicitly requires microphone permission for audio; camera and microphone authorization are separate system capabilities.[^vision-video][^apple-capture-auth]

**Required behavior:**

1. Do not request microphone permission on camera entry when the user may only take a photo.
2. On the first transition from shutter press to video intent, enter `awaiting_microphone`; do not call `startRecording` in the same closure.
3. If granted, re-render/reconfigure the audio-enabled recorder, then require an explicit second press or continue only through a state-machine effect proven to reference the new recorder instance. Never silently record the granted attempt without sound.
4. If denied but requestable, offer “Record without sound” and “Not now.”
5. If permanently denied, offer “Record without sound” and a Settings recovery action.
6. Preserve `useVideoOutput({ enableAudio: microphoneGranted })`; add `idle → requesting_permission → ready_with_audio | ready_muted → recording` as the authoritative state machine.
7. Announce muted recording visually and accessibly.
8. Test permission changes after returning from Settings and after app/background interruption.

The existing permission hook remains the owner. The fix belongs in the intent/recorder transition, not in another button-level permission branch.

### 4.3 P0/P1 — capture guide geometry

The current code has one `captureGuideViewport`, which is an improvement over independent percentage-positioned corners. Its geometry is still based on hard-coded offsets:

```text
top = max(safeTop, 16) + 72
bottom = max(safeBottom, 16) + 184 when the mode rail exists, otherwise +140
horizontal inset = 52 Search / 24 Poster / 36 Look
```

Brackets and a center crosshair are always rendered. This causes three problems:

1. The guide can drift when system insets, font scale, bottom overlay height, or device aspect changes.
2. A crosshair and brackets imply precision or an exact crop even when ordinary Look/Poster capture saves the full sensor output.
3. The guide, grid, tap point, preview crop, and eventual canvas crop are not proven to use the same coordinate transform.

VisionCamera’s current coordinate APIs explicitly distinguish view, camera, and frame coordinates and provide conversion helpers.[^vision-coordinates]

**Target implementation:**

```ts
type CaptureViewport = {
  viewRect: Rect;
  sensorToView: Matrix3;
  viewToSensor: Matrix3;
  authoredAspectRatio?: number;
};
```

- Measure top controls, bottom controls, and the intent rail with `onLayout`.
- Derive one available viewport after safe-area and measured chrome subtraction.
- Pass this object to grid, visual-search brackets, focus conversion, capture overlay, pinned-media transition, and initial canvas crop.
- Render brackets/crosshair only for Visual Search or an explicit framing mode.
- Ordinary Look/Poster capture should show either no guide or an optional rule-of-thirds grid.
- If a guide denotes an exact output crop, actually apply and persist that crop. Otherwise it must read as guidance, not a boundary.
- Add coordinate tests for portrait/landscape source rotation, front-camera mirroring, 16:9/4:3 sensors, tall Android windows, display cutouts, and 1.3–2.0 font scaling.

### 4.4 P1 — real focus or no focus claim

`FocusReticle` is currently visual-only. The installed VisionCamera API supports `CameraRef.focusTo(...)`, including automatic conversion from view coordinates, capability-specific AE/AF/AWB modes, and reset behavior.[^vision-focus]

The target is not “animate a nicer reticle.” It is:

- call real focus metering after converting the tap inside the measured preview;
- check device metering support before requesting custom modes;
- use snappy responsiveness for photo and steady responsiveness during video;
- display the reticle only after the request is accepted;
- show a restrained failure/reset state if metering fails;
- if the Skia camera wrapper cannot expose the same controller safely, disable the gesture in that mode rather than fabricating focus.

### 4.5 P1 — camera chrome composition

The desired silhouette is media-first:

```text
top:    Close                                      Flash  Tools
middle: unobstructed preview; contextual focus/grid only
bottom: Gallery             Shutter                Flip
rail:                  Look  Poster  Search
```

Rules:

- keep 44pt hit areas but render 20–24pt visible glyphs;
- Close, Flash, Tools, Gallery, and Flip default to transparent targets;
- do not place every top glyph in a circle;
- give Aa or Draft status containment only when the containment communicates a separate mode/state;
- only one status chip may occupy a region at a time—recording outranks hands-free, which outranks zoom, which outranks effect metadata;
- use one top and one bottom legibility scrim, not a plate under every glyph;
- during capture or manipulation, chrome may fade by opacity only; no bouncing or full-page motion;
- correct comment drift that still calls multi-capture the default.

### 4.6 Camera acceptance gates

- shutter-to-local-preview p95 is measured on a mid-tier Android target, not estimated;
- no dropped recording start because audio permission is unresolved;
- camera session stops on navigation blur/background and resumes without a black stale frame;
- no mode rail/effect overlap at 1.0, 1.3, 1.6, and 2.0 font scale;
- Visual Search brackets remain fully inside the true preview viewport;
- actual focus is observable on a supported physical device;
- captured orientation, mirror, and crop match the first editor frame;
- one-shot capture requires one capture action and no extra confirmation;
- multi-capture remains an explicit user choice and exposes reorder/remove/finish states.

---

## 5. Camera-to-editor continuity

`CreatorEntryEditorCrossfade` and the Poster/Look callers already implement the right conceptual pattern: retain the captured object, calculate its destination, transition it into the editor, and fade the surrounding chrome. Look calculates a destination from its first arranged media layer; Poster supplies the full canvas destination.

This is stronger than a generic screen fade. The remaining requirement is **crop continuity**, not more dramatic animation.

### Target transition contract

```ts
type MediaTransitionSnapshot = {
  sourceUri: string;
  mediaKind: 'image' | 'video';
  sourceRect: Rect;
  destinationRect: Rect;
  sourceContentTransform: ContentTransform;
  destinationContentTransform: ContentTransform;
  orientation: 0 | 90 | 180 | 270;
  mirrored: boolean;
};
```

The current transition pins a URI and geometry, but the contract must also preserve the content transform. A full-screen `cover` preview morphing into a differently cropped 4:5 Look tile can visibly jump even when the outer rectangles interpolate correctly.

Motion should be 160–240ms, gesture-related, and disabled or replaced with a short fade under Reduce Motion. Apple’s accessibility guidance specifically recommends reducing scaling and spatial transitions, tightening springs, and replacing axis movement with fades where appropriate.[^apple-accessibility]

Acceptance means the same focal point remains under the same perceived location from capture to editor—not merely that both screens contain the same image.

---

## 6. Shared composition engine and Skia strategy

### 6.1 Skia is a render authority, not a quality percentage

The request to “use Skia to 100%” should not be implemented literally. Normal text inputs, accessibility controls, list rows, navigation, and system pickers should remain native React Native/platform UI. Moving them into a canvas would reduce accessibility, text behavior, and maintainability.

Use Skia where one or more of these are true:

- the result is a composited visual scene;
- per-pixel effects, masks, cutouts, blend modes, or shaders are required;
- the exact same visual pipeline must be used for image and video frames;
- a high-frequency gesture would otherwise update a large React tree;
- an offscreen/picture render is needed for thumbnails or output.

Do not use Skia merely to draw a button, divider, pill, or icon.

### 6.2 Current split-render problem

`CreatorCanvas.tsx` renders images with Skia when effects or masks are present, but video uses a native `VideoView`. The code itself notes that video effects are deferred to an export pipeline. No authoritative creator export pipeline was found.

Current React Native Skia supports decoding a video frame as a Skia image through `useVideo`, allowing the same filters, shaders, masks, and transforms used for images to render on video frames. It requires Android API 26+ for video support.[^skia-video][^skia-install]

That does not by itself solve export. Skia’s documentation points to an encoder integration for writing video. The app needs an explicit product decision:

#### Recommended architecture

- **Interactive preview:** Skia scene renderer for authored image/video composition where device support permits.
- **Playback:** the same scene evaluator and transform/effect graph; native video decode may remain underneath only when the scene requires no per-pixel composition.
- **Export on Android:** a native module around Media3 Transformer 1.11+, using the same normalized effect parameters and composition plan. Media3 supports trimming, effects, overlays, audio processing, multi-asset composition, progress, cancellation, and export.[^media3-transformations][^media3-getting-started]
- **Export on iOS:** a native module around AVComposition/AVVideoComposition/AVAssetExportSession, with a custom compositor only for effects that cannot be represented by built-in instructions.[^avfoundation][^avcomposition][^avexport]
- **Server fallback:** only for device-incompatible or very heavy jobs, using a versioned render manifest and never as the sole path for immediate preview.

Do not introduce FFmpeg as the default cross-platform answer unless codec coverage tests prove Media3/AVFoundation insufficient. FFmpeg increases binary size, licensing review, thermal load, security update surface, and parameter-parity risk.

### 6.3 One normalized scene evaluator

The current shared `CreatorDocument` is the right seed. Evolve it through a migration rather than creating separate `PosterDocumentV2Final` types.

The runtime needs four pure owners:

```text
Document validator
  → resolves version, asset bindings, temporal bounds, semantic capabilities

Scene evaluator(time, viewport)
  → returns visible layers, transforms, opacity, effect graph, interaction metadata

Renderer(scene, renderProfile)
  → edit / preview / viewer / thumbnail / export

Publisher(document, capabilities)
  → full document + exact backend projections; never lossy coercion
```

The scene evaluator—not individual screens—owns:

- z-order and visibility;
- page and clip timing;
- keyframe interpolation;
- layer transforms and crop;
- adjustment-layer application ranges;
- safe-zone mapping;
- effect parameter normalization;
- source orientation/mirroring;
- missing-asset behavior;
- interactive sticker semantics.

### 6.4 Executable capability registry

Add a single registry consumed by tool rails, validation, viewer adapters, and publication:

```ts
type CapabilitySupport = 'supported' | 'preview-only' | 'hidden' | 'blocked';

type CreatorCapability = {
  id: string;
  mediaKinds: Array<'image' | 'video'>;
  editor: CapabilitySupport;
  viewer: CapabilitySupport;
  export: CapabilitySupport;
  backend: CapabilitySupport;
  requires?: string[];
  minimumPlatform?: { ios?: number; androidApi?: number };
};
```

Visibility rule:

```text
advertised tool = editor supported
               ∧ viewer supported for the publish destination
               ∧ exact serialization supported
               ∧ required permissions granted/requestable
               ∧ output path supported when “export” is promised
```

This prevents feature drift more reliably than comments such as “hidden until export supports it.”

---

## 7. Poster composer

### 7.1 Current strengths

- Poster owns a dedicated composer rather than sharing Look conditionals.
- It uses the shared canvas and versioned composition document.
- Single-photo Poster hides timeline by default; video/multi-frame content can expose time editing.
- Context tool groups are built around selection state.
- The shared rail displays at most four primary actions plus More.
- Only one lower surface is intended to be visible at a time.
- Publish includes crash recovery, media finalization, full composition, stable IDs, unknown-outcome handling, and viewer reconstruction.

### 7.2 Structural visual target

Poster is an immersive story composer, not a mini desktop editor and not a dashboard.

Default state:

```text
full canvas
Close / undo / forward or publish
contextual object controls only after selection
one bottom tool rail
```

Selected object state:

```text
canvas remains dominant
selection bounds / handles
4 relevant actions at most
More opens grouped secondary commands
drag-to-trash appears only during drag
```

Video state:

```text
timeline replaces the tool rail when explicitly opened
playhead and clip content receive priority
Done returns to canvas tools
```

No stacked permanent tool rail + timeline + effect tray is allowed. No card-on-card inspector construction. A bottom sheet may be opaque or materially separated for legibility; glass is optional and should never be the default answer.

### 7.3 P0 — lossy sticker projection

`compositionContract.ts` currently maps unsupported/decorative layer types to backend `text`, and maps `emojiSlider` to a synthetic poll with “low/high” options. The full document preserves the original scene, but the narrowed backend sticker rows no longer represent the authored object.

This breaks analytics, interactions, moderation, accessibility, and data migration. It can also create a sticker row the viewer interprets differently from the composition.

**Required correction:**

- define an exact mapping for every interactive backend-supported sticker;
- keep non-interactive visual layers only in the composition document unless a corresponding projection is needed;
- never insert a fake `text` row for a drawing, decorative object, GIF, music, link, location, hashtag, time, or weather layer;
- do not map emoji slider to poll; add a real `emoji_slider` backend type and response model, or keep the tool hidden;
- validate backend projection and full document in one transaction;
- reject publication with a precise recovery message when the document contains a promised interactive capability the destination cannot support;
- include a `semanticVersion` and `interactionKind` in the persisted projection.

### 7.4 P1 — tool hierarchy

The rail already enforces four primary tools, which is directionally right. Do not justify this with a simplistic “four is the cognitive sweet spot.” Hick’s experiments found reaction time relates to information uncertainty, but later choice-overload meta-analysis found the effect is highly dependent on task complexity and context.[^hick][^choice-overload]

The correct design rule is contextual relevance:

- no selection: Text, Sticker, Product, Draw or Add, depending on the document;
- media selected: Replace, Crop, Adjust, Effects;
- text selected: Edit, Style, Color, Align;
- multi-selection: Align, Group/Ungroup, Front/Back, Delete;
- time context: Split, Trim, Speed, Volume only when a video clip is selected;
- advanced tools remain grouped under More, not a flat alphabetical dump;
- personalization must not reorder the basic rail so aggressively that tool positions become unpredictable. Stable defaults outrank speculative “smart” placement; pinned tools should be explicit user customization.

### 7.5 P1 — direct manipulation and recovery

Shneiderman’s original direct-manipulation model emphasizes continuous representation, physical action, rapid incremental feedback, and reversibility.[^direct-manipulation] Poster should therefore prioritize:

- transform objects directly on the canvas;
- show live alignment and snap feedback without persistent guide clutter;
- support single-tap alternatives for precise move/order operations;
- make undo/redo persistent and state-aware;
- retain a crash journal after every meaningful command boundary, not every gesture frame;
- expose edit history labels such as “Undo crop” or “Redo text color” to accessibility services;
- commit transforms at gesture end while previewing them on the UI thread.

### 7.6 Poster acceptance gates

- every visible tool has matching edit, persist, viewer, and backend behavior;
- single-photo first viewport has one bottom surface and at least 70% visually unobstructed canvas;
- no unsupported layer is coerced to another semantic type;
- text remains editable at 2.0 font scale without top/bottom controls becoming unreachable;
- undo/redo restores crop, z-order, text, effects, and temporal edits;
- video scrub updates within frame budget on a mid-tier Android device;
- preview and published viewer pass image-diff tolerances for a golden composition corpus;
- system Back closes the active local surface before exiting the composer;
- unsaved exit, upload failure, and unknown publish outcome each have distinct recovery.

---

## 8. Look composer

### 8.1 Product role

Look is not Poster with a different tab label. It is a spatial, shoppable collage whose dominant jobs are:

1. collect garments/listings/media;
2. arrange or auto-compose them;
3. preserve product identity and attribution;
4. let the creator refine cutout, crop, layer, and visual treatment;
5. publish a WYSIWYG, shoppable result.

The current dedicated `LookComposerScreen` and `LookSourceTray` are the correct architecture direction.

### 8.2 Current strengths

- selected entry assets are auto-arranged rather than stacked as identical full-bleed layers;
- the first media destination is calculated for the entry transition;
- canvas chrome recedes during manipulation;
- only one lower surface is intended at a time;
- Items, Layout, and Effects temporarily replace the tool rail;
- layout previews show actual arrangements rather than a blind “try another” action;
- product layers and source bindings are represented in the document;
- publication can persist the full composition when visual authorship requires it.

### 8.3 Required upgrades

#### Source tray as a creative supply, not a form panel

- preserve a small peek state showing real item media;
- expand into Closet / Listings / Search only on intent;
- use media as the label; avoid title/subtitle/badge stacks on every result;
- support drag-to-canvas and tap-to-add as equivalent operations;
- retain insertion origin so the added object animates from source to canvas;
- dedupe the same source item and offer “use another photo” instead of silently duplicating;
- represent missing, sold, deleted, or private source listings fail-closed without erasing the authored visual snapshot.

#### Cutout workflow

Pinterest’s first-party Shuffles description emphasizes one-tap object cutout, layering, rotation, resizing, motion, remixing, and keyframes; Pinterest also describes high-density shoppable collages whose product items remain explorable.[^shuffles-app][^pinterest-shuffles-shopping] ThryftVerse should match the underlying capability, not copy its UI.

Target states:

```text
request cutout → local progress on selected object → preview mask
→ refine edge / restore / erase → accept
→ durable mask asset upload → document binding
→ viewer fallback to original crop if mask is unavailable
```

- cutout must never block the whole canvas;
- mask refinement should use Skia for real-time preview;
- persist mask dimensions, source checksum, model/version, and manual refinements;
- do not make a generated cutout a trustless permanent replacement for the original;
- provide a visible original/edited comparison on press-and-hold with Reduce Motion-safe behavior.

#### Auto-layout

- treat auto-layout as an editable starting proposal, not a template that locks the composition;
- preserve individual objects and product bindings;
- offer 3–5 materially different, media-aware compositions rather than many thumbnails of slight spacing changes;
- score layouts using aspect, salience, object category, overlap, negative space, and product-label safety;
- never silently move a manually positioned object after the creator has edited the proposed layout.

### 8.4 Look publication truth

The Look backend is ahead of Moodboard: it verifies media receipts, persists composition, uses transactions, binds media assets, and compares publication payload hashes for stable document IDs. Preserve that model.

Remaining gates:

- verify every product binding points to an authorized listing projection;
- persist an immutable visual snapshot when a listing can later change;
- do not show price/current availability from a stale snapshot without state labeling;
- invalidate all discovery/profile/detail caches after publication;
- test edit versus remix attribution independently;
- ensure viewer adapters never fall back to a flattened legacy layout when a valid composition exists.

---

## 9. Moodboard — re-foundation required

Moodboard is the largest quality gap in the creator department.

### 9.1 Current implementation diagnosis

The current editor is a separate screen with a mostly fixed square-item model, a large canvas/picker split, basic pan/pinch/rotate, reorder/delete, and theme selection. It now resolves real authenticated sources and no longer fabricates a successful in-memory API fallback. It still does not share the full Creator document, renderer, history, asset pipeline, crash journal, preview, publication, or viewer contract.

`moodboardApi.ts` now fails through the canonical request layer rather than turning network failures into mock success. This is an important truthfulness correction. The remaining offline requirement is positive, not cosmetic: either add a persisted operation journal with replay/conflict semantics, or explicitly state that editing is unavailable offline. A banner must never imply durability that the data layer cannot prove.

The unresolved issue is no longer mock data; it is document durability and semantic completeness.

The backend provides authenticated CRUD and positional item operations, but the model is too narrow for a flagship moodboard:

- no versioned composition document;
- no revision/optimistic concurrency;
- no durable draft/publication lifecycle;
- no text, masks, cutouts, backgrounds, drawing, multi-page, animation, or asset binding;
- no idempotency keys;
- no atomic composition + cover + item binding publication;
- no authoritative thumbnail/render receipt;
- real picker sources exist, but need complete loading/empty/error/offline/partial states and scale/performance proof;
- no conflict or unknown-outcome model.

### 9.2 Target product definition

Moodboard should be a freeform, shoppable visual board—not a grid of identical product cards and not a Poster clone.

Dominant interaction:

```text
canvas with authored composition
source tray peeking from bottom
tap or drag an item/media/cutout onto canvas
directly arrange, overlap, annotate, and bind products
publish or keep private
```

Core capabilities:

- camera, system picker, Closet, Listings, saved Looks, and discovery search as sources;
- one-tap cutout plus manual refinement;
- layer, rotate, resize, crop, opacity, background, text, and draw;
- product identity and optional snapshot price;
- multiple canvas aspect profiles: free board, 4:5 discovery, 9:16 share;
- undo/redo and crash recovery;
- private draft, private board, shared/collaborative board, public board as explicit states;
- remix with immutable source attribution;
- generated cover/thumbnail derived from the same render contract;
- accessibility alternative to every drag-only operation.

### 9.3 Reuse the engine, not the screen

Do not force Moodboard into `LookComposerScreen` with conditionals. Share the following foundations:

- `CreatorDocument` versioning and asset references;
- scene evaluator and renderer;
- gesture/transform command model;
- selection, alignment, history, and crash journal;
- asset picker/source adapters;
- upload manager and media finalization;
- cutout/mask pipeline;
- preview and thumbnail render;
- publication state machine.

Keep a dedicated `MoodboardComposerScreen` because its information hierarchy differs: continuous freeform board, source discovery, and collaboration are central; ephemeral story framing and timeline are not.

### 9.4 Proposed backend model

```sql
moodboards
  id
  owner_id
  title
  description
  visibility                 -- private | shared | public
  status                     -- draft | publishing | published | archived
  document_version
  composition_document jsonb
  revision bigint
  cover_media_asset_id
  publication_payload_hash
  source_moodboard_id
  source_creator_id
  created_at
  updated_at
  published_at

moodboard_collaborators
  moodboard_id
  user_id
  role                       -- viewer | editor
  invited_by
  accepted_at

moodboard_item_bindings
  moodboard_id
  layer_id
  listing_id
  media_asset_id
  snapshot jsonb
  created_at

moodboard_revisions
  moodboard_id
  revision
  actor_id
  document_patch jsonb       -- or compressed full snapshot at checkpoints
  created_at
```

Mutation contract:

```http
PUT /moodboards/:id/document
X-Idempotency-Key: <stable command/batch key>
If-Match: "<revision>"

{
  "documentVersion": 2,
  "baseRevision": 17,
  "compositionDocument": { ... },
  "mediaFinalizationIds": [ ... ]
}
```

Response:

```json
{
  "ok": true,
  "moodboardId": "...",
  "revision": 18,
  "compositionHash": "...",
  "bindings": [ ... ]
}
```

On a network drop after request dispatch, the client enters **unknown outcome** and checks by idempotency key or revision. It must never fall back to a new in-memory moodboard and claim the operation was saved.

### 9.5 Offline model

If durable offline editing is a product requirement:

- persist documents and command journal to SQLite or the repository’s established durable local storage;
- retain local asset references and checksum metadata;
- enqueue resumable uploads separately from publication;
- reconcile against backend revision on reconnect;
- show `Saved on this device` only after durable local commit;
- show `Synced` only after backend confirmation;
- model conflicts explicitly and never silently last-write-wins a collaborator’s document.

If this durable system is not implemented, remove the offline-save claim and show a truthful retry state.

### 9.6 Moodboard migration order

1. Stop mock fallback in canonical production calls; retain fixtures only behind explicit Storybook/test adapters.
2. Add real picker sources and honest loading/empty/error/offline states.
3. Introduce versioned composition/revision columns without deleting legacy item rows.
4. Build a legacy-to-document adapter for existing boards.
5. Implement dedicated composer on the shared engine.
6. Dual-write item bindings and composition during rollout.
7. Render viewer and cover from composition.
8. Backfill and compare legacy/new renders.
9. Remove positional legacy writes only after parity metrics pass.

---

## 10. Asset picker and media intake

At roughly 4,593 lines, `CreatorAssetPicker.tsx` is difficult to reason about as one state owner. Decompose around actual product responsibilities:

```text
CreatorAssetPickerScreen
  ├─ source navigation state
  ├─ system media adapter
  ├─ Closet/Listing/Look/Search source adapters
  ├─ selection model and limits
  ├─ media inspection/normalization
  ├─ selected tray
  └─ permission/loading/error views
```

Do not split each row into abstract wrappers. Extract hooks/services where side effects and state machines have a separate lifecycle.

### 10.1 Privacy and permission

The system picker is preferred for user-selected media because it grants access only to chosen items. Apple’s PhotosUI explicitly describes that privacy model, and Expo MediaLibrary exposes limited-versus-all access plus granular Android permissions.[^apple-photos-picker][^expo-media-library]

Rules:

- use the system picker for ordinary add-media actions;
- request broad media library access only for a feature that truly needs a browsable in-app library;
- handle limited selection as a first-class state;
- separate read permission from write-only “save to gallery” permission;
- never trigger permission on mount to improve a thumbnail;
- preserve picker selection order and report items that fail iCloud/download transfer;
- dedupe by stable asset identity/checksum, not URI string alone.

### 10.2 Media normalization

Before an asset becomes a layer, produce a durable inspection record:

```ts
type InspectedMedia = {
  localUri: string;
  kind: 'image' | 'video';
  mimeType: string;
  byteSize: number;
  pixelWidth: number;
  pixelHeight: number;
  durationMs?: number;
  orientation: 0 | 90 | 180 | 270;
  mirrored?: boolean;
  colorSpace?: string;
  hdr?: boolean;
  checksum: string;
};
```

- reject unsupported/oversized assets before the creator invests in editing;
- transcode only when required, with visible progress and cancellation;
- preserve HDR deliberately or tone-map deliberately—never by accident;
- generate thumbnails from the same orientation/crop contract;
- keep the original until upload and publish are confirmed;
- recover from missing local files after process death.

### 10.3 Upload durability

The existing finalization receipt model is strong. Extend the upload manager to support large video reliably:

- resumable multipart upload;
- part and full-object checksums;
- persisted job state;
- bounded concurrency and backoff;
- cancellation and orphan cleanup;
- server-side media inspection before finalization;
- finalization receipt bound to owner, checksum, asset, media kind, and intended publication scope.

AWS’s current multipart documentation supports retrying failed parts independently and validating full or composite checksums; the exact storage provider may differ, but the integrity principles apply.[^s3-multipart]

---

## 11. Publication, backend, and viewer fidelity

### 11.1 What must be preserved

The Look and Poster Story paths already contain important production mechanics:

- stable document/publication IDs;
- backend media receipt verification;
- transactions;
- composition document persistence;
- publication payload hashes;
- unknown-outcome state after ambiguous network failure;
- check-result before retry;
- explicit scheduling-failed-after-publish state.

These are flagship behaviors. Do not regress them into an optimistic “Posted!” toast.

### 11.2 One publication transaction

For each creative document:

```text
validate exact capability matrix
→ inspect and upload every local asset
→ finalize media receipts
→ freeze document revision
→ create publication + bindings + projections in one DB transaction
→ commit outbox event
→ respond with publication receipt
→ invalidate/refetch all visible surfaces
```

The response must identify:

- publication ID;
- source document ID and revision;
- composition hash;
- media asset bindings;
- publication status;
- idempotency key result;
- any scheduled state.

### 11.3 Backend decomposition

Poster Story routes currently live deep inside a roughly 40,914-line `backend/api/src/index.ts`. This is not an aesthetic code complaint. It increases the risk of incomplete transaction, schema, auth, and test changes.

Extract without changing behavior:

```text
routes/posterStories.ts
domain/creator/validateComposition.ts
domain/creator/verifyMediaBindings.ts
domain/creator/publishDocument.ts
domain/creator/projectInteractiveLayers.ts
repositories/creatorDocuments.ts
repositories/publications.ts
```

Keep Fastify registration thin. Domain services accept an explicit transaction client. Route schemas remain Zod, but composition validation must be versioned and shared through generated JSON Schema or a cross-package TypeScript contract—not duplicated `unknown` acceptance.

### 11.4 Viewer is part of the editor

The viewer must consume the canonical composition when valid and use legacy adapters only for legacy rows. Acceptance is visual and semantic:

- same crop, focal point, transform, z-order, mask, type, color, and opacity;
- same timing/keyframe/effect evaluation;
- interactive stickers retain exact behavior and accessibility;
- product bindings resolve current state without rewriting the visual snapshot;
- missing or unauthorized media fails closed;
- invalid future document versions show a recoverable compatibility state, not a blank screen.

Build a golden corpus of composition documents covering each layer type and state. Render editor-preview and viewer at identical viewports and compare screenshots. A TypeScript pass cannot prove WYSIWYG.

---

## 12. Interaction psychology translated into implementation

Psychology should guide constraints, not decorate the report with named laws.

| Human need | Product mechanism | Implementation consequence |
|---|---|---|
| Keep attention on the creative object | Contextual chrome and one lower surface | Bottom-surface state machine; no stacked trays |
| Understand cause and effect | Immediate direct manipulation | UI-thread transform preview; commit at gesture end |
| Explore without fear | Reversibility and recovery | Named undo/redo commands, crash journal, retake/replace |
| Avoid uncertain choices | Relevant tools at the moment of use | Capability registry + selection-context tool groups |
| Maintain spatial memory | Stable tool positions and continuous transitions | Stable default rail; exact content-transform transition |
| Trust completion | Distinct local/uploaded/published states | Durable job model and unknown-outcome state |
| Learn advanced capability progressively | Layered disclosure | Four relevant tools + grouped More; timeline on temporal context |
| Retain authorship | WYSIWYG persistence | Full versioned document and shared scene evaluator |
| Work with limited dexterity | Alternatives to drag/pinch | Move/order/scale controls and accessibility actions |

Hick’s work supports reducing uncertainty in choice reaction, but it does not justify an arbitrary universal number of buttons.[^hick] Choice-overload research finds complexity, task difficulty, preference uncertainty, and goals moderate the effect.[^choice-overload] Therefore, ThryftVerse should reduce irrelevant choices and group meaningful ones, not remove power from expert creators.

Direct manipulation works because objects remain visible and operations are rapid, incremental, and reversible.[^direct-manipulation] That is why the canvas must remain the preview, and why undo quality is more important than adding another effect category.

---

## 13. Motion, accessibility, and native behavior

### 13.1 Motion language

Use motion only for:

- press feedback;
- source-to-canvas or camera-to-editor continuity;
- selected segment indicator;
- sheet/surface state change;
- drag-to-trash affordance;
- upload/progress state.

Budget:

- press: scale `0.97–0.985`, 80–140ms response;
- state transition: 160–240ms;
- sheet: critically or near-critically damped, no visible float;
- chrome fade during manipulation: opacity only;
- reduced motion: instant state or short fade.

Do not hardcode a “flagship spring” globally. Spring parameters depend on distance, mass, interruption, and platform. Validate the perceived settle and interruption behavior on device.

Reanimated’s current guidance recommends non-layout transforms/opacity, avoiding JS-thread shared-value reads, and testing release or Android `debugOptimized` builds because debug performance differs materially. It also documents feature flags for New Architecture rendering regressions; enable only supported flags and benchmark rather than cargo-culting them.[^reanimated-performance][^reanimated-flags]

### 13.2 Accessibility

The minimum target is more than icon labels:

- every glyph control has a state-aware accessible name and role;
- selected/disabled/recording/muted/uploading states are announced;
- canvas layers expose an ordered accessibility representation;
- selected layers have custom actions: edit, move forward/back, duplicate, delete, move in four directions, enlarge/reduce;
- no required action depends only on drag, pinch, long press, color, or haptic;
- focus is not obscured by bottom sheets or the keyboard;
- text editing remains usable at 2.0 font scale;
- Reduce Motion and Dim Flashing Lights are respected;
- video thumbnails and animated stickers do not auto-loop indefinitely for reduced-motion users;
- countdown and recording status are announced without repeating every frame.

WCAG 2.2 is web-oriented but its input principles are relevant: dragging functionality needs a single-pointer alternative, and undersized/closely spaced targets create real motor-access barriers.[^wcag-drag][^wcag-target] Native Apple guidance likewise recommends simplifying noncritical workflows and reducing automatic/repetitive motion.[^apple-accessibility]

---

## 14. Performance and observability budgets

Do not claim 60/120fps because Reanimated or Skia is installed. Measure user journeys in the EAS build.

### 14.1 Required performance journeys

1. cold creator entry → camera ready;
2. shutter → local preview → editor interactive;
3. add six Look sources → auto-layout → drag/scale/rotate;
4. open 100+ asset source results → scroll/select/deselect;
5. 15-second video → timeline scrub → filter preview;
6. multi-frame Poster → transition preview;
7. publish over normal, slow, interrupted, and recovered networks;
8. reopen draft after process death;
9. view published composition from cold cache.

### 14.2 Metrics

| Metric | Gate |
|---|---|
| camera ready | p50/p95 by device class; no black indefinite state |
| shutter latency | p50/p95 from intent to usable local asset |
| interaction frames | p95 and worst-frame render duration during gesture |
| JS long tasks | count/duration during picker and publish |
| memory | peak and post-dismiss recovery for camera/editor/video |
| dropped video frames | during preview and scrub |
| upload | throughput, retry count, resume success, checksum failure |
| WYSIWYG | image-diff error by golden document and viewport |
| crash-free creator sessions | by camera/editor/publish phase |
| abandoned creation | by step and failure reason |

Android documents a 16ms frame budget for 60Hz, 11ms for 90Hz, and 8ms for 120Hz, and recommends tracing user journeys with frame timing rather than relying on visual feel.[^android-rendering][^android-performance-measurement]

Instrument with stable phase names and no sensitive media URLs/captions. Capture device tier, OS, media kind, document complexity, and capability—not user content.

---

## 15. Implementation architecture and file plan

This is a proposed ownership map, not permission to create `V2` duplicate screens.

```text
frontend/src/creator/
  entry/
    CreatorEntryScreen.tsx
    CreatorModeRail.tsx
    CreatorEntryEditorTransition.tsx
  capture/
    CreatorCamera.tsx
    useCreatorCapturePermissions.ts
    useCreatorCameraSession.ts
    useCreatorRecorder.ts
    CaptureViewport.ts
    CaptureChrome.tsx
    CaptureStatus.tsx
  engine/
    document/
      schema.ts
      migrate.ts
      validate.ts
    capabilities/
      registry.ts
      resolveCapabilities.ts
    scene/
      evaluateScene.ts
      coordinateTransforms.ts
      temporal.ts
    render/
      CreatorScene.tsx
      SkiaMediaLayer.tsx
      NativeMediaLayer.tsx
      renderProfiles.ts
    history/
      commands.ts
      journal.ts
  poster/
    PosterComposerScreen.tsx
    usePosterSurfaceMachine.ts
    posterToolRegistry.ts
  look/
    LookComposerScreen.tsx
    LookSourceTray.tsx
    lookToolRegistry.ts
    autoLayout/
  moodboard/
    MoodboardComposerScreen.tsx
    MoodboardSourceTray.tsx
    moodboardToolRegistry.ts
  media/
    inspectMedia.ts
    assetSources/
    upload/
    cutout/
  publish/
    CreatorPublishSheet.tsx
    useCreatorPublication.ts
    publicationRecovery.ts
```

Important constraints:

- Move canonical files; do not create parallel “Flagship” screens.
- Preserve route names and navigator behavior.
- Extract behavior with tests before visual restructuring.
- Keep screen-specific composition and tool registries separate.
- Reuse engine primitives only when semantics are truly shared.
- Keep native export modules behind typed interfaces and capability checks.

Backend target:

```text
backend/api/src/
  routes/
    creatorDocuments.ts
    looks.ts
    posterStories.ts
    moodboards.ts
  domain/creator/
    validateDocument.ts
    verifyMedia.ts
    projectInteractions.ts
    publishDocument.ts
    renderManifest.ts
  repositories/
    creatorDocuments.ts
    publications.ts
    mediaAssets.ts
```

---

## 16. Prioritized execution plan

### Phase 0 — truth lockdown (P0)

1. Add executable capability registry.
2. Gate every tool by actual edit/view/persist/export/backend support.
3. Close the first-grant microphone/recorder reconfiguration transition; preserve the existing muted path.
4. Prove the existing tap-to-focus implementation on supported and unsupported physical devices.
5. Freeze the corrected fail-closed Poster projection with golden semantic fixtures.
6. Preserve Moodboard's honest canonical API behavior and add durable journal/revision semantics before making any offline-save promise.
7. Add native EAS device matrix and creator golden documents.

**Exit:** no visible control lies; no ambiguous mutation is called success.

### Phase 1 — capture geometry and continuity (P0/P1)

1. Introduce measured `CaptureViewport`.
2. Share its coordinate conversion with focus, grid, visual search, crop, and transition.
3. Restrict brackets/crosshair to Visual Search or exact crop mode.
4. Preserve content transform across camera-to-editor transition.
5. Validate orientation, mirroring, edge-to-edge, font scale, and system bars.

**Exit:** capture and first editor frame match on all target devices.

### Phase 2 — render convergence (P1)

1. Extract pure scene evaluator.
2. Build capability-driven image/video render paths.
3. Use Skia video frames where per-pixel scene effects require them.
4. Build golden edit/preview/viewer image-diff suite.
5. Gate keyframe/effect tools until parity passes.

**Exit:** published in-app playback matches editor preview within defined tolerances.

### Phase 3 — native export (P1, if product promises exported authored media)

1. Define versioned render manifest.
2. Android Media3 Transformer adapter.
3. iOS AVFoundation adapter.
4. Progress, cancellation, thermal/storage/codec failure states.
5. Cross-platform golden output tests.

**Exit:** exported file matches the authored composition and survives target share apps.

### Phase 4 — Poster and Look authored polish (P1)

1. Decompose state owners without changing canonical routes.
2. Enforce one lower surface.
3. Refine tool hierarchy and explicit customization.
4. Complete cutout, source tray, auto-layout, and accessibility alternatives.
5. Native visual convergence against user references.

**Exit:** thumbnail/squint tests pass and all state matrices are complete.

### Phase 5 — Moodboard re-foundation (P0/P1)

1. Preserve real data sources; add durable drafts and an operation journal.
2. Composition/revision backend migration.
3. Shared engine with dedicated Moodboard shell.
4. Product bindings, covers, publication, remix attribution.
5. Offline/collaboration only after revision conflict model exists.

**Exit:** no demo data or in-memory success path in production; authored board is WYSIWYG.

### Phase 6 — performance and field closure (P1)

1. Release-build tracing on low/mid/high devices.
2. Frame, memory, upload, and crash telemetry.
3. Failure injection for permissions/network/storage/process death.
4. Accessibility and large-text audit.
5. EAS rollout with creator-session health gates.

**Exit:** measurable production budgets pass; not merely TypeScript/tests.

---

## 17. Detailed acceptance scorecard

### Visual composition

- [ ] Media/canvas is the dominant object at 25% thumbnail scale.
- [ ] No more than one non-media panel dominates above the fold.
- [ ] No card-on-card tool composition.
- [ ] Ordinary glyphs use invisible hit areas, not persistent grey plates.
- [ ] No more than two non-avatar radii appear in one editor viewport, excluding modal sheets.
- [ ] One icon family and optical size band per region.
- [ ] Top/bottom scrims are legibility devices, not decorative gradients.
- [ ] Chrome recedes during object manipulation.
- [ ] Dark and light app themes preserve editor geometry and density.

### Camera

- [ ] Camera, microphone, and library permission states are independent and user-triggered.
- [ ] Video can truthfully record muted when microphone access is denied.
- [ ] Tap focus performs real metering on supported devices.
- [ ] Capture viewport owns every guide and coordinate transform.
- [ ] Search framing never overlaps mode rail or system navigation.
- [ ] One-shot is default; Multi Snap is explicit.
- [ ] Shutter is disabled until ready and during unsafe reconfiguration.
- [ ] Interruption, background, incoming audio route, and recorder error recover.

### Editor

- [ ] Four immediately relevant tools maximum plus grouped More.
- [ ] One bottom interaction surface at a time.
- [ ] Every drag operation has a tap/accessibility alternative.
- [ ] Undo/redo covers every destructive or authored change.
- [ ] Crash journal survives process death and missing local media.
- [ ] Tools are generated from capability truth, not screen-local assumptions.
- [ ] Reduce Motion changes spatial transitions to fade/instant behavior.

### Render fidelity

- [ ] Image and video capability matrices are explicit.
- [ ] Edit, preview, viewer, thumbnail, and export share one scene evaluator.
- [ ] No metadata-only effect is advertised as a visible result.
- [ ] Crop/orientation/mirroring remain stable across all surfaces.
- [ ] Golden documents cover every layer, timing, mask, and failure state.

### Publication/backend

- [ ] No local URI reaches publication.
- [ ] Every media binding has a verified finalization receipt.
- [ ] Stable document ID + payload hash/idempotency prevents duplicates.
- [ ] Creation and bindings commit in one transaction.
- [ ] Unknown network outcome has a Check Result action.
- [ ] Full composition is versioned and backend-validated.
- [ ] Interactive layer projection is exact; no coercion.
- [ ] Cache invalidation reaches profile, discovery, detail, drafts, and archive.

### Moodboard

- [x] No mock picker or fallback in the canonical production path; retain this invariant.
- [ ] “Saved locally” means durable storage, not process memory.
- [ ] Real composition, revision, asset bindings, and cover persist.
- [ ] Legacy boards migrate without loss.
- [ ] Product sources have loading/empty/error/offline/partial states.
- [ ] Remix and collaboration have explicit attribution/revision semantics.

### Native quality

- [ ] Tested on physical iOS and Android devices in EAS builds.
- [ ] Tested at 60/90/120Hz where supported.
- [ ] Tested on a low-memory Android device.
- [ ] Tested with 2.0 font scale, screen reader, Reduce Motion, and high contrast.
- [ ] Tested under slow/offline/interrupted network and low storage.
- [ ] Before/after captures retained locally for visual delta comparison.

---

## 18. Risks and decisions that need explicit product ownership

| Decision | Why it matters | Recommended default |
|---|---|---|
| Is authored file export a promised feature? | Determines whether preview-only effects are acceptable | If Share exports media, build native export before advertising advanced effects |
| Minimum Android API for Skia video | Skia video requires API 26+ | Keep native fallback for unsupported devices; gate per capability |
| Are Posters always ephemeral? | Affects expiry, archive, viewer, export, and scheduling semantics | Keep expiry explicit in document/publication, not screen assumption |
| Is Moodboard collaborative at launch? | Requires revision/conflict/presence architecture | Ship durable single-owner first; collaboration second |
| Does AI/cutout run on device or server? | Privacy, latency, cost, offline, and asset provenance | Prefer on-device preview; server refinement only with consent and clear state |
| Are product prices live or snapshot? | Trust and commerce accuracy | Visual snapshot + separately resolved live commerce state |
| Should tool personalization be automatic? | Automatic reorder harms spatial memory | Explicit pin/customize; stable default positions |

---

## 19. Corrections to the previous report

The following earlier recommendations are withdrawn or narrowed:

| Previous claim | Correction |
|---|---|
| No glass tokens are the root cause | False. Capability and composition ownership are the root causes. |
| Most sheets should use 80–100 blur | Unsupported and visually risky. Material is contextual; one functional layer only. |
| Active tool plates should become glass | Only selection/contrast may justify a plate; glass is not required. |
| Primary buttons should universally be pills | Shape follows role and platform; do not impose capsules everywhere. |
| Springs are categorically more flagship than timing | False. Motion must express state/spatial continuity and respect Reduce Motion. |
| Blocking publish is inherently outdated | False. Background posting is only correct when the lifecycle, recovery, and truth model support it. |
| Competitor UI values can be estimated from screenshots | Do not encode unverifiable measurements as benchmark facts. |
| “2015 → 2026” is mainly opaque → glass | False. The real delta is static, lossy, happy-path UI → direct, reversible, capability-complete, durable systems. |

The only material rule retained is narrow: over-media navigation or controls may use platform material when it improves legibility and establishes one functional control layer. Content, rows, and every tool should not become glass.

---

## 20. Primary sources

All platform/library sources were checked against the documentation available on 24 August 2026. First-party product pages describe advertised capabilities; they are not independent proof of usability quality.

[^apple-design-system]: Apple, [Get to know the new design system — WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/).
[^apple-liquid-glass]: Apple, [Meet Liquid Glass — WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/) and [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/).
[^apple-accessibility]: Apple Human Interface Guidelines, [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
[^apple-capture-auth]: Apple AVFoundation, [Requesting authorization to capture and save media](https://developer.apple.com/documentation/AVFoundation/requesting-authorization-to-capture-and-save-media).
[^apple-photos-picker]: Apple PhotosUI, [PhotosUI overview](https://developer.apple.com/documentation/photosui) and [PhotosPicker](https://developer.apple.com/documentation/photosui/photospicker).
[^avfoundation]: Apple, [AVFoundation](https://developer.apple.com/documentation/avfoundation/).
[^avcomposition]: Apple, [AVComposition](https://developer.apple.com/documentation/avfoundation/avcomposition).
[^avexport]: Apple, [AVAssetExportSession](https://developer.apple.com/documentation/avfoundation/avassetexportsession).
[^vision-video]: Margelo, [VisionCamera — The Video Output](https://visioncamera.margelo.com/docs/video-output).
[^vision-focus]: Margelo, [VisionCamera — Tap To Focus](https://visioncamera.margelo.com/docs/tap-to-focus).
[^vision-coordinates]: Margelo, [VisionCamera — Coordinate Systems](https://visioncamera.margelo.com/docs/coordinate-systems).
[^skia-video]: Shopify, [React Native Skia — Video](https://shopify.github.io/react-native-skia/docs/video/).
[^skia-install]: Shopify, [React Native Skia — Installation and compatibility](https://shopify.github.io/react-native-skia/docs/getting-started/installation/).
[^media3-transformations]: Android Developers, [Media3 Transformer — Transformations](https://developer.android.com/media/media3/transformer/transformations).
[^media3-getting-started]: Android Developers, [Media3 Transformer — Getting started](https://developer.android.com/media/media3/transformer/getting-started), updated 14 August 2026.
[^expo-media-library]: Expo, [SDK 57 MediaLibrary](https://docs.expo.dev/versions/v57.0.0/sdk/media-library/).
[^reanimated-performance]: Software Mansion, [Reanimated — Performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/).
[^reanimated-flags]: Software Mansion, [Reanimated — Feature flags](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/).
[^android-rendering]: Android Developers, [Slow rendering](https://developer.android.com/topic/performance/vitals/render).
[^android-performance-measurement]: Android Developers, [Overview of measuring app performance](https://developer.android.com/topic/performance/measuring-performance).
[^s3-multipart]: AWS, [Uploading and copying objects using multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) and [Checking object integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html).
[^wcag-drag]: W3C WAI, [Understanding SC 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
[^wcag-target]: W3C WAI, [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
[^direct-manipulation]: Ben Shneiderman, [Direct Manipulation: A Step Beyond Programming Languages](https://www.cs.umd.edu/~ben/papers/Shneiderman1983Direct.pdf), *IEEE Computer*, 1983.
[^hick]: W. E. Hick, [On the Rate of Gain of Information](https://doi.org/10.1080/17470215208416600), *Quarterly Journal of Experimental Psychology*, 1952.
[^choice-overload]: Benjamin Scheibehenne, Rainer Greifeneder, and Peter M. Todd, [Can There Ever Be Too Many Options? A Meta-Analytic Review of Choice Overload](https://doi.org/10.1086/651235), *Journal of Consumer Research*, 2010.
[^shuffles-app]: Pinterest, [Shuffles by Pinterest — official App Store listing](https://apps.apple.com/us/app/shuffles-by-pinterest/id1573869498).
[^pinterest-shuffles-shopping]: Pinterest Newsroom, [Recapturing the Joy of Shopping with Pinterest](https://newsroom.pinterest.com/news/recapturing-the-joy-of-shopping-with-pinterest/) and [Shuffles expands](https://newsroom.pinterest.com/news/shuffles-by-pinterest-expands-to-nine-additional-countries/).

Additional first-party benchmark context:

- Meta, [Introducing Edits: A Streamlined Video Creation App](https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/).
- Meta, [One Year of Edits: Built For and With Creators](https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/).
- Meta AI, [Bringing Segment Anything to Instagram Edits](https://ai.meta.com/blog/instagram-edits-cutouts-segment-anything/).
- Snap, [Empowering Content Creation with New Tools, Features, and Insights](https://newsroom.snap.com/empowering-content-creation-with-new-tools) — Timeline Editor, layered tools and Memories templates, 12 June 2025.
- Pinterest, [Introducing new ways to create and share collages](https://newsroom.pinterest.com/en-ca/news/introducing-new-ways-to-create-and-share-collages/) — cutouts, drafts, remix provenance and video sharing, 24 September 2024.
- Pinterest, [Pinterest boards get AI-powered upgrade for personalized experience](https://newsroom.pinterest.com/news/pinterest-boards-get-ai-powered-upgrade-for-personalized-experience/) — personalized boards and shoppable AI collages, 27 October 2025.
- Android Developers, [Window insets and edge-to-edge](https://developer.android.com/develop/ui/compose/system/insets).

---

## 21. Final recommendation

Do not begin with another visual-token sweep.

Begin with the remaining truth lockdown: deterministic permission-to-recorder reconfiguration, golden proof for real focus and exact Poster projection, durable Moodboard documents, and an executable capability registry. Do not spend another cycle rebuilding the mock-removal, focus-call, or fail-closed projection work that the current tree already contains. Then unify capture geometry and rendering. Only after those layers are stable should the native visual convergence loop adjust spacing, icon containment, scrims, materials, and motion against real EAS device captures.

The flagship benchmark is met when a creator can capture or select media, author a Look/Poster/Moodboard, recover from interruption, publish once, and see the exact same result everywhere—without encountering a control whose visual promise exceeds its implementation.
