# 08 — MASTER AGENT EXECUTION PROMPT

You are reconstructing ThryftVerse’s canonical product-detail system to genuine flagship production quality.

## Repository

`K17ze/thryftverse-upgrade`

## Required base

`feat/p0-flagship-truth-modes`

Do not start from `main` or an older product branch.

Create and work only on:

`feat/product-detail-flagship-reconstruction`

## Read first

Read every file in:

`docs/product-detail-flagship-reconstruction/`

Also read:

- `Design.md`
- `AGENTS.md`
- current product-detail screens and components;
- current tests covering product, auction and Co-Own truth.

## Core diagnosis

The current Co-Own detail screen is feature-rich and truth-aware but visually poor because it is assembled as stacked rounded cards. The phone layout uses equal-width Market/Fundamental/Cash columns that clip. Unit price is repeated. Generic supply is stronger than the viewer’s actual position. The chart shows controls and can show `+0.0%` even when data is unavailable. The Rights incomplete dock is large, passive and blocks content. Risk, issuer, rights, valuation and buyout sections form a long settings-dashboard silhouette.

Auction and direct listing use stronger media-first foundations but still have too many visible actions, too many independent modules and inconsistent visual grammar.

## Mission

Reconstruct the existing canonical screens in place:

- `AssetDetailScreen`
- `AuctionDetailScreen`
- `ItemDetailScreen`

Create a shared media-led detail grammar and preserve family-specific transaction semantics.

## Required visual outcome

The result must feel:

- media-first;
- calm;
- luxury-neutral;
- compact;
- native;
- high-trust;
- production-ready;
- comparable in composition quality to current Pinterest, Instagram, Depop and Vinted product surfaces;
- without copying their branding or layouts.

The page should look authored as one surface—not like a component gallery.

## Hard constraints

1. Do not change backend behaviour.
2. Do not fabricate any data.
3. Do not create duplicate V2 screens.
4. Do not remove existing functionality.
5. Do not replace truthful unavailable states with fake charts or placeholder values.
6. No champagne gold, glow, decorative glass, heavy gradients or gratuitous shadows.
7. Use current real tokens and theme primitives.
8. Preserve accessibility, haptics, reduced motion, safe area and transaction preflight.
9. Keep all existing routes stable.
10. Remove visible debug/diagnostic UI from acceptance captures.
11. Do not complete only Co-Own and leave auction/direct visually divergent.
12. Do not claim completion without native screenshots and passing verification.

## Implementation requirements

### Shared shell

Build/reconstruct shared primitives under the existing commerce component system for:

- compact scrolling header;
- media action rail;
- identity seam;
- transaction surface;
- metric row;
- disclosure row;
- section rhythm;
- seller/issuer row;
- inline unavailable state;
- sticky state/action dock.

### Co-Own

- Replace the three equal phone columns with a dominant market snapshot and secondary fundamental/cash rows.
- Make viewer position the primary ownership story.
- Collapse supply structure.
- Remove duplicated price hierarchy.
- Hide chart controls when chart data is absent.
- Never map missing movement to `0`.
- Convert Rights incomplete dock into an actionable `Review rights` state.
- Collapse risk and dossier content.
- Fix unsupported buyout language.
- Keep order book and rights truth intact.

### Auction

- Use the shared shell.
- Limit hero actions.
- Keep one auction-state treatment.
- Combine current bid, countdown, reserve and viewer state.
- Preserve server-clock, idempotency and transaction preflight.
- Collapse bid history and rules.
- Keep terminal result states compact.

### Direct listing

- Use the shared shell.
- Consolidate identity, price and protection.
- Bring seller confidence upward.
- Consolidate shipping/returns/authenticity.
- Reduce pills and independent cards.
- Remove unsupported price history.
- Deduplicate discovery rails.
- Preserve buy, offer, manage, save, wishlist, collection, Q&A and analytics.

## Responsive rules

Validate at 320, 360, 390 and 430 logical widths.

No:

- clipped bid/ask values;
- wrapped primary actions;
- overlapping title/actions;
- dock/content collision;
- chart controls without chart;
- giant passive warnings;
- visible debug gear;
- repeated large price;
- nested cards.

## Execution sequence

Use the six passes in `06_IMPLEMENTATION_ROADMAP.md`.

Commit after each pass with the specified commit theme.

Do not make one enormous unreviewable commit.

## Verification

Run:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run check:animated-scroll
npm --prefix frontend run lint:design-tokens
npm --prefix frontend run test
npm --prefix frontend run check:maestro-flows
npm --prefix frontend run doctor
```

Update or add tests for:

- missing market movement;
- empty chart controls hidden;
- rights-incomplete action;
- compact width;
- family action count;
- direct/auction/Co-Own shared shell usage;
- no duplicate price hierarchy where testable;
- buyer/seller/holder state docks.

## Native QA

Capture the complete matrix in `07_ACCEPTANCE_MATRIX.md`.

Use production-like/integration-truth runtime mode. Do not use fixture fallback to make the pages look populated.

## Final response format

Return:

1. starting branch and SHA;
2. final branch and SHA;
3. commit list;
4. exact changed files;
5. architecture summary;
6. direct/auction/Co-Own before-vs-after hierarchy;
7. commands and test results;
8. screenshot paths grouped by device/state;
9. known limitations;
10. explicit confirmation that no backend semantics changed.

Do not answer with a plan only. Implement the `.tsx` reconstruction, tests and native acceptance work.
