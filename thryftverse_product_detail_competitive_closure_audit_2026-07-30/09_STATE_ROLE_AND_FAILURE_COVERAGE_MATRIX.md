# State, Role and Failure Coverage Matrix

Legend: **C** credible source support; **P** partial/mocked/contract gap; **M** missing.

## Direct

| State | Buyer | Seller | Evidence |
|---|---:|---:|---|
| Live/available | C | C | Main happy path |
| Sold | C | C | `isSold` path |
| Reserved | M | M | Not preserved as capability |
| Offer pending/countered/accepted | P | P | Not a complete detail-state model |
| Checkout/payment pending | M | P | Not represented on detail |
| Draft/private preview | M | P | Route authorization/publication concern |
| Paused/deleted/removed | M | P | Can collapse into purchasable |
| Shipping/policy restriction | P | P | Generic policy values |
| Partial seller/policy failure | P | P | Needs explicit degradation |

## Auction

| State | Buyer/bidder | Seller | Evidence |
|---|---:|---:|---|
| Scheduled | P | P | Needs screenshot/runtime proof |
| Live, eligible | C | C | Strong local path |
| Leading/outbid/watching | P | C | No competing-bid live update |
| Reserve met/not met | M | M | Backend reserve absent |
| Buy Now | P | P | Auction state changes; order closure absent |
| Ended won/lost | P | P | UI exists; fulfilment response null |
| Cancelled | P | P | Generic next-step wording |
| Payment/fulfilment/dispute | M | M | Not a closed detail workflow |
| Connection stale/recovering | M | M | No realtime connection model |

## Co-Own

| State | Viewer/holder | Issuer | Evidence |
|---|---:|---:|---|
| Live market | P | P | Static snapshot can appear continuous |
| Complete rights, tradable | M | P | Live contract omits rights |
| Partial book failure | C | C | Explicit partial state |
| Partial holdings failure | C | C | Explicit partial state |
| No available primary units | P | C | Secondary action lacks book-aware explanation |
| Holder position | P | P | Private list fetch, not asset-scoped response |
| Halted/closed/stale | P | P | Freshness semantics insufficient |
| Order pending/partial fill | P | P | Needs full device/runtime proof |
| Settlement failed/reversed | M | M | Not a closed surface |
| Dossier version/evidence missing | C fail-closed | P | Contract incomplete |

## Cross-family failures required

- page not found versus forbidden versus removed;
- primary request timeout;
- partial secondary-section failures;
- authentication expiry;
- capability changed while viewing;
- mutation timeout with unknown outcome and idempotent recovery;
- offline/reconnecting;
- media unavailable/taken down;
- stale snapshot;
- rate limited;
- accessibility announcement for meaningful state change.

## Completion rule

Every applicable cell must have:

1. an authoritative backend representation;
2. a typed frontend capability/state;
3. a rendered runtime test;
4. a native screenshot for visually distinct states;
5. telemetry for failure and recovery paths.

Mock-only cells remain partial.

