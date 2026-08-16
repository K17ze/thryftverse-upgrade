# August 2026 Competitor Research — Current Public Baseline

**Research cut-off:** 16 August 2026. This document uses first-party sources where available and does not treat speculative reverse engineering as fact.

## Meta / Instagram / Edits

### Edits — April 2026 public direction
Meta's 22 April 2026 “One Year of Edits” update explicitly frames the product around keeping powerful tools simple and approachable. Publicly stated areas include:

- advanced color adjustments;
- speed curves;
- improved/bilingual captions;
- customizable tools;
- pinning favorite tools;
- personalized project setup;
- templates whose project structure can be inspected;
- increasingly complex template projects with overlays, keyframes and effects.

**ThryftVerse interpretation:** having `SpeedCurveEditor`, `KeyframeEditor` and pinned tools is directionally correct. Parity requires those structures to drive playback/render/export and to remain understandable at first use.

### Instagram Stories / Muse Image — July 2026
Meta announced 30+ Muse Image-powered effects for Instagram Stories plus direct visual editing/markup in its current AI creative stack.

This raises the 2026 “beyond parity” ceiling:
- localized visual transformations;
- object/background edit;
- preset + direct-manipulation workflow;
- preview-first AI transformations.

This is **not** the next P0 for ThryftVerse. Deterministic text/color/filter/timeline/cutout must be excellent first. But it belongs on the long-term zero-gap ledger.

### Recency note
The official Meta newsroom searches used for this audit found the July 2026 Muse/Stories material and April 2026 Edits roadmap as the latest directly relevant public creator/editor items. The audit did not find an official source substantiating the branch comment “Instagram Edits August 2026 Auto Adjust.”

## Snapchat

Snapchat's support docs are particularly useful because they describe user-visible behavior precisely.

### Timeline Editor
Current public behavior includes:
- multi-clip timeline;
- play/pause and scrub;
- edge trim;
- Split;
- Duplicate;
- Replace;
- Speed;
- Volume;
- Crop & Rotate;
- Delete;
- music as its own layer;
- text/stickers as timed layers.

This is a minimum behavioral benchmark for Poster.

### Long Snap
- continuous recording across multiple clips;
- trim individual clips;
- reorder clips;
- import additional clips;
- time overlays/sound.

The key psychological lesson is that capture and editing are one model rather than separate “camera” and “page editor” worlds.

### Drawing
Snapchat currently documents:
- freehand drawing;
- undo;
- pinch to resize brush;
- color slider;
- palette switching;
- emoji brush.

ThryftVerse has real drawing and exact HEX entry, but still needs a shared palette architecture, pinch brush sizing, emoji brush and a more UI-thread-native stroke path.

### Text
Snapchat documents:
- multiple styles/sizes;
- drag/resize/rotate;
- bold/underline/italic formatting;
- color slider;
- mentions;
- timed text;
- automatic closed captions.

ThryftVerse's current text tool is materially behind in precise color and effect parameterization.

### Stickers
Snapchat documents:
- move/resize;
- sticker categories;
- location/polls;
- Auto Stickers;
- pinning a sticker to a moving object, with the sticker following movement/rotation/scale.

Object tracking/pinning is a clear gap in ThryftVerse's current sticker system.

### Green Screen / camera tools
Snapchat exposes Green Screen as a camera creation mode and a mature suite of camera creation controls. ThryftVerse's camera foundation is good conventional capture, not yet an equivalent real-time compositing ecosystem.

## TikTok as third benchmark

TikTok's current official support material describes advanced editing capabilities including:
- multi-track editing;
- trim/split;
- speed;
- sound;
- transitions;
- overlays;
- text;
- stickers/GIFs;
- cover selection;
- “Magic” automated editing concepts involving keyframes/masking/overlays/audio.

TikTok should be used as a third comparator for video-editor completeness, not as a visual clone target.

## 2026 public competitor floor

A flagship mobile creator now reasonably implies:

### Capture
- immediate camera;
- multi-clip acquisition;
- gallery import;
- timer/grid/hands-free where appropriate;
- a real-time effect/compositing strategy.

### Spatial edit
- drag/scale/rotate;
- snap/alignment;
- contextual controls;
- crop;
- masks/cutout;
- text/drawing/stickers;
- layers without forcing layer terminology into the normal flow.

### Temporal edit
- actual playback clock;
- trim/split/reorder/replace;
- overlay time ranges;
- music/audio;
- speed/volume;
- transitions;
- cover frame.

### Color/media
- native previewable adjustments;
- exact color authoring;
- reversible operations.

### Reliability
- durable projects;
- crash recovery;
- reliable upload;
- editor-to-viewer fidelity.

### Personalization
- user-driven tool customization/pinning is an increasingly explicit reference direction.

## What competitors have polished over a decade

The moat is not merely feature count. It is thousands of small interaction decisions:
- controls appear only when relevant;
- visual decisions are previewed visually;
- every press has immediate feedback;
- gestures are predictable;
- output is trusted;
- failures rarely destroy work;
- icons are semantically and optically consistent;
- the user manipulates content rather than an abstract data model.

That is the level the next ThryftVerse cycle must target.
