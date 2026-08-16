# Deep blueprint — Creator system

This document connects Camera, Poster, Look, Viewer and Publish into one coherent product.

---

# 1. Creator has two fundamentally different output models

## Poster
Temporal.
A sequence of frames.

## Look
Spatial.
A composition of objects on one canvas.

Never converge these into one UI again just because they share a document model.

---

# 2. Entry architecture

Current product can enter through:
- central Create;
- Camera;
- Gallery;
- Create Look/Poster routes;
- drafts/templates;
- remix/edit.

Define one acquisition contract:

```ts
type CreatorAcquisitionResult =
  | { target: 'poster'; media: CreatorInitialMedia[]; source: ... }
  | { target: 'look'; media: CreatorInitialMedia[]; source: ... }
  | { target: 'blank'; type: 'poster' | 'look' }
  | { target: 'template'; templateId: string };
```

The UI should not bounce through two different gallery/camera pickers.

---

# 3. Create entry from bottom navigation

Do not silently open Look.

Preferred:
tap Create -> camera/acquisition shell with last-used target visible but not hidden.

Possible compact mode control:
```
Poster    Look
```

Only two target products.

Search/visual-search is not a creator target and should use its own camera route/config.

Long press Create:
optional direct chooser:
- Poster
- Look
- Sell

Only if this helps expert efficiency and is discoverable.

---

# 4. Camera default state

Visible:
- close;
- flash;
- flip;
- gallery;
- shutter;
- Tools.

That is enough.

Hidden Tools:
- timer;
- grid;
- multi;
- potentially stabilization if real.

### Shutter
Tap photo.
Hold video.
The current implementation direction is correct.

### Recording
Show:
- red/white record state;
- elapsed;
- stop by release/tap depending chosen gesture contract.

Do not show fake lens `0.5x/3x` unless actual lenses exist.

---

# 5. Gallery

This is a major visual-quality opportunity.

Current/legacy 4-column picker is functional but generic.

### Poster gallery
- media grid;
- selection order numbers;
- bottom ordered tray;
- drag reorder;
- Next.

Selected order is frame order.

### Look gallery
- media grid;
- selected object tray;
- order only impacts initial arrangement, not narrative frame order.

### Tabs
- Recent;
- Favorites / albums only if available;
- Camera.

Do not build 7 media source tabs before need.

---

# 6. Poster composer

## At rest
```
x                 Undo        Next

          FRAME / MEDIA

 Text   Stickers   Product   Draw   ...
```

No permanent:
- Layers;
- Safe zone;
- templates;
- page duration;
- z-index;
- opacity.

### Selecting text
Global bottom rail disappears.
Text editing controls appear.

### Selecting product
- change product;
- style;
- remove.

### Multiple frames
Small progress/overview indicator.
Frame tray only after:
- add;
- explicit tap;
- reorder intent.

Don't auto-cover the canvas after every simple swipe.

---

# 7. Poster video

Phase 3.1 correctly avoids fake trim.

### Phase 4 presentation until trim exists
If video selected:
- playback works;
- current duration visible only if relevant;
- small `Video editing coming later` entry only where tool would be expected.

Do not permanently show unavailable Trim/Mute in default rail.

When real editor exists later, use timeline because video is temporal.

---

# 8. Look composer

## Source-first
Canvas + source tray.

Source tray design:
```
For you | Saved | Closet | Marketplace | Camera Roll
```

This is where marketplace identity becomes unique.

### Item insertion
Marketplace item:
- media visual;
- stable listing link.

Saved photo:
- media only.

### Object selection
Floating toolbar near bottom:
- Crop
- Swap
- Duplicate
- Remove
- More

Arrange/depth:
in More or gesture.

### Manual Crop
Keep truthful.

If output remains rectangular, do not use a scissors/cutout visual metaphor implying transparency.

Rename icon if necessary to crop-frame.

---

# 9. Layout suggestions

Current `Try arrangement` concept is useful, but should feel like a property of multiple selected objects.

Trigger:
after ≥2 suitable objects.

Copy:
`Layout`

Inside:
- Hero
- Pair
- Grid
- Collage

Preview live.
Undo works.

Do not say:
AI layout.

---

# 10. Product tagging

In edit:
visible hotspot outline/marker.

In viewer:
subtle product dot/hotspot.

Tap:
mini product preview then Product Detail.

Do not cover Look with title/price cards unless user taps hotspot.

---

# 11. Publish

Current remote has already reduced progress theatre.

Preserve:
`Sharing…`

Review should show:
- caption;
- audience;
- scheduling if supported;
- product attribution summary.

Do not display:
- document layer count;
- upload count;
- encoding;
- processing pipeline.

---

# 12. Viewer

## Poster
Tap sides.
Hold pause.
Swipe down close.
Reply/reaction at bottom.

## Look
Static/scrollable composition.
Tap hotspots.
Save/share.
Creator identity.

Do not use the same viewer for both merely with aspect-ratio changes.

---

# 13. Creator motion

Direct manipulation:
60fps, object under finger.

Snap guides:
appear only near snap.

Haptic:
one light tick at major alignment.

Reorder:
lift + settle.

No section FadeIn animations.

---

# 14. Accessibility

Canvas editing needs:
- selected layer/object accessible actions;
- Move forward/back;
- Delete;
- Duplicate;
- descriptive names.

Gallery order selection label:
`Selected 2 of 5`.

Video controls operable without hold gesture alternative.

---

# 15. Screenshot/storyboard QA

Capture the **journey**, not only final screen:

Poster:
1. Create
2. camera
3. 3 selected media
4. editor
5. text selected
6. frame overview
7. publish
8. viewer

Look:
1. source tray
2. saved items
3. 4 objects
4. selected object
5. layout
6. product tagged
7. publish
8. viewer.

Pass only if an external reviewer can identify Poster as temporal and Look as spatial from screenshots alone.
