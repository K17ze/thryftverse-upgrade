# POSTER DEPARTMENT TOOLING REWORK — August 2026

## Audit Summary

### What ThryftVerse HAS (keep)
- 14 layer types (media, text, product, mention, look, vote, quiz, question, emojiSlider, countdown, decorative, draw, gif, music)
- Multi-page with duration control (3-15s)
- Undo/redo with history stack + labels
- Draft autosave + draft list
- 21 templates with categories (featured, announcement, interactive, story, editorial, sale)
- Pinch/rotate/pan gestures with center snapping + 15° rotation snap
- Selection handles with spring animation
- Tool dock with BlurView glass pill
- Text picker: 10 styles, 5 effects, 5 animations, background color, alignment
- Draw picker: 5 brushes (pen, marker, highlighter, neon, eraser), 10 colors, 5 sizes
- GIF picker (GIPHY), Music picker (iTunes)
- Interactive sticker pickers (quiz, question, emoji slider, countdown, vote)
- Crop + cutout sheets
- Publish sheet: caption, visibility, scheduling, allow replies/reactions
- Settings sheet: title, caption, accessibility, visibility, remix, canvas ratio
- Layers sheet: lock/hide/duplicate/delete/reorder
- Entry screen: camera + gallery + blank canvas

### CRITICAL GAPS vs Instagram/Snapchat (the "shit" parts)

## P0 — Structural/UX failures

### P0-1: Tool dock is overcrowded — NO unified sticker tray
**Problem:** Poster dock has 13 tools: Media, Text, Draw, GIF, Music, Poll, Quiz, Ask, Slider, Countdown, Mention, Elements, Add Page. Instagram has 6: Text, Stickers (smiley), Draw, Music, Layout, Restyle. Snapchat has 5: Text, Stickers, Draw, Scissors, Lens.
**Fix:** Consolidate Poll, Quiz, Ask, Slider, Countdown, Mention, GIF, Elements into a single "Stickers" tool that opens a unified Sticker Tray with search + categories (Interactive, Mentions, Media, Utility, Shapes). Dock becomes: Media, Text, Stickers, Draw, Music, Add Page.

### P0-2: Missing essential stickers
**Problem:** No Link, Location, Hashtag, Time, Weather stickers. These are table-stakes — Instagram and Snapchat both have all 5.
**Fix:** Add 5 new layer types: link, location, hashtag, time, weather. Add to schema, canvas renderer, sticker tray.

### P0-3: No page reordering
**Problem:** Can add/duplicate/delete pages but NOT reorder them. Instagram allows swipe-to-reorder in preview.
**Fix:** Add drag-to-reorder on page dots row (long-press a page dot, drag to new position).

### P0-4: Alert-based page duration UI
**Problem:** Page duration uses native Alert.alert with button lists (3s/5s/7s/10s/15s). This is prototype-level — not a proper designed surface.
**Fix:** Replace with a proper bottom sheet with a segmented control or slider.

### P0-5: No background color/gradient picker
**Problem:** Canvas background is set via templates but there's no UI to change it manually. Users can't pick a solid color or gradient background.
**Fix:** Add background picker to settings sheet: solid colors, gradients, transparent.

## P1 — Quality gaps

### P1-1: No eyedropper or color spectrum
**Problem:** Color pickers only have preset swatches. Instagram/Snapchat both have eyedropper + long-press for full spectrum.
**Fix:** Add eyedropper button to text/draw color rows. Add long-press on swatch for spectrum gradient.

### P1-2: No vertical brush size slider on draw canvas
**Problem:** Brush size is selected via discrete dots below the canvas. Instagram has a vertical slider on the LEFT side of the canvas for continuous brush size control.
**Fix:** Add vertical brush size slider overlay on draw canvas.

### P1-3: No Close Friends / Save to Camera Roll in publish
**Problem:** Publish only has Public/Private toggle. Instagram has Close Friends, Save to Camera Roll, Share to DM.
**Fix:** Add Close Friends audience option + Save to Camera Roll toggle in publish sheet.

### P1-4: No cover selection for multi-page stories
**Problem:** Multi-page stories have no cover frame selection. Instagram lets you pick a cover.
**Fix:** Add cover selection in publish sheet for multi-page posters.

## P2 — Future parity (not in this pass)
- Auto-captions sticker
- Custom sticker creation (cutout → sticker)
- Multi-select for layers
- Page transitions (fade/slide)
- Music for whole story
- Arrow brush + emoji brush
- "Add Yours" sticker
- Filters/AR effects
- AI Restyle tools
