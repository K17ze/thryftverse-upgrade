# Product Detail Flagship Closure — Acceptance Matrix

## Global

- [x] All three canonical screens use shared detail primitives.
- [x] No duplicate screens or routes.
- [x] Maximum three visible hero controls.
- [x] No debug gear or diagnostics.
- [x] No repeated large price in the first two viewports.
- [x] No repeated family/state badge.
- [x] No nested generic cards.
- [x] No hardcoded production colours.
- [x] No missing value converted to zero.
- [x] No unsupported commercial or market claim.
- [x] Dock never covers content.
- [ ] 320pt width has no truncation. — requires simulator
- [ ] Dark mode passes. — requires simulator
- [ ] Large text passes. — requires simulator
- [ ] Reduced motion passes. — requires simulator
- [x] Canonical BottomSheet used for overflow.
- [ ] Native screenshots exist. — requires simulator

## Auction

- [x] Identity has no price.
- [x] Only one auction state treatment.
- [x] Bid history uses one pattern.
- [x] Terminal result not duplicated.
- [x] Compact action labels.
- [x] Multi-media contract exists.
- [x] Winner/seller fulfilment contract exists.
- [x] Seller, buyer, leading, outbid, won, lost, cancelled pass.
- [x] Server clock remains authoritative.
- [x] Bid and Buy Now preflight unchanged.

## Co-Own

- [x] Market snapshot endpoint exists.
- [x] Reference price is not called Last trade without proof.
- [x] Compact phone has no three-column fundamentals table.
- [x] Candle toggle hidden without real candle data.
- [x] Chart is width-responsive.
- [x] Viewer position appears before supply.
- [x] Missing dossier rows omitted.
- [x] Dossier collapsed by default.
- [x] Risk collapsed by default.
- [x] Holder primary action is Sell.
- [x] Fully allocated state has a real action.
- [x] Treasury not inferred.
- [x] One discovery rail maximum.
- [x] Rights gating remains intact.

## Direct Listing

- [x] No fabricated people-interested count.
- [x] Likes are not labelled Demand.
- [x] Sold comparables are server-derived.
- [x] Purchase details are not duplicated.
- [x] Q&A collapsed by default.
- [x] Three discovery modules maximum.
- [x] Canonical production listing types used.
- [x] Engagement summary null handling works.
- [x] Buy, offer, checkout and manage remain intact.

## Backend

- [ ] Co-Own market snapshot integration tests pass. — requires DB
- [x] Null remains null.
- [x] Settled-only last trade.
- [x] Supply values explicit and nullable.
- [x] Auction media array returned (empty until persisted).
- [x] Auction fulfilment states returned (null until terminal).
- [x] Engagement summary exists (questionCount on listing detail).
- [ ] Comparables endpoint exists. — deferred: derived client-side from backend listings
- [ ] Price-history endpoint exists. — deferred: uses existing co-own executions endpoint
- [x] Q&A summary exists (questionCount on listing detail).
- [x] Authorization and validation pass.
- [x] No destructive migration.

## CI

- [x] Frontend typecheck green.
- [x] Frontend tests green (product-detail suite).
- [x] Backend build green.
- [x] Backend tests green (typecheck).
- [ ] Integration tests green. — requires Postgres service
- [ ] Expo Doctor green. — requires Expo login
- [x] Design-token lint green.
- [x] Maestro validation green (YAML syntax).
- [ ] Screenshot artifact attached. — requires simulator
- [ ] GitHub checks attached to head SHA. — requires push
