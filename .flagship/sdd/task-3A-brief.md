# Task 3A Brief — Re-author the listing media surface (de-bot the design language)

Repo: C:\Users\User\Desktop\thryftverse-upgrade. React Native + Expo ~57, TS strict.

## Mission

ListingMediaStudio + SortablePhotoStudio currently read as assembled-by-a-model:
five radii in one viewport, badge clutter on every media object, a dashed scaffold
empty state, decorative shadows, a hardcoded stroke. Re-author the surface so it
reads as a product a senior designer owned. This is a VISUAL + COMPOSITION pass —
the engineering underneath (real progress, crop sheet, posters, focal) stays.

## Design direction (follow this; it is the spec)

### Composition
- The media IS the interface. The cover renders edge-to-edge at full aspect height.
  Chrome on the media shrinks to: (a) one status system (progress/failed/cancelled
  overlay), (b) remove (top-right) and edit (bottom-right) as TRANSPARENT 44pt
  targets with 20pt glyphs — no grey circles, no pills.
- DELETE the COVER badge (the layout already communicates it: large object above,
  first in strip below). DELETE the count badge from the cover. DELETE the "VIDEO"
  text badge — videos show the same compact play glyph the thumbs use.
- Count moves to the actions row: "Add more · 3/10" pattern — one quiet text row,
  not a floating badge. When maxCount reached, the Add-more action disappears.

### Empty state (reachable via EditListingScreen — re-author, do not delete)
- Kill the dashed border, the 72pt icon circle, and the three copy blocks
  ("Start with a photo" / "Tap to upload..." / "Well-lit photos..." — the last is
  duplicate content; SellScreen's photo-tips expander already owns tips).
- New: full-bleed cover-height tap target in colors.surfaceAlt, Radius.lg, centered:
  camera glyph 24pt textMuted → "Add your first photo" (bodyStrong, textPrimary) →
  "Up to 10 photos" (meta, textMuted). Whole surface is the library action.
- Below it, one quiet row: "Take photo" as a text button (44pt target, 16pt glyph,
  no pill, no border). Nothing else.

### Thumbs (SortablePhotoStrip + renderThumbItem)
- DELETE: number badges, per-thumb "Cover" pill + star (cover = thumb 0, rendered
  large above — position is the label), the 15pt drop shadow.
- KEEP: remove X (transparent, hitSlop to 44pt), failed overlay + retry, cancelled
  overlay, uploaded check (restyled: 16pt, no animation loop spam — the existing
  spring-once is fine).
- Radius: thumbs Radius.lg. Play-glyph scrim circle Radius.full (circular glyph
  exception). NOTHING ELSE. Two radius sizes total in the viewport.
- Stroke: thumb border Stroke.standard; failed/selected emphasis Stroke.emphasis —
  replace the hardcoded borderWidth: 2.
- SortablePhotoStrip internals: it currently renders its own cover pill / number
  badge / shadow for the non-renderItem path. ListingMediaStudio is its ONLY
  consumer — strip those decorations from the component (keep drag/reorder logic
  and the add-button behavior untouched).

### Progress overlay
- Determinate bottom bar (2pt height, full width of the media) + small status text
  (preparing/uploading with real %). Kill the full-surface pulsing overlay — a
  determinate bar is honest and calmer. Reduced-motion: no pulse, bar only.
- 'preparing': indeterminate shimmer on the bar only (no % text). 'pending': no
  overlay beyond dimmed opacity.

### Typography
- First viewport uses at most three type sizes: bodyStrong (empty title), meta
  (count/status), body (action labels). No new type styles.

### Copy
- Remove ALL explanatory sentences from this surface. Labels only: "Add your first
  photo", "Up to 10 photos", "Add more", "Take photo", "Retry", "Remove", "Edit".
  No exclamation marks, no selling copy.

## Constraints

- TS strict, no `any`, no new deps. Use existing tokens: Space, Radius, Stroke,
  TypographyV2, colors via useAppTheme. Keep useHaptic + reduced-motion behavior.
- Do NOT change: props contract of ListingMediaStudio (hosts unchanged), the crop
  sheet integration, FocalImage usage, VideoPosterThumb logic, upload/queue code,
  CreatorCropSheet, CreatorAssetPicker (parallel task owns those).
- SortablePhotoStrip: visual de-chrome only; drag/reorder/add-button logic intact.
- The file must end SMALLER than it starts (deletions exceed additions).
- Accessibility: every control keeps a role + label; decorative glyphs aria-hidden.
- No comments restating the obvious; match the file's existing comment style.

## Verification

1. npm run typecheck; scoped eslint; npm test (baseline 7 pre-existing unrelated).
2. Thumbnail test (self-critique, document in report): at 25% zoom the surface
   should read as ONE dominant media object + a quiet rail + a quiet action row —
   not a grid of identical grey cards. List exactly which chrome you removed.

## Report

Append to .flagship/sdd/task-3A-report.md; return ONLY status, one-line test summary, concerns.
