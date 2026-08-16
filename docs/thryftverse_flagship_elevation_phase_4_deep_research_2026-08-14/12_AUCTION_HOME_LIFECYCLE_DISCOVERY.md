# Auction Home / lifecycle discovery

## Code surfaces inspected / affected

- `frontend/src/screens/AuctionHomeScreen.tsx`
- `frontend/src/utils/auctionHomeLogic.ts`
- `frontend/src/components/auction/*`

## Current diagnosis


The old structural filter conflict is substantially fixed: one canonical `AuctionBrowseState`, one scope rail, server facets and removable active filters.

The remaining problem is visual hierarchy. The header still exposes five actions: Search, Filter, Create, Seller Centre and Activity. The screen also has category worlds, attention state, live runway, supporting tiles, upcoming/results and filters.


## User psychology / product job


Auction users scan for:
- what is live;
- what is ending;
- whether I am winning/outbid;
- what is worth watching.

Seller/admin tasks are separate from that buyer scan.


## Flagship target composition


Scope:
`Live | Upcoming | Results | Watching`

Within each scope, the page adopts a different composition rather than recycling one universal card grammar.

Live:
- one urgent/featured runway;
- dense secondary market.

Upcoming:
- scheduled programme rows.

Results:
- compact ledger.

Watching:
- personalized state-first rows.


## Detailed implementation map


1. Header default:
   - Search
   - Filter
   - overflow
2. Put Create Auction and Seller Centre behind overflow or a seller-specific entry.
3. Activity becomes an attention affordance only when `needsAttentionCount > 0`; otherwise available in overflow/My Bids.
4. Ending soon remains a sort/filter within Live.
5. Category rail appears only when it materially helps discovery and not above a highly relevant attention state.
6. Do not duplicate the same auction in runway + grid within the same short scroll.
7. Timer urgency:
   - >1h neutral;
   - <10m emphasis;
   - final minute semantic urgency;
   no constant red flashing.
8. Filter chips only when active; result count is plain text.
9. Server facets remain source of truth.
10. Watching rows prioritize `Leading`, `Outbid`, `Starts in` ahead of generic category meta.


## Micro-detail pass


- Header icon hit targets invisible; visible glyphs quiet.
- Live card uses time and current bid as primary text, not 5 badges.
- “Results” rows use outcome color only on outcome.
- Category tiles use image + label without additional card chrome.


## Acceptance / screenshot QA


Pass:
- buyer can find live bidding in one glance;
- no more than 2 visible header actions plus overflow;
- lifecycle scope and sort are not duplicated;
- no duplicate item presentation in same viewport.


## Reference crosswalk


- Whatnot 2026: time, bid and winner state dominate.
- eBay filtering: buyer attributes remain secondary refinements.
