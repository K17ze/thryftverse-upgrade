# Acceptance Gates

## Entry
- [ ] Creator opens directly to camera.
- [ ] No 2×2 intent dashboard.
- [ ] Look / Poster / Search switch visible.
- [ ] Gallery visible immediately.
- [ ] Last mode persisted.

## Capture
- [ ] Single photo → editor automatically.
- [ ] Single video → editor automatically.
- [ ] Multi-capture tray appears only when user opted into Multi.

## Gallery
- [ ] Opened directly from camera.
- [ ] Done → editor.
- [ ] No post-selection action menu.
- [ ] Selection order preserved.

## Look
- [ ] No permanent auto-layout bar.
- [ ] No permanent layout-preview rail.
- [ ] No persistent source tray competing with canvas.
- [ ] One lower interaction surface at a time.
- [ ] Multiple images receive a competent default layout automatically.

## Poster
- [ ] Single photo has no forced timeline.
- [ ] Timeline is contextual for video/multi-clip.

## Crop
- [ ] In-canvas direct manipulation.
- [ ] No separate artificial crop page in mainstream flow.

## Anti-slop gate
Fail a PR if it adds a permanent rail without replacing one, adds a new creator-entry tile, exposes internal feature taxonomy, adds explanatory copy where direct manipulation can teach the interaction, or adds decorative motion instead of reducing steps.
