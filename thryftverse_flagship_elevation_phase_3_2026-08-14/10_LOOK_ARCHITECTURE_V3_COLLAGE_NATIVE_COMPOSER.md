# Look Architecture V3 — Collage-Native Composer

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Product distinction

Poster is temporal. Look is spatial.

The top-level UI must express this instead of sharing a generic editor.

## New screen

Create `frontend/src/creator/look/LookComposerScreen.tsx`.

Canvas:
- 4:5 primary canvas;
- neutral workspace;
- direct object manipulation.

Default bottom actions:
- Add item
- Add photo
- Cutout
- Text
- Layout

Selected object produces a context toolbar.

## Initial composition

Retain Phase 2 `computeLookLayout`.

Improve it with:
- source aspect ratios;
- subject salience where available;
- no aggressive default crop;
- Shuffle layout;
- stable position when replacing media.

## Marketplace-native objects

A product object stores canonical listing ID and snapshot metadata.

Published UI can reveal product tags on tap. Do not permanently bake price/info cards into the visual.

### Add item drawer

Sources:
- My closet/listings
- Saved
- Marketplace search
- Recently viewed

Selecting an item adds a visual object, not a settings row.

## Cutout

Treat background removal as a real visual operation.

If high-quality removal is unavailable, keep the original media rectangle. Never pretend a cutout succeeded.

## Object actions

- delete
- duplicate
- replace
- front/back
- crop
- remove background where supported
- link/change item

Global Layers remains More/Advanced.

## Assistance

Vision/AI may propose arrangement or pairings as a reversible layout.

Copy:
`Try arrangement`
not
`AI Magic`.

## Published Look

Fashion editorial first:
- visual;
- creator;
- tap-to-reveal tags;
- save/remix;
- related items below/in sheet.

No giant metadata dashboard below the artwork.
