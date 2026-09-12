# Wave 12 — Editing Model & Interaction Layer Audit: CapCut, VN, TikTok

**Date:** 2026-09-11 · **Purpose:** Evidence-backed benchmark of best-in-class mobile video editors' editing model + interaction layer, for evaluating a competitor's React Native implementation.

**Evidence classes:** `[DOC]` official vendor docs/help/app-store listing · `[CODE]` source code / reverse-engineered schema / SDK source · `[TALK]` engineering talk · `[PRESS]` newsroom/press · `[FORUM]` community/forum evidence (behavioral, weaker) · `[GUIDE]` third-party tutorial (behavioral, weaker).

---

## 1. CapCut — Timeline Architecture

### 1.1 Document model (reverse-engineered, high confidence)

CapCut's project is a single JSON draft (`draft_content.json` / `draft_info.json`) with a **decoupled tracks-vs-materials model**:

- `tracks[]`: z-ordered array of typed lanes — `video`, `audio`, `text`, `sticker`, `effect`, `filter`, `subtitle`. Array order = layer order (first = bottom). Canonical bottom→top rank CapCut expects: `video(0) < audio(1) < sticker(2) < effect(3) < filter(4) < text(5)`. [CODE]
- Each `Track` holds `segments[]`. A segment carries:
  - `material_id` → points into a flat `materials{}` pool (one video material can back N segments — deduplicated reuse).
  - `target_timerange{start,duration}` — placement on the timeline, **microseconds**.
  - `source_timerange{start,duration}` — the trim window into source media.
  - `extra_material_refs[]` — companion materials: **speeds, masks, animations, transitions, vocal separations, canvases**. Speed is modeled as a *companion material*, not a clip property. [CODE]
  - `clip{}` block (transform x/y, scale, rotation, alpha) — present on visual segments, `null` on audio (setting it on audio crashes CapCut). [CODE]
- Root: `id`, `duration` (µs), `fps`, `canvas_config{width,height,ratio}`. [CODE]

Sources: capcut-cli draft schema docs (cdn.jsdelivr.net/npm/capcut-cli@0.23.0/docs/draft-schema/01-tracks-and-segments.md); github.com/renezander030/capcut-cli `src/draft.ts`; deepwiki.com/renezander030/capcut-cli/3-draft-schema.

**Benchmark significance:** the de-facto industry shape is *Document (µs timeline) → Tracks (z-order) → Segments (target vs source timerange) → Materials (deduped assets) + companion-material refs for derived state (speed, mask, transition)*. ByteDance's own NLE SDK mirrors it (§7.1).

### 1.2 Track model & clip binding

- **Main (primary) video track is gapless/magnetized.** CapCut does not allow real gaps on the main track — deleting/moving clips closes space automatically; "Auto Snapping" only affects alignment, not gap removal. Users simulate gaps with placeholder/black/freeze clips. [FORUM: capeditcut.com/community/capcut/creating-space-between-clips-on-timeline; studyraid timeline guide] Corroborated by Desktop toolbar exposing **Main Track Magnet** + **Auto Snapping** + **Linkage** toggles. [GUIDE: filmora.wondershare.com/advanced-video-editing/capcut-timeline.html]
- **Overlays are timeline-bound, not clip-bound.** Overlays/PiP live on their own tracks above the main track with independent `target_timerange`; they do NOT belong to a clip. [CODE schema + GUIDE capcutguide.com/how-to-add-overlay-in-capcut]
- **Track Linkage** (chain-link toggle; `~` on desktop) optionally binds text/audio/overlay elements to the main-track clip beneath them so they move/delete with it. Independent positions are the default data model; linkage is an interaction-layer convenience, not a data-model parent-child. [FORUM: capeditcut.com/community/capcut/video-deletion-problem; capeditcut.com/community/capcut/moving-clips-around]
- **Compound clips** (`Alt+G` desktop) nest a selection (clips + SFX + overlays) into a single segment so the whole unit ripples together — the robust answer to "keep SFX synced to a clip when earlier clips shift." **Grouping** (`Ctrl+G`) is a lighter multi-select bundle. [FORUM: capeditcut.com/community/video-editing/sound-effects-must-be-made-to-move-with-the-video; filmora timeline guide]
- **Multiple timelines per draft:** up to 50 timelines within one CapCut draft (desktop), used for section-based revisions. [DOC: capcut.com/create/ai-video-editing-workflow-segment-fixes]
- Track management: per-track **Hide / Lock / Mute**. [GUIDE: filmora]

