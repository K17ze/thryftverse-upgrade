# Look V6 — Spatial Styling & Shoppable Collage Instrument

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Target

Look should feel like:
- a stylist's board;
- a visual diary;
- a shoppable composition;
- a personal editorial.

Not:
- a generic layer editor with commerce buttons.

## Entry

Default Look opens:
- recent source tray / Saved / Closet / Marketplace;
- blank/neutral canvas;
- Camera.

A user should be able to create a Look without first thinking “add layer”.

## Source drawer

Tabs:
- For you
- Saved
- Closet
- Marketplace
- Camera Roll

Search stays inside the source drawer.

Pinterest’s collage model is a useful behavioural reference: sources, cutouts, layers, text, draw and swap should feel like one collage workflow.

## Object insertion

Tap source:
- insert near centre;
- preserve high-quality source;
- avoid overlap intelligently;
- select object.

## Selection actions

Primary:
- Swap
- Crop
- Duplicate
- Remove

Secondary:
- Forward/back;
- lock;
- flip;
- opacity.

Do not expose z-index terminology.

## Swap

Swap is strategically important.

When user swaps a handbag/shoe/top:
- preserve approximate transform;
- preserve rotation;
- preserve object role;
- preserve associated position.

## Product object

Keep stable listing ID separate from rendered image.

The visual object may be:
- rectangular photograph;
- server-generated transparent product cutout;
- manual crop.

## True cutout

Current Manual Crop truthfulness must remain.

Introduce “Cutout” only after a real segmentation pipeline can:
- create transparent alpha;
- preserve fine edges;
- preserve object holes/straps;
- avoid halo;
- handle dark objects/backgrounds.

Luxury bags, jewellery and watches require especially careful edge QA.

## Product hotspot

Published Look:
- composition remains visually clean;
- product dots/markers can be hidden until tap;
- tap reveals product drawer;
- product page transition is immediate.

## Templates

Do not ship 50 generic templates.

Create small art-directed systems:
- Lookbook;
- Packing;
- Weekend;
- Objects;
- Evening;
- Archive;
- Wishlist;
- Drop.

Templates establish rhythm, not branded “premium” decoration.

## Caption

Look can have:
- composition title on canvas;
- normal post caption below/after;
- tagged-product list.

Do not force long caption into artwork.

## Acceptance

A user should make a coherent 5-object shoppable Look in <60–90 seconds without opening a Layers panel.
