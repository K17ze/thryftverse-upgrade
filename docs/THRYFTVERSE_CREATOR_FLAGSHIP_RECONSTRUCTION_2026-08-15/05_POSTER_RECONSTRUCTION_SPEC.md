# 05 — Poster Flagship Reconstruction Specification

## Product mental model

Poster is **temporal expressive media**, not "pages with layers."

The user thinks:
- this clip comes first;
- this photo lasts 3 seconds;
- this text appears here;
- this music starts there;
- this sticker disappears before the next beat.

The UI should use those concepts.

## State architecture

### State A — Entry
Show a visually quiet creation gateway:
- live camera;
- latest media thumbnail;
- capture mode;
- optional `Aa` text start;
- swipe/tap gallery;
- small label indicating `Poster`.

Do not immediately surface editing tools before media exists.

### State B — Photo Poster
Full-bleed canvas. Minimal chrome:
- top-left: close;
- top-center: undo only when meaningful / or history affordance;
- top-right: Next;
- bottom: contextual tool rail.

### State C — Video Poster
Full-bleed preview + compact persistent timeline.

When a video exists, the timeline is not hidden behind More.

### State D — Object selected
Global tool rail yields to object-specific actions.

### State E — Precision tool
Canvas remains visible while a bottom panel expands.

### State F — Publish preflight
Preview + essential sharing metadata. Advanced settings remain collapsed.

## New Poster timeline

### Visual anatomy

```text
┌──────────────────────── full-bleed canvas ─────────────────────────┐
│                                                                    │
│                       current frame/clip                           │
│                                                                    │
├──────── compact contextual controls / playback ────────────────────┤
│  ▶  00:03.4 / 00:14.0                                  ↶    ↷    │
├──────── primary clip track ────────────────────────────────────────┤
│ [thumb][thumb][thumb][thumb][thumb][thumb][thumb]                  │
│         | playhead                                                 │
├──────── overlay tracks when needed ────────────────────────────────┤
│ Text    [===========]                                              │
│ Music      [=============================]                          │
│ Sticker          [=======]                                         │
├──────── tool rail ─────────────────────────────────────────────────┤
│ Trim  Split  Speed  Volume  Crop  Replace                          │
└────────────────────────────────────────────────────────────────────┘
```

### Required clip operations
P0:
- scrub;
- trim by dragging clip ends;
- split at playhead;
- duplicate;
- delete;
- replace;
- reorder;
- crop/rotate;
- speed;
- volume.

P1:
- transition between clips;
- freeze frame;
- reverse;
- clip color/effect;
- poster frame / cover frame.

P2:
- speed curves;
- keyframes;
- motion effects.

## Timed overlay model

Every timed Poster overlay should support:

```ts
type TimeRange = {
  startMs: number;
  endMs: number;
}
```

Applicable:
- text;
- sticker;
- product;
- mention;
- poll/quiz;
- GIF;
- music sticker visual;
- link;
- location;
- drawing if desired.

The canvas edits spatial position; timeline edits temporal position.

## Frame/page relationship

Recommended v2 model:

```ts
PosterDocument {
  sequence: PosterClip[];
  overlays: TimedLayer[];
  audioTracks: AudioTrack[];
  transitions: Transition[];
}
```

Compatibility can still map old pages into clips.

Do not expose `pages` in UI copy.

## Tool hierarchy

### Photo
1. Text
2. Stickers
3. Music
4. Effects
5. Draw
6. More

### Video
1. Timeline
2. Text
3. Music
4. Effects
5. Stickers
6. More

### More
- Product
- Link
- Mention
- Location
- Poll/Quiz/Question
- Templates
- Canvas/background
- Safe zone
- Layers
- Accessibility text

## Text tool

### Entry
Tap `Text`:
- keyboard immediately opens;
- live text layer appears;
- user's typing renders directly on canvas;
- bottom rail changes to font/style/color/alignment/effect.

### Font chooser
- horizontal rail;
- each choice renders the user's actual text;
- 6–10 curated expressive families before More;
- avoid 20 low-quality novelty fonts just for parity.

### Text effects
P1:
- background pill;
- outline;
- shadow;
- glow;
- subtle neon;
- fill/outline combinations.

### Text animation
Poster-only:
- Fade;
- Rise;
- Type;
- Pop;
- Slide;
- custom timing.

Avoid animations that make text unreadable.

## Effects / filters

### Current target
A horizontal preview rail using real media thumbnails:
- Normal
- Clean
- Warm
- Cool
- Film
- Soft
- High contrast
- B&W
- custom saved looks

### Adjust panel
- exposure;
- contrast;
- highlights;
- shadows;
- saturation;
- temperature;
- tint;
- fade;
- vignette;
- sharpness/clarity with conservative bounds.

Implement non-destructively in an effect stack.

## Camera reconstruction

Keep current useful foundations:
- focus reticle;
- shutter;
- record ring;
- grid;
- timer;
- multi-capture;
- flip;
- pinch zoom.

Change:
- remove misleading physical `2×/3×` semantics unless actual lens mapping is known;
- don't request full gallery permission merely to decorate the camera;
- lift 15s raw recording restriction;
- provide capture progress segmented by destination clips;
- preview current capture with near-zero ceremony.

## Frame navigation

Remove `activateAfterLongPress(300)` for ordinary horizontal frame swipe.

Use gesture arbitration:
- pan on selected object gets priority when starting inside selected bounds;
- horizontal frame swipe starts outside selected object or after directional lock;
- layer manipulation and navigation can use simultaneous/exclusive gestures with velocity/distance thresholds.

## Safe zones

Safe zone visibility should be:
- automatic while dragging near reserved top/bottom UI areas;
- manually toggleable under More;
- not permanently visible.

Haptic when snapping into safe alignment.

## Publish

`Next` opens a preflight, not a long settings form.

Show:
- autoplay preview;
- audience;
- caption if relevant;
- replies/reactions;
- tagged products / links summary;
- accessibility description;
- schedule under Advanced.

Before sharing:
- validate unresolved local media;
- validate missing product refs;
- validate media codec/duration;
- generate preview/cover.

## Acceptance criteria

Poster P0 is not complete until:
- [ ] 3-video project can be trimmed, split and reordered without leaving the main editor;
- [ ] text can be timed to only a portion of a clip;
- [ ] music appears as a timeline layer;
- [ ] scrubbing updates canvas preview continuously;
- [ ] app restart restores timeline position, trims and overlay timing;
- [ ] publish after simulated network interruption resumes without project loss;
- [ ] editor preview and published viewer use canonical render semantics;
- [ ] real devices sustain smooth manipulation under representative 1080p media.