### 1.3 Clip operations

| Op | Mechanics | Evidence |
|---|---|---|
| Trim | Drag white edge handles inward; non-destructive — re-extendable to source boundary (source_timerange). | [GUIDE: capcutguide.com/how-to-cut-trim-split-video-capcut; hollyland.com blog] |
| Split | Playhead-positioned split of the *selected* layer → two segments sharing one material_id. Ctrl+B desktop; Blade tool `B` cuts all layers with Shift. | [GUIDE: capcutguide; creativepadmedia.com] |
| Ripple trim | Desktop `Q`/`W` = "Delete Left/Right" one-key trim-to-playhead; magnet auto-closes gaps. | [GUIDE: creativepadmedia] |
| Speed | Normal mode **0.1×–100×**; Curve mode 0.1×–10×; "Keep pitch" toggle; Smooth slow-mo via **Frame Blending (fast) or Optical Flow (quality)** at 30/50/60fps. | [DOC+GUIDE: hitpaw guide; capcut.com/resource/optical-flow-in-capcut; vocalremover.easeus.com] |
| Reverse | Per-clip reverse render (desktop + mobile). | [GUIDE: filmora timeline context menu "Freeze / Reverse / Mirror / Rotate"] |
| Freeze | Playhead → Edit → Freeze inserts a **still-image segment** at the playhead as a separate clip; drag edge to set hold duration. | [GUIDE: hollyland.com; capcut.com/resource/how-to-use-freeze-frames] |
| Replace | Media-bin Replace swaps underlying asset, preserving segment timing (workaround for keeping timed text/music). | [FORUM: capeditcut.com video-deletion-problem] |

---

## 2. CapCut — Interaction Mechanics

- **Pinch-to-zoom time scale** is the primary precision mechanism on mobile: pinch outward on the timeline before cuts; zoom makes handles effectively frame-accurate. [GUIDE: hollyland, capcutguide, videowizardtools keyframe guide]
- **Scrubbing:** drag playhead on time ruler; desktop adds a **Preview Axis** (hover-scrub without moving playhead). Clips snap to frame boundaries — sub-frame positioning impossible by design ("video editors can't place clips between video frames"). [FORUM: capeditcut.com snapping-interval thread; studyraid]
- **Snapping targets:** clip edges, playhead, markers, beat markers. Two independent toggles: magnet (gap-closure) vs snapping (alignment). [FORUM + GUIDE]
- **Trim handles:** slim visible handles with implicit larger touch targets; while dragging, preview shows the exact new in/out frame. Haptic ticks during trim/scrub ride on **system haptics** — no in-app toggle exists (Android "Vibration feedback" / iOS "System Haptics"). [FORUM: capeditcut.com/community/capcut/haptic-feedback — moderate confidence]
- **Clip reorder:** drag clip horizontally on its lane; on main track everything after shifts (magnet).
- **Undo/redo:** full undo/redo on mobile + desktop (toolbar buttons; Ctrl+Z family on desktop). ByteDance's editor stack implements undo/redo via a **transaction mechanism** in the NLE layer (see §7.1/7.5). [TALK + DOC]
- **Autosave/recovery:** every edit autosaves to the local draft — no Save button; crash/phone-die recovery to last save point. Local-first: drafts die with app uninstall unless synced to **CapCut Spaces** (cloud) or exported. Deleted projects → Trash (restorable). "History tasks" remain editable. [DOC: capcut.com/help/modify-history-task; capcutguide.com/where-does-capcut-save-projects; videowizardtools storage guide]

---

## 3. CapCut — Speed Curves & Keyframes

