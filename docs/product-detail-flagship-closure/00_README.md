# Product Detail Flagship Closure — Prompt Pack

## Repository

`K17ze/thryftverse-upgrade`

## Required base branch

`feat/product-detail-flagship-reconstruction`

Remote head reviewed during the audit:

`2f1b46edf8b671696d9bdeeac5bdcb5ee3d5eb2b`

GitHub reported this branch as eight commits ahead of `feat/p0-flagship-truth-modes` at audit time. If a ninth commit exists locally, push it before beginning this program and update the starting SHA in the final report.

## Recommended implementation branch

Create a clean child branch:

`feat/product-detail-flagship-closure`

Do not implement this closure directly on `main`.

## Purpose

The reconstruction branch created the right shared architecture and materially improved Co-Own, Direct Listing and Auction detail screens. It is not yet production-flagship because the remaining gap is no longer basic component structure. The remaining gap is:

- duplicated hierarchy;
- excessive vertical content;
- generic shared geometry;
- weak family-specific art direction;
- incomplete backend truth contracts;
- non-authoritative market and engagement claims;
- incomplete auction fulfilment;
- insufficient native visual acceptance.

## Prompt order

Run the prompts in this order:

1. `01_MASTER_EXECUTION_PROMPT.md`
2. `02_AUCTION_VISUAL_CLOSURE_PROMPT.md`
3. `03_COOWN_PREMIUM_COMPRESSION_PROMPT.md`
4. `04_DIRECT_LISTING_SUBTRACTION_PROMPT.md`
5. `05_SHARED_COMPONENT_ART_DIRECTION_PROMPT.md`
6. `06_BACKEND_CONTRACTS_PROMPT.md`
7. `07_NATIVE_VISUAL_QA_PROMPT.md`
8. `08_TEST_AND_CI_PROMPT.md`

Use:

- `09_IMPLEMENTATION_ROADMAP.md` as the commit sequence;
- `10_ACCEPTANCE_MATRIX.md` as the release gate;
- `11_FINAL_REPORT_TEMPLATE.md` for the final response.

## Core visual target

All three detail families must share one recognisable ThryftVerse product-detail grammar while maintaining different transaction priorities:

- Direct Listing: identity, price, seller confidence, purchase confidence, buy/offer.
- Auction: identity, current bid, countdown, reserve, viewer state, bid/buy-now.
- Co-Own: identity, issuer confidence, market snapshot, holding, rights, trade.

The goal is not to copy Pinterest, Instagram, Depop or Vinted. Their references define:

- media dominance;
- information restraint;
- high-confidence spacing;
- clear action hierarchy;
- progressive disclosure;
- low visual noise;
- native interaction quality.

## Hard constraints

- Do not create duplicate `V2`, `New`, `Premium`, `Redesign` or replacement screens.
- Modify the canonical existing screens and components.
- Do not fabricate data.
- Do not relabel social metrics as commercial metrics.
- Do not call a reference price “Last trade” without settled-execution proof.
- Do not infer treasury, public float, sponsor lock or distribution values.
- Do not expose unavailable chart modes.
- Do not remove existing transaction safeguards.
- No champagne gold, neon, heavy gradients, glass gimmicks or glow effects.
- Preserve theme, accessibility, haptics, reduced motion, safe area, idempotency and server-clock behaviour.
- No visual-completion claim without native screenshots.
