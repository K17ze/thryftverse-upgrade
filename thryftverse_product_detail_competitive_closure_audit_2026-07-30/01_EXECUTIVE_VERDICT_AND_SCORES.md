# Executive Verdict and Scores

## Verdict

The branch has moved beyond a generic first pass. Co-Own now has a credible premium-market direction, Auction has the most mature transaction behaviour, and Direct is more focused than before. It is still not flagship or production-closed.

The central problem is no longer a lack of components. It is a gap between what the interface confidently communicates and what the live contracts can prove. The shared system also gives all three families too much of the same card-and-section rhythm, while media treatment is below leading product-commerce standards.

## Scores

Scores are source-level estimates informed by the supplied reference screenshots. They are not device-verified scores.

| Family | Visual/UI quality | Media readiness | State/backend truth | Overall now | Target |
|---|---:|---:|---:|---:|---:|
| Direct | 6.6 | 4.5 | 4.8 | **5.4/10** | 8.8 |
| Auction | 6.9 | 6.5 | 5.4 | **6.3/10** | 9.0 |
| Co-Own | 7.0 | 2.5 | 3.8 | **4.8/10** | 9.0 |
| Shared system | 5.9 | 5.0 | 5.1 | **5.4/10** | 8.7 |
| Overall closure | 6.7 visual direction | 4.8 | 4.7 | **5.7/10** | 8.9 |

## What is genuinely better

- Direct compresses delivery/protection, improves discovery order, includes useful recommendation facts, and avoids the earlier repetitive purchase-detail stack.
- Auction accepts canonical image/video items, uses server-authoritative time, supports idempotent bid/Buy Now calls, refreshes after transactions, and has clearer live/terminal compositions.
- Co-Own distinguishes reference price from settled trade truth, treats failed book/holding requests as partial-data states, blocks unsafe trading, and avoids inferring treasury inventory.
- The three screens share recognizable brand DNA and a cleaner media-to-identity-to-transaction sequence.

## P0 release blockers

1. Direct fabricates brand, category, size, condition, timestamps and seller fallbacks in its mapper.
2. Direct exposes only image URL strings and loses media type, poster, geometry and focal data.
3. Listing capabilities collapse nearly every non-sold status into “purchasable.”
4. Co-Own’s live asset response omits the rights data the screen requires, so a normal live non-issuer asset fails closed into “Trading unavailable.”
5. A public Co-Own holdings route exposes user identifiers, units, entry price and realised P&L.
6. Auction reserve price is modelled in the client but absent from the live detail response.
7. Auction Buy Now marks auction state but does not close into an order/fulfilment workflow.
8. Auction looks live without a bid-event subscription or polling loop.
9. Co-Own shows a “continuous” market without a live book stream and uses a misleadingly fresh response timestamp.
10. Media ordering is not uniqueness-constrained; active transactional evidence can be mutated; poster URLs are not verified.
11. The complete frontend test suite is red.
12. Database integration tests are skipped and the native screenshot report is empty.

## Quality gap against leaders

Leading commerce products assign one dominant job to the first viewport. Luxury/editorial products preserve the object with controlled backgrounds and restrained typography. Auction products turn time, current bid and action eligibility into one unmistakable live instrument. Ownership/investment products foreground evidence, position and market freshness.

Thryftverse currently combines attractive ingredients but still distributes attention too evenly. The upgrade should not mean more gradients, cards or badges. It should mean:

- a protected product stage with deliberate aspect-ratio behaviour;
- one family-specific transaction instrument;
- less repeated explanation;
- stronger typography and whitespace cadence;
- visible data provenance and freshness;
- state changes that alter composition, not merely labels;
- an evidence-backed media viewer worthy of expensive products.

## Recommended sequence

Fix contract truth and privacy first. Then build the media contract and family-specific compositions. Finally run native device closure. Visual polish before contract closure would polish states that the backend cannot safely support.

