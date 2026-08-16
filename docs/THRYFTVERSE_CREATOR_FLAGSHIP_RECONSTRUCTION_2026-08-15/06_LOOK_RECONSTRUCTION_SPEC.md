# 06 — Look Flagship Reconstruction Specification

## Product mental model

Look is **spatial, shoppable composition**.

Its differentiation is not "another Instagram Story." It should be closer to:
- freeform editorial collage;
- visual styling board;
- product-aware composition;
- direct manipulation;
- remixable shopping inspiration.

## Entry flow

### Current problem
Camera-first is valid for capture, but Look creation often begins from:
- saved products;
- existing closet/listings;
- multiple gallery images;
- a product detail;
- remixing an existing Look.

### New entry chooser

Keep it visually lightweight, not a menu screen.

At bottom of entry:
- `Camera`
- `Photos`
- `Items`
- `Template`

Remember last-used source but do not trap users there.

## Successful default after media selection

If user selects N assets:
1. analyze intrinsic aspect ratios;
2. create a balanced composition;
3. immediately render it on canvas;
4. show 4–8 alternative layout thumbnails;
5. user can ignore alternatives and publish.

No blank "now arrange everything yourself" default.

## Layout rail

Replace blind `Try arrangement` cycling.

Render actual composition thumbnails:
- Editorial
- Grid
- Hero
- Pair
- Scatter
- Stack
- Magazine
- Minimal

The names are secondary; previews are primary.

### Preview mechanics
- thumbnail is real user's objects;
- tap commits one semantic history operation;
- scrub/press temporarily previews without committing;
- release reverts unless tapped/confirmed.

## True cutout

### Current branch truth
`CreatorCutoutSheet` is a manual rectangular crop.

Therefore:
- current default UI must not call this true cutout;
- rename to `Crop` until segmentation exists.

### Real P1 cutout contract

```ts
type MaskRef = {
  type: 'alpha-mask';
  uri: string;
  sourceAssetId: string;
  modelVersion?: string;
  featherPx?: number;
  invert?: boolean;
}
```

The original media remains intact.

### UX
Tap image → `Cut out`
- immediate auto-subject preview;
- edge refinement brush available under Refine;
- `Keep person`, `Keep object`, `Erase`, `Restore`;
- before/after hold gesture;
- commit produces a mask layer, not destructive source mutation.

## Product objects

Products are ThryftVerse's advantage.

### Adding an item
Sources:
- Closet
- My listings
- Saved
- Discover/Search
- From current media detection (future opt-in)

### Product card on canvas
Default should be visually small:
- image/object itself can be the hero;
- tag chip appears on tap or in preview;
- don't permanently attach a bulky marketplace card.

### Context actions
- Change item
- Hide price
- Show price
- Tag style
- Open product
- Remove

### Product validity
If listing sold/deleted:
- composition remains;
- product interaction becomes unavailable;
- user gets graceful status, not broken layer.

## Canvas behavior

### Object manipulation
- drag;
- pinch scale;
- rotate;
- tap select;
- double tap quick action;
- magnetic guides;
- alignment lines;
- overlap snapping;
- boundary resistance;
- delete target only during drag, not permanent.

### Smart selection
If objects overlap:
- repeated tap cycles candidates;
- long press opens compact layer stack;
- do not force Layers sheet for routine selection.

## Context rail

### Photo
- Replace
- Crop
- Adjust
- Effects
- Cut out (only true)
- More

### Product
- Item
- Tag style
- Price
- Front/Back
- Duplicate
- More

### Text
- Edit
- Font
- Color
- Align
- Effect
- More

### Multi-select
- Group
- Align
- Distribute
- Duplicate
- Delete

## Remove permanent disabled Cutout

A context action that silently haptics and does nothing when no media is selected trains users not to trust the UI.

Default bottom rail should not include actions requiring a specific selection.

Recommended default:
- Add
- Items
- Text
- Layout
- More

`Add` opens photo/camera.

## Commerce source tray redesign

Current source tray should become a **peek drawer**:
- collapsed: 56–64 pt handle with 3 recent item thumbnails;
- pull/tap: expands to 40–55% screen;
- canvas remains visible above;
- user can drag an item directly from tray to canvas;
- dropping creates product object at drop point.

This is far more direct than tap item → generic add action.

## Background

Allow:
- solid neutral;
- sampled image color;
- subtle gradient;
- blurred version of selected photo;
- transparent/white/black where platform output permits.

Do not use decorative luxury gradients as defaults.

## Templates

A template should be a **project**, not a poster image with slots.

Expose:
- preview;
- object structure;
- which slots are replaceable;
- product slots;
- text slots;
- optional style pack.

On apply:
- preserve user's assets;
- map assets intelligently;
- one-step undo.

## Publish preview

Look publish preflight should show the exact final composition with product interactions.

User can:
- add caption;
- toggle price visibility;
- choose visibility;
- allow remix;
- add accessibility description.

## Acceptance criteria

- [ ] selecting 4 photos produces a strong layout before any manual work;
- [ ] layout alternatives use live thumbnails;
- [ ] no action labelled `Cutout` produces only a rectangle;
- [ ] user can drag product from source drawer directly into composition;
- [ ] overlap selection is possible without opening global Layers sheet;
- [ ] all object transforms are reversible;
- [ ] source media remains non-destructive;
- [ ] published Look visually matches editor preview;
- [ ] offline draft restores after app restart with all local media intact.
