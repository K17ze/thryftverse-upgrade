# Direct Listing Full Audit

## Score

Visual/UI: 6.6/10  
Media: 4.5/10  
Contract/state truth: 4.8/10  
Overall: 5.4/10

## Strengths

- Better content order and less duplicated purchase information.
- Delivery and protection are combined behind disclosure.
- Q&A is collapsed.
- Discovery follows Bundle → Seen in Looks → More like this.
- Recommendations now carry title, brand/condition and price.
- The media-first opening and slim seller row are a credible foundation.

## Critical findings

### The mapper invents product facts

The listing mapper supplies synthetic defaults for brand, size, condition, category, subcategory, description, creation date and seller identity. Missing or invalid price can become zero, and a missing ID can be randomized. These values can be presented as facts.

Required rule: absence must remain absence. UI copy may explain missing data, but mapping code must never create commercial facts.

### Listing lifecycle collapses into sold/not-sold

The screen contract primarily preserves `isSold`. Draft, paused, deleted, reserved and other statuses are not mapped into capabilities, so a non-sold item can appear purchasable. The detail route also needs an explicit publication/ownership authorization policy.

### Direct media is image-string only

The Direct endpoint reads `image_url` and ordering, returning strings rather than canonical media objects. It discards media type, poster, geometry, blurhash and focal point. The screen does not provide an explicit video list; playback depends on URL heuristics.

### Policy truth is hardcoded

Buyer Protection, a 14-day return window and fee calculations are composed as generic response values rather than a versioned quote/policy decision tied to seller, item, buyer, jurisdiction and time. “Confirmed terms” is therefore too strong.

### Social/trust semantics are weak

The likes count is derived from wishlist data, and the seller trust response is largely nullable. The UI can imply a more mature reputation system than exists.

## Missing direct-listing states

- reserved and reservation expiry;
- offer pending, countered, accepted and expired;
- checkout in progress;
- payment pending/failed;
- seller paused;
- moderation removed;
- draft/private owner preview;
- deleted/unavailable;
- authentication required;
- location/shipping restriction;
- policy quote unavailable;
- partial seller/recommendation/Q&A failures;
- inventory changed while screen is open.

## Target composition

1. Object-safe media stage with thumbnails or a media scrubber.
2. Brand/title, price and condition/size in a clean editorial block.
3. Seller confidence strip with evidence-backed metrics.
4. One primary purchase/offer instrument.
5. One delivery/protection disclosure with a quote timestamp.
6. Description and item facts.
7. Questions as one row.
8. Relevant discovery only.
9. State-aware sticky dock.

## Backend closure

- Return a canonical `media[]` object shared across listing modes.
- Return exact lifecycle status and server-computed capabilities.
- Add viewer-specific availability, reservation and offer state.
- Replace hardcoded policy copy with a versioned policy/checkout quote.
- Define likes versus saves/watchers explicitly.
- Add seller trust aggregates with sample size and freshness.
- Protect non-public listing states.

## Acceptance examples

- A paused listing cannot render an enabled Buy action.
- A missing condition does not become “Very good.”
- A video whose URL has no `.mp4` suffix still renders as video from its type.
- A sold item remains inspectable but cannot enter checkout.
- A policy service failure results in a cautious unavailable state, not invented reassurance.

