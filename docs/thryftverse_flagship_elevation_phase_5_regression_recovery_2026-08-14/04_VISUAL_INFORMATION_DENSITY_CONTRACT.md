# Visual Information Density Contract

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Why Phase 4 Home became bland

The previous pass correctly attacked excessive metadata but did not define the **minimum useful information floor**.

Flagship quality sits between:
- overloaded;
- anonymous.

## Minimum useful information by role

### Home commerce tile
Required:
- object media;
- one identity line;
- price.

Optional one:
- size;
- seller;
- price drop;
- auction/live;
- match reason.

### Search result
Required:
- media;
- identity;
- price;
- enough structured context to distinguish similar results.

### Saved
Required:
- media;
- price only if purchasing context is active.

### Seller inventory
Required:
- image;
- title;
- price;
- status;
- one operational fact.

### Notification
Required:
- actor/object;
- verb/state;
- time;
- CTA only if actionable.

## Density budget

Phone first viewport:
- no more than one persistent chip rail unless it is the primary navigation/scope;
- no more than two equal-weight primary actions;
- no repeated metadata that can be inferred from imagery/context;
- no identity-free commerce tile unless the visual itself contains reliable product identity.

## Hierarchy test

Blur/squint test:
1. dominant media/object visible?
2. next-important text obvious?
3. action obvious?
4. no competing 5th/6th importance tier?

## “Blandness” test

A screen is too sparse if:
- removing imagery leaves no clue what product/item/state it represents;
- every tile looks interchangeable;
- visual hierarchy relies only on whitespace;
- product identity requires opening detail;
- sections lose rhythm because all text styles become similarly quiet.

## “Slop” test

A screen is too busy if:
- every feature has a badge;
- every row has icon-circle + subtitle;
- every item has seller + title + brand + size + condition + likes + status;
- content is boxed twice;
- action labels narrate implementation.
