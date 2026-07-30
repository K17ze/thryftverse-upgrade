# Shared Visual-System Audit

## Current quality

The shared commerce components give the three screens consistent spacing, typography, identity placement, sections and sticky docks. The system succeeds at brand cohesion but does not yet create three distinct experiences.

`CommerceDetailTransactionSurface` and `CommerceDetailSection` mainly vary padding, radius and type scale. Auction and Co-Own remain structurally similar. The result is consistency through sameness.

## Structural issues

1. Repeated rounded containers flatten narrative priority.
2. Numeric typography is shared where the meaning differs: a purchase price, a live bid and a market price should not use identical composition.
3. Identity overlaid on media depends on contrast and competes with the product.
4. Fixed hero height and `cover` cropping can amputate footwear, bags and tall garments.
5. Sticky docks use a similar geometry regardless of whether the user buys, bids, lists a unit, reviews settlement or cannot transact.
6. Sections remain a long sequence rather than a designed narrative with pauses and compression.

## Target architecture

Keep shared primitives for:

- tokens and semantic colour;
- media lifecycle;
- accessibility;
- loading/error skeletons;
- sheets and dialogs;
- sticky-safe-area behaviour;
- event instrumentation.

Allow family-specific composition for:

- identity/price placement;
- transaction instrument;
- state transitions;
- supporting evidence;
- dock hierarchy;
- discovery density.

## Family visual grammar

### Direct — editorial desire

- Lightest chrome and largest object-safe stage.
- Title, brand and price sit below media unless an image has an explicitly safe overlay zone.
- Flat confidence strip; one disclosure surface.
- Discovery is visual but decision-complete.

### Auction — restrained theatre

- Current bid and time share a single optical axis.
- Live status is compact, animated only on real state changes.
- Viewer position—leading, outbid, watching, blocked—has a unique, accessible treatment.
- Terminal outcome replaces the live plaque.

### Co-Own — premium market

- Price, last-settled/reference label, spread and viewer position are one instrument.
- Evidence and rights use sober typography and versioned disclosures.
- Charts are small, legible and secondary to transaction truth.
- Avoid neon/crypto-terminal styling.

## Token and component requirements

- Define product-safe media ratios and fit modes.
- Add semantic tokens for live, stale, partial, terminal, blocked and evidence-unverified.
- Support 320–430 widths without screen-specific magic numbers.
- Support large text through reflow, not truncation or reduced fonts.
- Separate dock shell from family action layouts.
- Provide an explicit compact-density mode for disclosures and bid/order rows.
- Add snapshot stories/tests for every family and key state.

## Visual acceptance

A reviewer viewing screenshots without labels must be able to identify Direct, Auction and Co-Own from composition—not merely from words or colours—while still recognising them as the same product.

