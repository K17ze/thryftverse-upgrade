# Native Visual QA & Release Gate V6

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Critical correction

Latest Phase 5 closure changed screenshot baseline tests so they can skip gracefully when native baselines are absent.

That is acceptable for ordinary feature CI if native infrastructure is unavailable.

It is **not acceptable as the final flagship release criterion**.

## Two gates

### Feature CI
Can skip unavailable native screenshot environment.

### Visual Release CI
Blocking before release:
- native device/emulator captures exist;
- approved baseline exists;
- current captures generated;
- human optical review complete.

## Required Phase 6 routes

- Home
- Storefront
- Product standard
- Product authenticated luxury
- Watch
- Car
- Yacht enquiry
- Search
- Visual Search
- Profile
- Saved
- Poster camera
- Poster photo edit
- Poster video timeline
- Poster viewer
- Look source tray
- Look 5-object canvas
- Look viewer
- Sell standard
- Sell authenticated
- Auction
- Galleria
- Asset/Due Diligence
- Inbox/Chat
- Notifications
- Wallet
- Checkout
- Seller Hub
- Settings

## Device matrix

- current compact iPhone;
- current large iPhone;
- 360dp Android;
- Pixel-class Android;
- tablet/foldable for key routes.

## Media sharpness

Screenshot inspection at native pixels:
- grid;
- detail;
- zoom.

## Rating rubric / 30

0–2 each:
- cultural coherence;
- media fidelity;
- hierarchy;
- typography;
- spacing;
- composition;
- control restraint;
- motion continuity;
- transaction clarity;
- trust/evidence;
- state truth;
- accessibility;
- performance feel;
- backend/fixture parity;
- platform fidelity.

Target flagship route:
>=26/30.
