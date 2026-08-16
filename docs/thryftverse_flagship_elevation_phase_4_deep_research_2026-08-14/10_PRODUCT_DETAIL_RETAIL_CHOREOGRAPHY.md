# Normal listing Product Detail

## Code surfaces inspected / affected

- `frontend/src/screens/ItemDetailScreen.tsx`
- `frontend/src/components/commerce/detail/*`
- `frontend/src/components/product/*`

## Current diagnosis


ItemDetail has become technically sophisticated, but its import/state inventory reveals the remaining risk: media, family badge, description, recommendations, size guide, bundle, Q&A, evidence, seller info, shipping/returns, purchase details, offers, price alerts, fullscreen viewer and multiple sheets all compete for placement.

This is the classic point where a feature-complete detail page can still feel less premium than a simpler competitor.


## User psychology / product job


The buyer asks questions in a predictable order:

1. Do I want it?
2. What exactly is it?
3. Can I trust this listing/seller?
4. What will it cost/when will it arrive?
5. What happens if something is wrong?
6. Is there an alternative?

The page should follow that cognition rather than the component directory.


## Flagship target composition


Viewport choreography:

### 1 — Desire
Large media, no taxonomy badge over photography unless essential.

### 2 — Identity
Brand / title / size / condition / price.
Only one dominant price treatment.

### 3 — Confidence
Seller + maximum 3 concise trust facts.

### 4 — Action
Sticky Buy / Offer state.

### 5 — Detail
Description and item specifics.

### 6 — Logistics/protection
Shipping, returns, buyer protection.

### 7 — Social evidence
Q&A/reviews if they exist.

### 8 — Continuation
One recommendations system before further generic explore.


## Detailed implementation map


1. Audit `ProductFamilyBadge`: hide when route/context already establishes normal listing.
2. Pagination: choose dots for short galleries OR `n / total` for long galleries; do not permanently show both.
3. Put video in the same media pager with play-state fidelity.
4. Price alert moves to overflow/save follow-up unless price tracking is a major user job.
5. Bundle upsell appears only when seller actually has bundle-eligible inventory.
6. Size Guide appears adjacent to size when category supports it.
7. Q&A section appears only with Q&A or a single “Ask seller” row.
8. Condition explanation belongs beside condition, not a separate generic information card.
9. `purchaseDetailsVisible`, shipping and protection should resolve into one `Buying details` disclosure architecture.
10. Recommendations: choose one primary reasoned rail then a masonry continuation; do not stack multiple visually identical rails.
11. Seller row stays visually flat and human; seller trust details expand on demand.
12. Swipe-to-dismiss must not conflict with media swipes/scroll; require device gesture QA.
13. Skeleton must mirror exact media/identity/trust geometry.


## Micro-detail pass


- Media stage may be edge-to-edge; content margins resume below.
- Use hairlines/whitespace rather than cards for item specifics.
- Price gets tabular/numeric style but not huge finance typography.
- Trust icons no more than 3 and no icon-circle for each.
- Avoid “premium” gradients except image scrim.
- Sticky dock can use material/glass only as top interaction layer, not a nested card.


## Acceptance / screenshot QA


Capture:
- 1 photo;
- 8+ media including video;
- missing brand;
- no size;
- luxury/authenticated;
- seller with poor/no trust;
- offer enabled/disabled;
- sold/unavailable;
- compact Android.

Pass:
- first 1.5 screens answer desire + identity + confidence;
- no more than one recommendation module before end of item information;
- action never gets obscured by navigation.


## Reference crosswalk


- Vinted: first image full item, authenticity/flaws visible.
- eBay: main photo drives search; many images/video support evidence.
- Depop: clear accurate details and images.
- Luxury reference logic: media and object identity before operational detail.
