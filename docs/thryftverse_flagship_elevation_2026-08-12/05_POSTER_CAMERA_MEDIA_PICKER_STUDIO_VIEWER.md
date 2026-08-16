# Poster — Camera, Media Upload, Studio & Viewer Flagship Reconstruction

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Why Poster still feels behind Snapchat / Instagram

The problem is not lack of editor features. The creator stack is already extremely broad.

`CreatorAssetPicker.tsx` includes media, product, mention, look, text, shape, vote, draw, GIF, music, quiz, question, emoji slider, countdown, stickers, link, location, hashtag, time and weather modes.

That breadth is exactly why the *entry* must be more disciplined.

### Current path inconsistency

`CreateCameraScreen.tsx`:
- camera-first;
- gallery launches **images only**;
- returns the first asset;
- mixes Search / Look / Poster modes;
- also exposes Start Blank, Gallery, templates/drafts pathways, hints, grid and overflow.

`CreatorAssetPicker.tsx`:
- photos + video;
- media-library pagination;
- Recent / Photos / Videos / Selfies;
- ordered multi-select up to 10;
- selection badge;
- duration marker;
- camera/video shortcuts.

A user should not receive a lower-capability media flow simply because they entered from the first camera screen.

---

## Reference psychology

### Instagram Instants
Meta’s 2026 Instants direction validates a deliberate **authentic fast path**:
- camera opens immediately;
- real-time capture;
- minimal editing;
- audience choice;
- quick share.

The lesson is not to clone Instants. It is to stop routing every creation intent through a power editor.

### Snapchat
The camera is a place, not a form:
- viewfinder dominates;
- controls hug safe zones;
- most complexity appears after capture or on deliberate invocation;
- editing is direct manipulation.

### Instagram Stories
Editing tools are strongly discoverable after media exists. The empty creation state is not a dashboard of every possible editor feature.

---

# New Poster information architecture

## A. Quick Capture

Entry: tap Poster camera / swipe to Poster mode.

### Camera state
Visible:
- close/back;
- flash;
- flip;
- shutter;
- small gallery thumbnail;
- maybe one tools disclosure.

Not simultaneously visible:
- templates;
- drafts;
- blank canvas;
- multiple instructional lines;
- full editor toolbar.

### After capture
- media preview;
- caption/text entry;
- audience;
- `Share`;
- `Edit` opens Studio.

This path should be possible in seconds.

---

## B. Studio

Explicit power path:
- import 1–10 media assets;
- blank canvas;
- templates;
- layers;
- stickers/product tags;
- text;
- draw;
- music etc.

The Studio can remain sophisticated because the user chose it.

---

# Canonical MediaAcquireSheet

One dedicated surface, not a generic picker with everything.

Header:
- album/source disclosure;
- ordered selection count;
- close/next.

Body:
- 3-column high-performance grid;
- Photos/Videos filter if needed;
- no separate “Recent photos” rail that repeats the same assets;
- thumbnail badges only for selected order and video duration.

Bottom:
- `Next (3)` primary action when selection exists.

### Albums
Do not infer “Selfies” from square aspect ratio. Query actual albums/smart albums if supported; otherwise remove the label.

### Limited photo permission
iOS/Android permission state should explain:
- selected photos access;
- add more;
- open settings.

### Video
- show duration;
- poster thumbnail;
- do not auto-play all grid thumbnails;
- selection preflight catches unsupported duration/codec/size;
- trim only after selection if required.

---

# Editing canvas

## First-view simplicity
Show only core tools:
- Text
- Stickers
- Draw
- Media/Product

Secondary:
- music;
- link;
- location;
- polls/questions;
- layers/templates.

Use a secondary drawer/tool tray rather than a two-row icon buffet.

## Direct manipulation
- tap selects;
- double tap edits where semantically expected;
- pinch scales;
- rotation;
- drag;
- alignment guides;
- safe-zone guides;
- delete target only while dragging;
- undo/redo persistently reachable.

### Text
- text style should look authored, not like generic Canva presets;
- keep style count limited;
- recent style first;
- tap through style variants can be faster than a huge chooser.

### Product tags
For Thryftverse this is differentiating:
- tag a listing/product;
- subtle hotspot in viewer;
- tap reveals price/title;
- no permanent commerce card covering the artwork.

---

# Viewer

`PosterViewerScreen.tsx` is already rich:
- segmented progress;
- hold to pause;
- frame/story navigation;
- reactions/replies;
- tags;
- mixed media;
- composition rendering;
- zoom.

