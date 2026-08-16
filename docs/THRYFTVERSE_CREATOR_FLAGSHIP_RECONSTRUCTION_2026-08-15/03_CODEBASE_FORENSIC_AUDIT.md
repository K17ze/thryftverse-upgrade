# 03 — Codebase Forensic Audit

## Audit anchor

- Repository: `K17ze/thryftverse-upgrade`
- Branch: `feat/product-detail-contract-media-device-closure`
- HEAD at audit: `7273211383f6553bd6813a824140a99d50555111`
- HEAD date: 15 Aug 2026
- Latest commit also reports `tsc` clean and 1269 tests passing; this audit does not treat that as visual-quality evidence.

## Stack verdict

The technology stack is **not** the flagship blocker.

Current branch includes:
- Expo 57;
- React Native 0.86.2;
- React 19.2.3;
- Reanimated 4.5.1;
- RNGH 2.32.x;
- React Native Skia 2.6.2;
- Expo Camera 57;
- Expo ImagePicker / MediaLibrary;
- Expo ImageManipulator;
- Expo Video;
- FlashList;
- haptics, blur, image caching, file system, async storage.

A native Swift/Kotlin rewrite is not justified by the problems found here.

## Current architecture that is GOOD

### Dedicated composer split
`CreatorStudioShell.tsx` now sends:
- Look → `look/LookComposerScreen`
- Poster → `poster/PosterComposerScreen`

This is the correct direction because temporal and spatial creation require different interaction architectures.

### Stronger document vocabulary
`composition.ts` models:
- media;
- text;
- product;
- mention;
- look;
- poll/vote;
- quiz;
- question;
- emoji slider;
- countdown;
- decorative shapes;
- drawing;
- GIF;
- music;
- link;
- location;
- hashtag;
- time;
- weather.

### Normalized transform vocabulary
Each layer carries:
- x/y;
- width/height;
- scale;
- rotation;
- z-index;
- locked/hidden;
- opacity.

This is a reasonable basis for direct manipulation and canonical rendering.

### Current camera is more mature than older audits claim
Current `CreatorCamera.tsx` delegates to:
- `camera/FocusReticle.tsx`
- `camera/RecordingRing.tsx`
- `camera/ShutterButton.tsx`
- `camera/ControlsRail.tsx`
- `camera/GalleryCarousel.tsx`
- `camera/PermissionState.tsx`

Current camera code uses RNGH/Reanimated. Therefore the August 8 audit's "legacy Animated + PanResponder monolith" criticism is **stale** for the live branch.

## P0 findings

### P0.1 — Poster still lacks a true temporal editing architecture

Relevant code:
- `poster/PosterComposerScreen.tsx`
- `composition.ts`

Evidence:
- frame/page model exists;
- page duration exists;
- media trim fields exist;
- frame tray exists;
- progress segment exists.

Gap:
- no primary clip track architecture in the composer;
- no surfaced split/speed/volume/clip crop/rotate workflow comparable to Snapchat Timeline Editor;
- text/sticker/music do not have a first-class time range track in `CreatorLayer`;
- clip transitions/keyframes are not represented as first-class document concepts.

**Required:** `PosterTimeline` becomes a core surface, not an accessory sheet.

### P0.2 — "Cutout" semantics are still misleading at product level

`CreatorCutoutSheet.tsx` now truthfully documents itself as a **manual trace-and-crop tool** and the visible sheet title is `Manual Crop`.

However `LookComposerScreen.tsx` still exposes `Cutout` in its default editing language and routes selected media into that tool.

The implementation explicitly says:
- it is not background removal;
- it crops to a traced bounding rectangle;
- a segmentation model/service would be needed for true transparency.

**Required:** until real segmentation exists, rename the Look action to `Crop` / `Trace crop`; do not imply Pinterest/Snapchat-like subject cutout.

### P0.3 — CreatorAssetPicker remains an interaction architecture bottleneck

`CreatorAssetPicker.tsx` owns modes for roughly twenty conceptually different tools.

That creates:
- enormous component responsibility;
- shared generic sheet treatment for unrelated tasks;
- high rerender surface;
- harder testing;
- inconsistent bespoke interaction opportunities.

**Required split:**

```text
creator/
  tools/
    media/
      MediaBrowser.tsx
      MediaPreview.tsx
      MediaEditPanel.tsx
    text/
      TextEditor.tsx
      FontRail.tsx
      TextStyleRail.tsx
      TextAnimationRail.tsx
    commerce/
      ProductBrowser.tsx
      ProductTagEditor.tsx
    stickers/
      StickerBrowser.tsx
      PollEditor.tsx
      QuizEditor.tsx
      QuestionEditor.tsx
    drawing/
      DrawingWorkspace.tsx
    audio/
      AudioBrowser.tsx
      AudioClipEditor.tsx
    location/
    links/
```

Use a tool registry to declare availability/order, not one mega component to implement all tools.

### P0.4 — Draft projects are not durable enough

