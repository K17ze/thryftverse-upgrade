# Poster V6 — Native Temporal Story Instrument

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Current state

The dedicated Poster composer is architecturally correct: one current frame, optional frame overview, shared Creator canvas, layers, publish and settings.

The remaining issue is that it still resembles a generalized graphics editor more than a native social camera/story instrument.

## Target mental model

Poster is:

> **camera + sequence + lightweight edit + share**

not:

> document + pages + layers + advanced properties.

## Default Poster surface

At rest:
- media;
- close;
- undo;
- Next;
- one compact tool strip.

Tool strip:
- Text;
- Draw;
- Sticker;
- Product;
- Music/audio only when implemented;
- More.

If media is video:
- audio toggle;
- trim affordance only after real implementation.

## Frame management

User should not learn “pages”.

Call them frames only where text is necessary.

Frame overview:
- small frame-count/progress affordance;
- open tray;
- drag reorder;
- duplicate;
- delete with Undo.

## Video editor

Current repo search does not evidence a full FFmpeg/transcode editor implementation.

Do not fake it.

Phase 6 real video editing needs:
- trim in/out;
- split;
- duplicate;
- replace;
- reorder clips;
- speed;
- mute/volume;
- crop/rotate;
- poster frame;
- timed overlays;
- multi-clip duration model.

Implementation may use:
- on-device native editing primitives where reliable;
- server-side processing for final render;
- or a hybrid.

The exact stack must be benchmarked on iOS/Android before commitment.

## Photo frame

Photo remains simple:
- duration if Poster playback uses timing;
- crop/reframe;
- text/stickers;
- draw;
- product/location/etc.

Do not show a timeline for a single still image.

## Audio

Do not add music UI until:
- licensed audio/source policy;
- sync;
- trimming;
- volume;
- publish/render
are all real.

## Publish

Poster preview should be pixel-equivalent to viewer.

No progress-stage theatre.

## Viewer

Full-screen:
- frame progress;
- tap left/right;
- hold pause;
- swipe dismiss;
- reply/reaction;
- discreet product hotspot.

## Reference principle

Snapchat’s current Timeline Editor is useful because video complexity appears **when video is being edited**. Apply that principle without cloning its styling.

## Acceptance

Poster must score independently in:
- camera continuity;
- first-caption time;
- multi-frame workflow;
- video editing;
- text quality;
- viewer fidelity.

Do not average weak creator quality into an overall app score.