## What to simplify
A 3D cube rotation between accounts may read as a “demo effect” rather than flagship restraint. Test a flatter spatial transition:
- horizontal/edge continuity;
- small scale/fade only;
- keep progress/header stable.

If the cube remains:
- only on account change;
- 60fps release profile;
- reduced motion = no transform;
- no conflict with video/frame gestures.

## Video
- buffering indicator only after a short threshold to avoid flash;
- first frame/poster instantly;
- unmute state predictable;
- pause when app inactive;
- prefetch next story poster only.

---

# Publish

A great share screen should not become another form.

Primary:
- audience;
- caption if not already;
- share.

Secondary:
- save draft;
- advanced controls;
- product visibility;
- accessibility alt text.

Upload should continue with:
- per-frame progress;
- recoverable failure;
- draft preservation;
- no duplicate publish.

---

# Remove “AI-made” creator cues

Delete/reduce:
- `sparkles` as generic empty-state identity;
- breathing empty-state icon;
- ornamental orb/gradient Poster placeholders;
- too many spring animations just because Reanimated is available;
- copy like “premium contextual tool cards.”

Internally a comment can say “premium”; production UI must prove it through behavior.

---

## Exact P0 file work

### `frontend/src/screens/CreateCameraScreen.tsx`
- [ ] Gallery supports photos **and videos**.
- [ ] Gallery supports ordered multi-select by invoking the canonical acquisition surface.
- [ ] Remove Start Blank/Gallery context-card row from quick camera.
- [ ] Move templates/drafts/blank into Studio entry/overflow.
- [ ] Keep mode switching but reduce explanatory text after first use.
- [ ] Make camera chrome safe-zone aware.

### `frontend/src/creator/CreatorAssetPicker.tsx`
- [ ] Split giant file into media/product/social/text/interactive picker modules.
- [ ] Remove fake `Selfies = square image` classification.
- [ ] Remove duplicated recent horizontal rail.
- [ ] Remove infinite breathing animation.
- [ ] Add album/source model.
- [ ] Preserve ordered selection as an array instead of deriving order from `Set` iteration semantics.
- [ ] Add selection preview / reorder before add.

### `CreatorCamera.tsx`
- [ ] Photo + video capture contract if Poster supports captured video.
- [ ] capture-state machine;
- [ ] orientation handling;
- [ ] focus/exposure/zoom semantics;
- [ ] capture latency telemetry;
- [ ] permissions and hardware failure recovery.

### Studio / Canvas
- [ ] tool priority audit;
- [ ] safe region overlay;
- [ ] one selection model;
- [ ] deterministic layer ordering;
- [ ] touch conflict matrix;
- [ ] undo/redo QA.

### Viewer
- [ ] benchmark cube transition;
- [ ] reduce if it misses 60fps/presentation quality;
- [ ] viewer controls auto-hide carefully;
- [ ] unify reaction/reply dock with keyboard.

---

# Acceptance matrix

### Camera
- [ ] cold entry reaches usable viewfinder quickly.
- [ ] capture does not wait for decorative animation.
- [ ] flash/flip state is unambiguous.
- [ ] reduced-motion user gets identical functionality.
- [ ] safe zones survive dynamic island/notch/navigation bars.

### Media picker
- [ ] image + video in same grid.
- [ ] multi-select order is deterministic.
- [ ] 5,000+ library assets scroll smoothly on target devices.
- [ ] limited permission is handled.
- [ ] video thumbnails never all autoplay.
- [ ] next action stays reachable with 200% text.

### Editor
- [ ] empty canvas is visually quiet.
- [ ] first-time user can add text/media without tutorial.
- [ ] pro user can reach full toolset in ≤2 actions.
- [ ] undo/redo never lose document integrity.
- [ ] keyboard never hides selected text controls.

### Publish
- [ ] upload can retry without duplicate story.
- [ ] app background/resume preserves draft.
- [ ] partial media upload is recoverable.
- [ ] canonical composition rendered in viewer matches editor.

---

# Metrics

- camera-open → first capture;
- capture → share;
- gallery-open → first selected;
- media-select → canvas ready;
- editor sessions that publish;
- draft recovery success;
- upload failure/retry success;
- gesture cancellation/conflict rate;
- viewer first-frame time;
- video rebuffer rate;
- Poster replies/reactions after view.

The target is not “more engagement at all costs.” It is lower creation friction with higher confidence.
