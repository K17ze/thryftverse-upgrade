# Phase 4 Regression Validation

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## What Phase 4 did well

Do not roll these back:

- canonical Auction browse/filter state;
- Profile owner/public separation;
- Poster and Look architectural separation;
- Co-Own shared query/cache truth;
- Due Diligence split;
- Wallet flow decomposition;
- agent runtime/capability/consent work from Phase 3.1;
- reduced generic dashboard cards on several utility screens;
- search/backend-truth cleanup;
- production-residue tooling.

## Where Phase 4 regressed

### Home: over-flattened commerce identity

Current Home `ExploreGridItem` intentionally removed:
- seller avatar;
- condition badges;
- title text;

and left primarily:
- media;
- price overlay;
- one interaction signal.

A later repair commit reduced the price treatment from 20pt bold to 15pt semibold and shortened the scrim.

The result follows the rule “content/media should dominate,” but forgets that a **commerce tile needs enough identity to evaluate the object**.

Pinterest can often let imagery carry a Pin. A marketplace card must usually carry at least:
- what it is;
- price;
- one context cue.

### Co-Own: global flattening already had to be reversed

Phase 4 changed the positions rail into a vertical arrangement; a later commit explicitly restored the horizontal FlashList. This is a concrete proof that a universal flat-row transformation damaged the user model.

### Notifications: simplification without a single semantic model

The screen now exposes:
- All/Unread;
- semantic overflow filters;
- Today/Yesterday/Earlier.

That is still three classification systems.

### Utility improvements became a style prescription

Settings, Connections and Seller Analytics benefit from flattening.
Home, Galleria, Co-Own positions, collections and editorial discovery require richer object geometry.

## Why this happened

The Phase 4 instructions correctly said “content over chrome,” but implementation interpreted this as:
- remove text;
- remove cards;
- remove accents;
- flatten layouts.

That is a **style transformation**, not product art direction.

## Phase 5 correction

Every component must declare one presentation role:

- editorial media;
- commerce discovery;
- commerce detail;
- personal collection;
- social identity;
- attention event;
- transaction;
- evidence;
- utility;
- live market;
- creator canvas;
- agent approval.

Then optimize within that role.

## Regression acceptance test

A Phase 5 change is rejected if it:
- makes a commerce object less identifiable at a glance;
- removes state needed for a decision;
- converts a visual collection into a list merely for consistency;
- adds text only to compensate for unclear hierarchy;
- applies the same component grammar to unrelated product roles.