- **Speed Curve editor:** presets — **Montage, Hero, Bullet, Jump Cut, Flash In/Out** (per Oct-2025 listing; earlier builds show 5-point graphs) + **Custom**. Custom curve: draggable control points (add/move/remove), upper graph region = up to 10×, lower = down to 0.1×, horizontal spread controls ramp duration; "Smooth slow mo" checkbox applies optical-flow/frame-blend interpolation. On desktop, applying a curve adds a visible **speed track** lane under the clip. [DOC: capcut.com/tools/speed-ramp; capcut.com/resource/how-to-do-velocity; capcutguide.com/capcut-velocity-edit; vediting.home.blog 2025-10-28 preset table]
- **Auto Velocity / Auto Cut / Beat markers:** beat markers are timing references (not speed changes); Auto Velocity proposes a styled ramp. [capcutguide]
- **Keyframes:** diamond control on the selected element; tap once at start pose, move playhead, change property → **second keyframe auto-created**. Keyable props on mobile/desktop/web baseline: **Position, Scale, Rotation, Opacity** (desktop exposes diamonds per-property in right panel). Keyframe diamonds render as markers on the clip; **graph icon** beside the diamond opens interpolation curves — **Linear, Ease In, Ease Out, Ease In-Out**; desktop adds bezier/3D. Gestures: drag diamonds to retime, double-tap for exact values, re-tap diamond over a keyframe to delete. Pinch on canvas edits Scale+Position together (gesture itself can author keyframes). [GUIDE: capcutguide.com/how-to-use-keyframes-in-capcut; videowizardtools.com/keyframes-in-capcut; createthat.ai blog]

---

## 4. CapCut — Preview vs Export Parity

- **Preview is a live approximation, not committed output** — preview engine renders color/effects in real time on the display profile; export flattens to one stream. Known divergence classes: low default "Recommended" bitrate (banding in shadows/midtones), HEVC gamma-tag shift (esp. MOV/QuickTime on Mac), HDR→SDR tone-mapping mismatch, color-space misalignment (CapCut assumes Rec.709 SDR unless HDR project). [capcut.com/help/video-quality-change-after-exporting; editlogic.io gamma fix; miracamp color-space guide]
- **Proxy mode** (desktop, Settings→Performance): lower-res preview copies for smooth scrub; must be disabled for quality checks — documented as a preview-quality feature, export unaffected. [DOC: capcut.com/help]
- **Export tiers:** 720p / 1080p / 2K(1440p) / 4K(2160p), up to 60fps, bitrate presets + custom Kbps. Availability gated by **device hardware + source media res + account tier** (free tier watermarks/bitrate-limits 4K; Pro unrestricted). Android: only high-end chipsets expose 4K. Web: cloud-rendered, needs HW-encode-capable browser. [DOC: capcut.com/help/export-videos-in-capcut, updated Jan-2026]
- Mobile storage model: imported media copied into app storage; preview render cache; per-project draft data; exports on top. Cache clear ≠ project loss; uninstall = draft loss. [videowizardtools storage guide]

---

## 5. VN Video Editor (Ubiquiti Labs)

- **Multi-track model:** unlimited video/audio/text/overlay tracks in one timeline; overlays = independent PiP tracks; masks (9 shapes), track-hiding controls. [DOC: apps.apple.com listing; play.google.com listing; vlognow.me/blog/features/multi-track-timeline]
- **Editor Preferences — the differentiator:** VN exposes CapCut's implicit behaviors as explicit user settings:
  - **Main Track Mode: Quick vs Pro.** Quick keeps main-track clips connected (magnetized); Pro enables **Auto-Ripple** toggle — on: later clips shift after an edit; off: timestamps fixed, gaps allowed. [DOC: vlognow.me/help/getting-started/editing-101]
  - **Track Linkage:** when on, text/audio/overlay elements move & delete with the main-track clip; when off they keep timeline positions. [DOC: same]
- **Precision:** frame-accurate trimming to **0.05s**, timeline zoom to **30×**; "PC track edit design" ported to touch. [DOC: app store + Play listings]
- **Trim UX:** drag clip edges (instant drag-to-trim) or dedicated Trim mode for duration; long-press a clip to swap; **swipe up/down to delete** selected clips; drag-and-drop reorder. [DOC: vlognow.me editing-101 + trim feature page]
- **Speed Curve:** presets **Montage, Hero Time, Bullet Time, Jump Cut, Fast In, Fast Out** + custom (add/move/remove points); 0.1×–100×; apply-to-all-clips. **Smooth Slow Motion** = AI frame interpolation. [DOC: vlognow.me/blog/features/speed-curves; Play listing]
- **Keyframes:** 19 built-in keyframe effects + custom keyframe **curves** (added v2.18.0, Aug 2025) on nearly every parameter. [DOC: capcutguide VN review citing iOS release notes]
- **Beat editing:** manual beat markers to sync cuts; BeatsClips/AutoCut auto-assemble to music.
- **Project model:** auto-save, non-destructive, full undo/redo; projects managed from home (rename/duplicate/move/share/delete); **no cloud** — project files transfer via AirDrop/iCloud/file share; **Protection Mode** = password + expiration date on drafts/templates; custom export res/fps/bitrate up to 4K60; **Dolby Vision HDR** editing on iPhone 12+. [DOC: vlognow.me editing-101; App Store listing]
- Positioning: free, no watermark, no ads; weaker AI/cloud story than CapCut; the manual-control editor. [capcutguide.com/vn-video-editor-review]

