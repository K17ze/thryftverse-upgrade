# 06 — IMPLEMENTATION ROADMAP

## Branch policy

1. Verify clean working tree.
2. Checkout `feat/p0-flagship-truth-modes`.
3. Pull latest remote.
4. Create:
   - `feat/product-detail-flagship-reconstruction`
5. Do not implement directly on `main`.
6. Do not mix unrelated backend work into this branch.

## Pass 0 — Baseline and invariants

Before code changes:

- record current branch and SHA;
- list modified files;
- run:
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run check:animated-scroll`
  - `npm --prefix frontend run lint:design-tokens`
  - `npm --prefix frontend run test`
  - `npm --prefix frontend run check:maestro-flows`
- inspect current screenshots for:
  - 320/360/390/430 widths;
  - light/dark;
  - holder/non-holder;
  - open/closed/blocked;
  - auction live/upcoming/terminal;
  - direct buyer/seller/sold.

Do not use the current screenshots as a visual target.

## Pass 1 — Shared shell

Reconstruct:

- `CommerceMediaStage`;
- collapsed detail header;
- action rail;
- identity seam;
- disclosure row;
- section rhythm;
- unavailable inline state;
- state dock.

Acceptance:

- no debug overlay;
- maximum three visible hero controls;
- no large rounded-square collapsed-header buttons;
- title and one transaction fact appear by the second viewport;
- shared light/dark behaviour.

Commit:

`feat(product-detail): establish shared flagship detail shell`

## Pass 2 — Co-Own

Implement the complete Co-Own spec.

Mandatory:

- replace equal-width phone value strip;
- remove duplicated unit-price hierarchy;
- personalise ownership before supply;
- collapse supply structure;
- truthful compact chart states;
- actionable rights-incomplete dock;
- compact risk summary;
- resolve buyout language;
- issuer confidence near identity.

Commit:

`feat(coown): reconstruct asset detail as media-led market story`

## Pass 3 — Auction

Implement auction spec on the shared shell.

Mandatory:

- reduce hero control count;
- unify transaction and viewer state;
- compact bid-history/rules;
- preserve server-clock and transaction preflight;
- keep sheets and idempotency behaviour.

Commit:

`feat(auction): align auction detail with flagship commerce shell`

## Pass 4 — Direct listing

Implement direct listing spec.

Mandatory:

- consolidate policy strips;
- reduce chip/card density;
- move seller confidence upward;
- remove unsupported/fabricated price history;
- deduplicate discovery sections;
- preserve checkout/offer/save/collection behaviour.

Commit:

`feat(product): reconstruct direct listing detail hierarchy`

## Pass 5 — State and accessibility closure

Test all state combinations.

Mandatory:

- large text;
- long title;
- missing image;
- one image;
- multiple images;
- no seller avatar;
- unavailable market data;
- rights incomplete;
- holder/non-holder;
- offline/error;
- keyboard/sheets;
- reduced motion;
- dark mode.

Commit:

`test(product-detail): close responsive state and accessibility matrix`

## Pass 6 — Native visual acceptance

Use Maestro flows and manual captures.

Required screens:

- Direct listing;
- Auction live;
- Auction terminal;
- Co-Own open holder;
- Co-Own open non-holder;
- Co-Own rights incomplete;
- Co-Own chart unavailable.

Required devices:

- 320–360pt compact;
- 390pt standard;
- 430pt large;
- Android equivalent;
- dark and light.

Reject the pass when:

- text clips;
- controls overlap;
- the dock covers the last content;
- an unavailable chart retains inactive controls;
- any `+0.0%` is shown without data;
- visible debug controls remain;
- any page looks like stacked settings cards.

Commit:

`polish(product-detail): native flagship visual acceptance`

## Final report

The agent must produce:

- starting branch/SHA;
- final branch/SHA;
- commits;
- exact changed files;
- commands and results;
- screenshots by state/device;
- remaining limitations;
- explicit confirmation that no backend semantics changed.
