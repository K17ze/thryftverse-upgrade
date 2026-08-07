# Product Detail Flagship Closure — Implementation Roadmap

## Pass 0 — Baseline

- Confirm clean tree.
- Record base branch and SHA.
- Push any missing local ninth commit before branching.
- Run complete frontend and backend baseline.
- Record pre-existing failures.
- Capture current native screenshots.

Commit only if baseline documentation is added.

## Pass 1 — Shared visual system

Implement:

- family transaction variants;
- section variants;
- responsive identity;
- compact/stacked dock;
- restrained button radii;
- design-token cleanup.

Commit:

`refactor(commerce-detail): add family art direction and responsive density`

## Pass 2 — Auction closure

Implement all requirements from `02_AUCTION_VISUAL_CLOSURE_PROMPT.md`.

Commit:

`feat(auction-detail): complete flagship hierarchy and fulfilment closure`

## Pass 3 — Co-Own closure

Implement all requirements from `03_COOWN_PREMIUM_COMPRESSION_PROMPT.md`.

Commit:

`feat(coown-detail): compress asset ownership experience and add market truth`

## Pass 4 — Direct Listing closure

Implement all requirements from `04_DIRECT_LISTING_SUBTRACTION_PROMPT.md`.

Commit:

`feat(item-detail): subtract duplicate content and add authoritative insights`

## Pass 5 — Backend contract closure

Implement all requirements from `06_BACKEND_CONTRACTS_PROMPT.md`.

If backend contracts are large, split into:

1. Co-Own snapshot/fundamentals
2. Auction media/fulfilment
3. Direct engagement/comparables/Q&A

Do not combine unrelated migrations.

## Pass 6 — Runtime tests

Add React Native Testing Library and backend integration coverage.

Commit:

`test(product-detail): add runtime state and contract coverage`

## Pass 7 — Native visual acceptance

Run `07_NATIVE_VISUAL_QA_PROMPT.md`.

Fix all rejected states.

Commit:

`polish(product-detail): close native flagship visual matrix`

## Pass 8 — CI and final documentation

- verify all workflows;
- upload QA artifacts;
- complete final report;
- list known limitations.

Commit:

`ci(product-detail): enforce flagship release gates`

## Merge rule

Do not merge until:

- every P0 item passes;
- no unresolved clipping or duplicate hierarchy remains;
- authoritative contracts replace fabricated claims;
- CI is attached and green;
- native screenshots are reviewed.