---

## 6. TikTok In-App Editor

- **Two-phase editing model.** Phase 1 = **multiclip editor** ("Adjust clips"): sequential clip lane — stack, trim (white/pink edge handles), split at playhead, long-press-drag **reorder** (clip "lifts" off the lane), **Replace** (swap a clip from camera roll without restarting), delete. Phase 2 = post-production screen (sounds, text w/ duration, stickers, effects, PiP overlays, per-clip speed, rotate/zoom). [PRESS: newsroom.tiktok.com/en-us/editing-tools (Oct 2022 toolset, still current shape); trypostbase.com guides]
- **Critical structural limitation:** tapping **Next** *bakes the clip sequence into a single video* for post-production. A saved draft **cannot gain new clips or replace footage** — only decorations (sound/text/effects) remain editable. The multiclip timeline is a one-way door. [trypostbase.com/resources/how-to-add-a-clip-to-a-tiktok-draft; how-to-edit-a-draft-on-tiktok]
- **Precision:** pinch-zoom the timeline for finer trims; preview scrubs to the dragged handle position; pink markers denote clip boundaries. [smarterme.sg; trypostbase]
- **Drafts:** stored **locally on-device** (not cloud, not cross-device); reopened via profile → posting screen → back arrow into editor. [trypostbase]
- Editor vs CapCut: deliberately shallow — single sequential track, no free overlay timing until post phase, no keyframes/curves; optimized for speed-to-post, and drafts are disposable. TikTok's editing stack is ByteDance's VE SDK (§7.1).

---

## 7. Industry-Standard Compositor Architecture (SDK evidence)

### 7.1 BytePlus VE SDK — ByteDance's production engine (powers TikTok, Douyin, CapCut, Xigua, FaceU, Ulike)

Two-SDK split — **the canonical separation of model vs renderer**: [DOC: docs.byteplus.com VE SDK product overview + detailed dev guide v4.0.2]

- **VESDK** (`com.bytedance.ugc.framework.libs:vesdk`): media rendering — composer, OpenGL ES 3.0 pipeline, encode.
- **NLE SDK** (`NLEMediaPublic` + `NLEProcessor`): non-linear-editing middleware — pure model/ops, **no rendering**. Data model is a tree: **NLEModel → NLETrack (z-axis layer) → NLETrackSlot (time segment) → NLESegment (secondary processing: time-edit, filter intensity) → NLEResourceNode/NLEResourceAV (asset URIs + thresholds)**.
- **NLEPlatform** provides **undo/redo capability + standardized cross-device draft protocol** — undo is an engine-level transaction system, and the draft format is what makes a CapCut mobile project open on desktop.
- iOS pod structure reveals layering: `CKEditor`, `NLEEditor`, `DVETrackKit` (track UI kit), `DVEFoundationKit`, `NLEPlatform`, `TTVideoEditor`. [DOC: quick integration guide iOS]
- Feature-level proof: "Multi-track editing — finger drag to adjust position of audio and video, crop, move forward/backward; real-time render preview accurate to each frame; PiP." [DOC: product overview]

### 7.2 ByteDance Intelligent-Creation web editor (CapCut Web class) — Meng Qian talk [TALK: sgpjbg.com/baogao/181045.html]

- **3-layer V/VM/C architecture**: V = per-tool UI components; VM = type interfaces, pub/sub framework, **transaction management** (undo/redo for AV ops, small-data merging, VE scheduling serialization), unified state; C = WASM comms, worker management, async→sync bridging.
- Perf stack: **WebCodecs hardware decode** (≤1080p local), HTTP/2 concurrent download, WebM streaming, **OPFS** file cache, multi-threaded offscreen render, sharded WASM download + cache, editing-resource preload.

### 7.3 Meishe (Meicam) NvsStreaming SDK [DOC: meishesdk.com docs]

- **NLE-shaped runtime:** `NvsStreamingContext` → `createTimeline` → `appendVideoTrack/appendAudioTrack` → clips; **tracks are layers rendered bottom-up**; effects attachable at **three scopes: timeline, track, clip**; transitions only **between adjacent clips** on a track; captions/stickers/themes as timeline-level FX. Serialized timeline JSON shows per-effect `keyFrames[]` (time + float value) — keyframes are effect properties.
- WYSIWYG claim: real-time preview of every effect, no pre-compositing; **same project file cross-platform** (mobile→PC finish); dynamic compute allocation for thermals.

