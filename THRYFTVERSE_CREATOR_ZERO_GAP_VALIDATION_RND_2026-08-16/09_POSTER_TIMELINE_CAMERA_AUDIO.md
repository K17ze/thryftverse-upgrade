# Poster Timeline, Camera and Audio — Zero-Gap Audit

## Core verdict

The new timeline is a credible subsystem **foundation**, but it is not yet the authoritative temporal engine.

## 1. Move temporal truth into the document

Current architecture derives video clips and overlays from pages/layers. Replace that with canonical sequence data:

```ts
PosterSequence {
  clips: PosterClipRef[];
  audioTracks: AudioTrack[];
  transitions: TransitionRef[];
}

CreatorLayer {
  ...
  timeRange?: { startMs: number; endMs: number };
}
```

Migrate legacy page-based poster documents once.

## 2. Fix current overlay derivation

Current projection can:
- use page duration rather than trim/speed-adjusted clip duration;
- assign every overlay to the full page;
- increment page offset using different timing semantics from clip duration;
- break after encountering a video layer and therefore skip later layers depending on ordering.

This is a correctness issue, not polish.

## 3. One playback clock

The timeline clock must drive:
- active clip;
- video seek/play/pause;
- audio;
- overlay visibility;
- text animation;
- transitions;
- keyframes.

Current canvas video is hard-coded to play, muted and loop, so timeline `isPlaying` is not yet the true playback authority.

## 4. Scrub

- UI-thread playhead;
- coalesced native seeks;
- current-frame preview;
- no React state update per pixel;
- optional snap to clip/keyframe boundaries.

## 5. Trim

- source-time handles;
- minimum duration;
- haptic at source bounds;
- visual frame update while dragging;
- one history commit on release.

## 6. Split

A split should:
- preserve source asset reference;
- create adjacent source ranges;
- define overlay policy;
- be one undoable transaction.

## 7. Reorder

- drag clip with live gap;
- autoscroll;
- haptic landing;
- accessible Move Left/Right.

## 8. Speed

Constant speed must alter playback and duration. Speed curve must be sampled by the playback/export engine, not merely stored.

## 9. Transitions/keyframes

The new editors are only complete when values drive real rendering. Add evaluator tests for exact times and canonical viewer/export output.

## 10. Audio

P0:
- source clip volume;
- music track;
- mute;
- offset/trim;
- fades.

P1:
- real waveform extraction;
- voiceover;
- ducking;
- beat markers.

P2:
- beat-synced cut suggestions.

## 11. Camera

Current conventional foundation is useful:
- photo/video;
- focus reticle;
- flip/zoom;
- grid;
- timer;
- multi-capture;
- gallery.

Zero-gap next:
- truthful physical lens/capability mapping;
- longer raw capture;
- hands-free;
- speed capture;
- exposure where supported;
- green screen/live effect strategy;
- capture→timeline continuity.

Do not equate final story clip duration with source recording duration.

## 12. Cover frame

Add explicit cover-frame selection and persist exact source/timeline time so feed/profile representation is predictable.
