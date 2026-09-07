# Co-Own market benchmark matrix

Research access date: 2026-09-06.

| Surface | Kalshi / Polymarket pattern | Co-Own implementation gate |
|---|---|---|
| Discovery | Price is paired with volume/depth and filters. | Tiles expose reference price, available units, best ask or `No current asks`, and ask depth. |
| Detail | Identity and executable top-of-book lead; rules and activity follow. | Asset detail leads with media, rights/provenance, best bid/ask, ownership and a deliberate buy/sell entry. |
| Ticket | Review precedes submit; partial/open/rejected states remain visible. | Server preview, reservation, protected market order, idempotency lookup, and truthful outcome copy. |
| Book | Snapshot plus ordered deltas; gaps trigger resnapshot. | Shared authenticated stream hook with sequence-gap recovery and retry state. |
| Portfolio | Cash, reserved cash, positions, open orders and fills are separated. | Holdings projection carries reserved units and bid-depth proceeds; marked value is labelled separately from sale proceeds. |
| Resolution / trust | Rules, source, custody and lifecycle are explicit and versioned. | Rights, risk, provenance and custody fields render only when backed by rows. |

Primary sources are recorded in the campaign research ledger and include Kalshi Pro market scanning/order panel/charts, Kalshi order-book WebSocket, Polymarket prices/orderbook/order lifecycle, positions API, matching-engine recovery, and resolution docs.