### 7.4 IMG.LY CE.SDK [DOC: img.ly/docs/cesdk]

- Single-threaded **CreativeEngine** + 6 API namespaces; content tree **Scene → Page → Track → Clip**; a clip = *graphic block with a video fill* (same API surface as text/shapes → uniform transform/FX model). `track` blocks **auto-sequence children** (built-in magnetic behavior); page `playback/time` drives the frame; **same engine renders canvas preview and headless export** → parity by construction.

### 7.5 Banuba VE SDK [CODE+DOC: github.com/Banuba/VideoEditor-iOS; banuba.medium.com RN article]

- `VideoEditorService` owns all transforms (effects/sound/time/trim); `VideoEditorAsset` = composition of `VideoEditorAssetTrackInfo[]` each with `timeRange` trim + thumbnails; playback/export consume the same `VideoSequence`.
- **RN architecture (explicitly stated):** RN owns UI/interactions only → bridge → native SDK (Swift/Kotlin) → AVFoundation+VideoToolbox / MediaCodec+OpenGL ES. "Video processing is resource-intensive and ultimately runs on native platform APIs — React Native does not abstract this away, nor should it." HW encode = **3–5× faster** than software. Non-negotiables listed: frame-accurate timeline, HW-accelerated export, memory mgmt under sustained load.

### 7.6 Tencent UGSV / TAVEditor [DOC: tencentcloud.com product 1069]

- Model lists per layer type: `getClipModels / getBgmModels / getVoiceoverModels / getTextModels / getOverlayModels` — overlays/BGM/text as **parallel model collections**, not nested in clips.
- `ITAVEditInterceptor` = **policy hooks** (`canAddNewTrack:type:count:`, `canSplitTrack:currentTime:timeRange:`) — editing constraints injected as an interceptor layer, clean separation of "is this op allowed" from "do this op."
- Export: `generateVideo` (custom pipeline) vs `quickGenerateVideo` (system fast path) vs **two-pass encoding** for quality; progress/complete callbacks.

### 7.7 System-design consensus [techinterview.org mobile-video-editor post]

Document = source of truth; edits → new doc state; renderer derives frames. Pipeline: decode → YUV→RGB on GPU → per-clip shaders → multi-track alpha composite → same graph outputs preview AND export. Perf: preview-res frame caching, warm popular shaders, release frames behind playhead, thermal → auto-lower preview quality, proxy media.

---

## 8. Transferable Mechanisms → RN Implementation

