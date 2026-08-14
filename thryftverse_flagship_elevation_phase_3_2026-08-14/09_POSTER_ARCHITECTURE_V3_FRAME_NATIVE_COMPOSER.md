# Poster Architecture V3 — Frame-Native Composer

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Current truth

Phase 2 fixed the underlying model. Poster selections now become ordered frames/pages. The remaining problem is the **editor shell**.

The shared Studio still owns close, undo/redo, Next, story segments, frame-tray toggle, add page, generic layer selection, opacity, tool dock, overflow, preview, settings, layers, templates, drafts, safe zone, crop/cutout and page menu.

That is pro-editor completeness, not story-creation simplicity.

## New top-level screen

Create `frontend/src/creator/poster/PosterComposerScreen.tsx`.

Keep shared:
- CreatorDocument;
- history;
- serialization;
- drafts;
- media pipeline;
- layer renderer;
- selected picker primitives.

Do not keep the generic Studio shell as Poster’s permanent top-level UX.

## Poster states

### Capture
Camera or gallery.

### Compose
One current frame fills the screen.

Default chrome:
- close;
- Next;
- media-specific sound/clip control;
- contextual actions: Text, Stickers, Product, Draw, More.

Frame navigation appears because there are multiple frames, not because “page management” is always a toolbar concept.

### Frame overview
Filmstrip/overview for:
- reorder;
- delete;
- duplicate;
- add;
- select.

It is invoked intentionally and does not permanently occupy the canvas.

### Publish
Audience/share decision.

## Direct manipulation

- tap text → edit;
- drag → move;
- pinch → scale/rotate;
- tap media → media context;
- edge swipe → next frame;
- long-press frame indicator → frame actions.

Do not expose the word “Layers” to ordinary first-run creation. Keep layer manager in More/Advanced.

## Video

Each video frame has:
- play/pause;
- trim start/end;
- mute/volume;
- optional speed only if supported well.

Frame duration derives from media. A generic “Page duration” menu should not conflict with video duration.

## Templates

Template selection is an entry path:
Create Poster → Templates → Composer.

It should not be an always-visible editor control.

## Acceptance journey

A first-time user can:
1. select four media;
2. see four frames in selection order;
3. edit text on frame two;
4. reorder frame three;
5. preview;
6. share

without encountering Layers, Safe zone, Z-index, Page duration, Opacity or template-management vocabulary unless intentionally opening More.
