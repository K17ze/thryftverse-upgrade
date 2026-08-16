# Look — collage-native visual commerce

## Code surfaces inspected / affected

- `frontend/src/creator/look/LookComposerScreen.tsx`
- `frontend/src/creator/CreatorAssetPicker.tsx`
- `frontend/src/creator/CreatorCutoutSheet.tsx`

## Current diagnosis


Look has the correct spatial architecture. Phase 3.1 truthfully renamed fake Cutout to Manual Crop.

The next quality leap is not adding more sticker types. It is making sourcing, placement and commerce association feel as fluid as Pinterest collage creation.


## User psychology / product job


The user thinks:
- “I want these things together.”
- “Swap this item.”
- “Move this behind that.”
- “Find something similar.”
- “Make this shoppable.”

They do not think:
- “add a media layer with z-index.”


## Flagship target composition


Default:
4:5 canvas + bottom source/action tray.

Source tray:
- For you
- Saved
- Closet
- Marketplace
- Camera Roll

Selected object:
- Crop
- Swap
- Duplicate
- Remove
- Bring forward/back
- Link item
- Manual Crop (truthful)


## Detailed implementation map


1. Replace giant sticker/tool taxonomy in the first tray with product-relevant source categories.
2. Search inside source tray.
3. Tap source result inserts near center with intelligent non-overlap.
4. After 2+ objects, show optional `Layout` suggestions.
5. “Try arrangement” becomes contextual and reversible, never labelled AI.
6. Swap preserves transform/size where appropriate.
7. Product object retains stable listing ID separate from visual media URI.
8. Manual Crop is rectangular/bounding crop and stays named exactly that.
9. Future true background removal gets a new capability only when implementation can produce transparency robustly.
10. Product linkage appears as subtle hotspot/outline in edit mode and minimal badge in viewer.
11. Canvas background/negative space can be authored; default remains neutral.
12. Snapping/guides appear during drag only.


## Micro-detail pass


- Selection box uses corners/handles only while selected.
- Do not keep Layers panel visible.
- Object shadows are content style choices, not editor chrome defaults.
- Source tray thumbnails high-density and media-first.


## Acceptance / screenshot QA


Pass:
- make a 5-object shoppable Look using only direct gestures and bottom tray.
- no user-facing “layer/z-index” terminology in primary flow.


## Reference crosswalk


- Pinterest Collage/visual shopping: media objects as composable sources.
- Pinterest visual search: an object can lead to visually related shopping.