| # | Mechanism | Evidence | RN transfer note |
|---|---|---|---|
| 1 | **Model/renderer split**: immutable timeline doc (µs, tracks→segments→material refs) vs render engine. Undo = transaction log on doc, not UI actions. | BytePlus NLE/VESDK split; capcut draft JSON; CE.SDK engine; ByteDance V/VM/C | Keep doc in JS (or WASM); renderer native. JS-side transaction/command stack is cheap and serializable. |
| 2 | **Gapless main track + free overlay lanes**: primary lane is magnetized/sequential (CE.SDK `track` auto-sequences too); secondary lanes carry absolute `target_timerange`. | CapCut magnet forums; VN Quick vs Pro mode; IMG.LY track | Two lane types beats one general track: `sequence` lane (auto-close, ripple) + `free` lanes (absolute time). |
| 3 | **Track Linkage as interaction layer**: cross-track binding is a toggle computed at edit time, not stored parent-child. | CapCut linkage; VN Editor Preferences | Implement as op-expansion: moving clip X also selects linked overlapping segments. |
| 4 | **Companion materials for derived state**: speed/mask/transition stored as separate material entities referenced by segment, not clip fields. | capcut-cli `extra_material_refs` | Keeps segment schema stable; curves = a `speed` material with control points. |
| 5 | **Speed curve = point list on a per-clip overlay lane**; presets are named point sets; UI = draggable control points on a 0.1×–10× graph. | CapCut/VN curve docs | One `SpeedCurve{points:[{t,v}], handles}` type; presets are constants. |
| 6 | **Keyframe UX pattern**: diamond toggle + auto-create on property change + on-clip markers + easing popover (Linear/EaseIn/EaseOut/EaseInOut). | CapCut keyframe guides; Meishe `keyFrames[]` | Property-change-while-keyframe-armed ⇒ insert keyframe at playhead. |
| 7 | **Frame-quantized editing**: all ops snap to frame grid; pinch-zoom increases effective px/frame; preview mirrors handle drag target frame. | CapCut frame-snap forum; VN 0.05s/30× | pxPerSecond state + `snap(t)=round(t*fps)/fps`; haptic tick on snap crossing. |
| 8 | **Two-toggle snapping**: gap-closure (magnet) ≠ alignment-snap (edges/markers/playhead/beats). | CapCut desktop toolbar; VN prefs | Independent booleans; snap targets = sorted candidate list per drag. |
| 9 | **Interceptor/policy layer** for edit constraints (`canSplit`, `canAddTrack`). | Tencent `ITAVEditInterceptor` | Pure functions over doc → enables per-surface rules without touching ops. |
| 10 | **Preview≠export acceptance**: preview is live approximation; parity via *same* engine/graph for both paths (CE.SDK headless, Meishe WYSIWYG); proxies & quality-degrade only affect preview. | capcut proxy help; CE.SDK; Meishe | RN: build one native render graph consumed by player view AND export session; add proxy tier for 4K sources. |
| 11 | **Autosave-as-draft + explicit cloud opt-in**; crash recovery to last transaction; trash for deleted projects; exported MP4 ≠ backup. | CapCut/VN autosave docs; TikTok local drafts | Persist doc per transaction (JSON append/debounce); recovery = last good doc. |
| 12 | **One-way bake step** (TikTok): cheap UX for casual flow — assemble sequence → commit → decorate. | trypostbase TikTok drafts | Optional "commit sequence" gate simplifies state space for lightweight editing surfaces. |
| 13 | **Hardware-encode export 3–5× faster**; export options = res × fps × bitrate grid gated by device capability. | Banuba RN article; CapCut export help | Never software-encode on device; probe encoder caps for option grid. |
| 14 | **Compound clip** as nested timeline segment to keep grouped assets coherent under ripple edits. | CapCut compound/SFX forum | Segment type `composition` referencing child doc — solves link-integrity under magnet. |
| 15 | **Freeze = inserted still-image segment** at playhead (reuses image-segment machinery, not a speed=0 hack). | hollyland/CapCut resource | Emit image segment + split source; drag-edge duration for free. |

---

## Source List (primary)

1. capcut-cli draft schema — cdn.jsdelivr.net/npm/capcut-cli@0.23.0/docs/draft-schema/01-tracks-and-segments.md [CODE]
2. renezander030/capcut-cli src/draft.ts + DeepWiki draft-schema pages [CODE]
3. BytePlus VE SDK docs v4.0.2 — product overview, detailed dev guide, iOS quick integration — docs.byteplus.com [DOC]
4. ByteDance Intelligent-Creation talk (Meng Qian) — sgpjbg.com/baogao/181045.html [TALK]
5. Meishe SDK docs — meishesdk.com (Overview_8md, MeisheEditor, TimelineStructureDescription, blog/108) [DOC]
6. IMG.LY CE.SDK docs — img.ly/docs/cesdk (architecture, timeline-editor, overview, join-and-arrange) [DOC]
7. Banuba — github.com/Banuba/VideoEditor-iOS; banuba.medium.com RN article; VE SDK white paper [CODE/DOC]
8. Tencent Cloud UGSV/TAVEditor docs — tencentcloud.com/document/product/1069 (79160, 38013, 79161, 51027) [DOC]
9. CapCut official — capcut.com/help (export-videos, video-quality-change, modify-history-task), /tools/speed-ramp, /tools/optical-flow, /resource/* , /create/* [DOC]
10. VN official — vlognow.me help/getting-started/editing-101, /blog/features/{multi-track-timeline,speed-curves,trim}; App Store + Google Play listings [DOC]
11. TikTok — newsroom.tiktok.com/en-us/editing-tools; techcrunch.com/2022/10/06 [PRESS]
12. Behavioral guides/forums — capcutguide.com (trim/split, keyframes, velocity, overlay, VN review, save-locations, project-safety); capeditcut.com community (linkage, magnet gaps, snapping, haptics); trypostbase.com (TikTok drafts/adjust-clips); videowizardtools.com (autosave, storage); filmora.wondershare.com CapCut timeline guide; creativepadmedia.com; hollyland.com; techinterview.org system-design post [GUIDE/FORUM]
