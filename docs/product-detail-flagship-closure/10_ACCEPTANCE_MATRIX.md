# Product Detail Flagship Closure — Acceptance Matrix

## Global

- [ ] All three canonical screens use shared detail primitives.
- [ ] No duplicate screens or routes.
- [ ] Maximum three visible hero controls.
- [ ] No debug gear or diagnostics.
- [ ] No repeated large price in the first two viewports.
- [ ] No repeated family/state badge.
- [ ] No nested generic cards.
- [ ] No hardcoded production colours.
- [ ] No missing value converted to zero.
- [ ] No unsupported commercial or market claim.
- [ ] Dock never covers content.
- [ ] 320pt width has no truncation.
- [ ] Dark mode passes.
- [ ] Large text passes.
- [ ] Reduced motion passes.
- [ ] Canonical BottomSheet used for overflow.
- [ ] Native screenshots exist.

## Auction

- [ ] Identity has no price.
- [ ] Only one auction state treatment.
- [ ] Bid history uses one pattern.
- [ ] Terminal result not duplicated.
- [ ] Compact action labels.
- [ ] Multi-media contract exists.
- [ ] Winner/seller fulfilment contract exists.
- [ ] Seller, buyer, leading, outbid, won, lost, cancelled pass.
- [ ] Server clock remains authoritative.
- [ ] Bid and Buy Now preflight unchanged.

## Co-Own

- [ ] Market snapshot endpoint exists.
- [ ] Reference price is not called Last trade without proof.
- [ ] Compact phone has no three-column fundamentals table.
- [ ] Candle toggle hidden without real candle data.
- [ ] Chart is width-responsive.
- [ ] Viewer position appears before supply.
- [ ] Missing dossier rows omitted.
- [ ] Dossier collapsed by default.
- [ ] Risk collapsed by default.
- [ ] Holder primary action is Sell.
- [ ] Fully allocated state has a real action.
- [ ] Treasury not inferred.
- [ ] One discovery rail maximum.
- [ ] Rights gating remains intact.

## Direct Listing

- [ ] No fabricated people-interested count.
- [ ] Likes are not labelled Demand.
- [ ] Sold comparables are server-derived.
- [ ] Purchase details are not duplicated.
- [ ] Q&A collapsed by default.
- [ ] Three discovery modules maximum.
- [ ] Canonical production listing types used.
- [ ] Engagement summary null handling works.
- [ ] Buy, offer, checkout and manage remain intact.

## Backend

- [ ] Co-Own market snapshot integration tests pass.
- [ ] Null remains null.
- [ ] Settled-only last trade.
- [ ] Supply values explicit and nullable.
- [ ] Auction media array persisted and returned.
- [ ] Auction fulfilment states returned.
- [ ] Engagement endpoint exists.
- [ ] Comparables endpoint exists.
- [ ] Price-history endpoint exists.
- [ ] Q&A summary exists.
- [ ] Authorization and validation pass.
- [ ] No destructive migration.

## CI

- [ ] Frontend typecheck green.
- [ ] Frontend tests green.
- [ ] Backend build green.
- [ ] Backend tests green.
- [ ] Integration tests green.
- [ ] Expo Doctor green.
- [ ] Design-token lint green.
- [ ] Maestro validation green.
- [ ] Screenshot artifact attached.
- [ ] GitHub checks attached to head SHA.
