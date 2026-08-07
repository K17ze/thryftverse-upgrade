# Product Detail Test and CI Closure Prompt

## Objective

Replace source-string-only confidence with runtime, contract and native coverage.

## Required commands

Run from repository root:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run check:animated-scroll
npm --prefix frontend run lint:design-tokens
npm --prefix frontend run check:maestro-flows
npm --prefix frontend run doctor
npm --prefix backend/api run build
npm --prefix backend/api run test
npm --prefix backend/key-service run build
npm --prefix backend/key-service run test
```

Run integration tests with required services and environment variables.

## Required frontend tests

### Shared primitives

Use React Native Testing Library for:

- family transaction variants;
- section variants;
- compact identity;
- stacked dock;
- reduced motion;
- disabled and loading actions;
- long labels;
- safe-area behaviour.

### Direct Listing

Test:

- authoritative engagement summary;
- no fabricated interested count;
- no Demand-from-likes;
- collapsed Q&A;
- three discovery modules maximum;
- canonical bottom sheet;
- owner/buyer/sold/unavailable docks.

### Auction

Test:

- one price hierarchy;
- one state badge;
- one bid-history pattern;
- terminal result not duplicated;
- compact dual-action dock;
- won/lost/seller/cancelled states;
- fulfilment next action;
- multi-media contract.

### Co-Own

Test:

- market snapshot states;
- reference vs settled price;
- null movement;
- no candle toggle without candles;
- holder Sell primary;
- fully allocated next action;
- no inferred treasury values;
- compact fundamentals;
- collapsed dossier and risk;
- responsive chart.

## Required backend tests

Add integration tests for:

- market snapshot;
- settled trade derivation;
- stale state;
- empty order book;
- Co-Own supply nullability;
- auction media;
- result/fulfilment;
- engagement summary;
- sold comparables;
- price history;
- Q&A summary.

## CI requirements

The pull request must show:

- frontend typecheck;
- frontend test suite;
- backend build/tests;
- database integration tests;
- Expo Doctor;
- design-token lint;
- Maestro validation;
- screenshot/native QA artifact upload;
- no skipped production-critical test without explanation.

## No-go rule

Do not report completion when CI status is absent.

If a GitHub status is not attached, provide:

- local command output;
- exact environment;
- reason CI did not execute;
- plan to restore CI before merge.

## Commit

`ci(product-detail): enforce runtime contract and native release gates`
