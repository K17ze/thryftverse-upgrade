# Master Execution Prompt — Product Detail Flagship Closure

You are completing the flagship closure of ThryftVerse’s canonical product-detail system.

## Repository and branch

Repository:

`K17ze/thryftverse-upgrade`

Required base:

`feat/product-detail-flagship-reconstruction`

Create:

`feat/product-detail-flagship-closure`

Before any implementation:

```bash
git status
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git fetch origin
git checkout feat/product-detail-flagship-reconstruction
git pull --ff-only
git checkout -b feat/product-detail-flagship-closure
```

If the working tree is not clean, stop and report the exact files. Do not stash or discard unrelated work without approval.

## Mission

Turn the current shared-shell reconstruction into a production-quality flagship product-detail family across:

- `ItemDetailScreen.tsx`
- `AuctionDetailScreen.tsx`
- `AssetDetailScreen.tsx`

The current branch is structurally improved but still around a 6.9/10 product-detail system. The target is a credible 8.5+/10 native product experience.

## Current diagnosis

### Shared system

The shared architecture is correct, but:

- `CommerceDetailTransactionSurface` is still a generic rounded dashboard card;
- `CommerceDetailSection` creates repetitive divider-label-row cadence;
- `CommerceDetailIdentity` is too rigid and templated;
- `CommerceDetailStateDock` is too pill-heavy and can overflow compact screens;
- all three families use similar geometry even though their transaction priorities differ.

### Auction

Auction remains the weakest family because it still duplicates:

- current bid in identity and transaction surface;
- auction state in media and identity;
- bid history through heading, disclosure, preview rows and “View all”;
- terminal result in body and sticky dock.

Auction also only supports one image and has incomplete winner/seller fulfilment.

### Co-Own

Co-Own is materially better but still has:

- a three-column secondary fundamentals strip on phones;
- `unitPriceGbp` labelled “Last trade” without settled-execution proof;
- empty candle data passed to candle mode;
- over-expanded dossier and risks;
- inferred treasury language;
- holder action hierarchy that makes Buy primary and Sell secondary;
- fully allocated state without a direct next action;
- excessive discovery rails.

### Direct Listing

Direct Listing is now structurally coherent but still contains:

- fabricated “people interested” count;
- likes relabelled as “Demand”;
- sold comparables derived from incomplete client-side listing context;
- duplicate purchase-summary and disclosure content;
- fully expanded Q&A;
- excessive discovery modules;
- a local custom overflow overlay instead of the canonical sheet.

## Required result

The finished family must feel:

- media-first;
- quiet;
- native;
- compact;
- high-trust;
- editorial rather than dashboard-like;
- consistent without appearing templated;
- truthful when data is missing;
- visually complete at 320, 360, 390 and 430 logical widths;
- production-ready in light and dark mode.

## Implementation rules

1. Preserve existing routes.
2. Preserve all transaction and compliance checks.
3. Preserve auction server-clock handling and idempotency.
4. Preserve Co-Own rights gating.
5. Preserve direct-listing buy, offer, checkout, save, wishlist, collections, Q&A and analytics.
6. Do not add another generic wrapper layer.
7. Subtract duplicate content before adding UI.
8. Use progressive disclosure for legal, supply, dossier, Q&A and history.
9. Every displayed market or engagement claim must map to an authoritative field.
10. When a backend contract is missing, add it truthfully or remove the UI claim.

## Required implementation sequence

Follow `09_IMPLEMENTATION_ROADMAP.md` exactly.

## Required verification

Run all commands documented in `08_TEST_AND_CI_PROMPT.md`.

## Required final response

Use `11_FINAL_REPORT_TEMPLATE.md`.

Do not report “flagship complete” unless every applicable item in `10_ACCEPTANCE_MATRIX.md` passes.