`CreatorDraftService` stores the project JSON in AsyncStorage. That JSON can contain `file://`, `ph://`, `content://` and other URIs.

Problems:
- external/local URIs can become unavailable;
- cache files can be evicted;
- AsyncStorage is not a project-media package;
- no crash journal;
- no atomic media import/copy;
- no real project thumbnail generation in draft metadata;
- no abandoned-file garbage collection.

**Required project package:**

```text
creator-projects/<project-id>/
  project.json
  manifest.json
  previews/
    cover.webp
  media/
    <stable-asset-id>.<ext>
  proxies/
    <clip-id>-720p.mp4
  thumbnails/
    <clip-id>-0001.webp
  recovery/
    journal.jsonl
```

### P0.5 — Upload is still a foreground sequence

`uploadAllLocalMedia()`:
- scans local URIs;
- loops sequentially;
- retries each upload twice;
- uses a small backoff;
- returns an updated document.

Missing:
- persisted queue;
- chunk/resume;
- byte-level progress;
- bounded parallelism;
- pause/cancel;
- background transfer;
- upload continuation after app termination;
- durable correlation between local asset and remote upload job.

**Required:** a `CreatorUploadManager` decoupled from `CreatorPublishSheet`.

## P1 findings

### P1.1 — Camera zoom labels overstate camera semantics

Current `CreatorCamera.tsx` maps:
- `1×` → normalized zoom 0
- `2×` → 0.5
- `3×` → 1

Those are UI labels over Expo's normalized digital zoom range; they are not verified physical lens focal lengths.

**Fix:** either:
- expose only verified lens choices using platform capability information; or
- call them `1× / Zoom / Max` only if device mapping is accurate; or
- use a continuous zoom control without pretending lens equivalence.

### P1.2 — Camera asks for media-library permission too early

The camera loads recent gallery assets and requests library permission on mount.

That can create a privacy/permission interruption before the user has expressed gallery intent.

**Fix:** defer full library permission until the gallery affordance is used. Where system pickers can serve the task without full-library access, prefer them.

### P1.3 — 15-second recording cap is too restrictive

`RECORDING_MAX_DURATION = 15000`.

A Poster story frame may still be intentionally short, but capture should not make the user's source media artificially hard to create. Meta Edits publicly supports much longer capture and Snapchat Long Snap spans multiple clips.

**Fix:** separate:
- raw capture duration;
- final Poster frame/clip duration;
- publish policy.

Record longer; segment or trim into the destination format.

### P1.4 — Frame navigation gesture is over-delayed

Poster frame swipe is configured with `activateAfterLongPress(300)`.

For a horizontal frame navigator, a 300 ms hold before pan recognition is likely to feel sticky and non-native.

**Fix:** coordinate gesture arbitration with layer transforms through simultaneous/exclusive gestures and directional thresholds; do not make ordinary frame swipe wait for a long press.

### P1.5 — Native `Alert.alert` interrupts visual continuity

Poster/Look exit currently uses a system alert for:
- Save draft;
- Discard;
- Keep editing.

This is functional but breaks the visual/editor continuity.

**Fix:** use an app-native bottom confirmation with:
- mini project preview;
- `Save draft & exit`;
- `Discard`;
- `Continue editing`;
- explicit autosave status.

### P1.6 — Look `Try arrangement` is blind cycling

The code cycles:
Hero → Pair → Dominant → Collage.

The user does not see the alternative before it changes the canvas.

**Fix:** render 4–8 live thumbnails using the current objects, and let the user scrub/tap through them.

### P1.7 — Look source tray competes with creation space

`LookSourceTray` is useful differentiation, but its persistent placement above the default bottom bar adds another chrome zone.

**Fix:** use a compact source handle/pill:
- recent saved/listed items peek;
- swipe/tap to expand;
- preserve canvas when closed;
- selected product object uses context controls, not global source UI.

## P2 findings

### Tool personalization
Meta Edits publicly identifies customizable/pinned tools as a current direction. Add:
- pinned tools;
- recent tools;
- per-mode defaults;
- reset;
- no in-session surprise reorder.

### Effect preview renderer
Use Skia to render actual media thumbnails for:
- filters;
- effects;
- color presets;
- layout variants;
- text styles.

### True subject segmentation
Implement only after the core editor is stable.
Options:
- on-device model;
- backend segmentation;
- platform-native subject lifting where contractually stable and cross-platform behavior can be normalized.

Store an alpha mask/matte reference in the document; do not destructively bake the crop unless exporting.

## Fixed since older audits

Do **not** waste another pass fixing issues that are already fixed in current branch:
- dedicated Poster/Look split already exists;
- camera subcomponent extraction already exists;
- current CreatorContext `updateLayer` now updates timestamp, pushes history and sets dirty state;
- branch commit reports CreatorCanvas media now uses cached image infrastructure;
- font defaults have already been curated somewhat.

The next work must move forward from this state.
