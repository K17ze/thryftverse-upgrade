# Role-aware Visual System — Replace Global Flattening

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## The key Phase 5 design-system change

Do not define a screen as “premium”, “flat” or “media-first”.

Define the object’s **role**.

## Role 1 — `commerceDiscovery`

Examples:
- Home listing tile;
- Search result;
- recommendations.

Needs:
- media;
- identity;
- price;
- max one context fact.

Can use:
- variable media geometry;
- subtle overlay actions.

Must not:
- become image-only;
- show 5 badges.

## Role 2 — `editorialMedia`

Examples:
- Galleria;
- themed Look feature;
- curated collection.

Needs:
- composition freedom;
- strong media;
- editorial title/context.

Must not:
- inherit price/availability badges from marketplace tiles.

## Role 3 — `personalCollection`

Examples:
- Saved board;
- Closet collection;
- Outfit/Look library.

Needs:
- mosaic/visual identity;
- title + count;
- direct manage mode.

## Role 4 — `socialIdentity`

Examples:
- profile;
- person row;
- inbox conversation.

Needs:
- avatar/media;
- name;
- one secondary relationship/state.

## Role 5 — `attentionEvent`

Examples:
- notification;
- seller needs-attention;
- outbid event.

Needs:
- verb;
- object;
- urgency;
- action if required.

## Role 6 — `transaction`

Examples:
- offer;
- bid;
- checkout;
- wallet conversion.

Needs:
- amount;
- object;
- consequence;
- explicit commit;
- durable status.

## Role 7 — `evidence`

Examples:
- authenticity;
- due diligence;
- provenance;
- order proof.

Needs:
- source;
- date;
- document/media;
- factual hierarchy.

## Role 8 — `utility`

Examples:
- Settings;
- Connections;
- preference rows.

Default:
- flat;
- hairlines;
- few icons;
- no hero unless urgent.

## Role 9 — `liveMarket`

Examples:
- Auction live;
- Co-Own order book.

Needs:
- time/state/price;
- tabular numerics;
- semantic urgency.

## Role 10 — `creatorCanvas`

Needs:
- content full-screen;
- transient controls;
- direct manipulation.

## Role 11 — `agentApproval`

Needs:
- actor;
- requested action;
- affected object/data;
- explicit safe action.

## Enforcement

Add a review checklist, not a runtime enum requirement.

Every visual PR states:
- role;
- information budget;
- action budget;
- containment rationale.

A global refactor cannot change multiple roles using one mechanical prescription without screenshots from each.
