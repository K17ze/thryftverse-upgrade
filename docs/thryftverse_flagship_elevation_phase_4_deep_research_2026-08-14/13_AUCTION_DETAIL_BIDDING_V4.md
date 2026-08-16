# Auction Detail / bidding

## Code surfaces inspected / affected

- `frontend/src/screens/AuctionDetailScreen.tsx`
- `frontend/src/components/ui/BidSheet.tsx`
- `frontend/src/components/ui/BuyNowSheet.tsx`
- `frontend/src/utils/auctionDetailLogic.ts`

## Current diagnosis


AuctionDetail has strong truth and lifecycle handling, idempotent transactions, stale data handling, bid/buy sheets, watch state and shared commerce primitives.

The flagship gap is compositional: it still imports a broad normal-product detail system. A live auction must feel different from a normal listing because time and competition change cognition.


## User psychology / product job


In a live auction, the user's attention loop is:
time → current price → my state → next bid → confidence.

The user should not scroll through generic product-detail sections before understanding whether/how to bid.


## Flagship target composition


Live first viewport:
- media;
- title;
- current bid;
- countdown;
- my status (leading/outbid/not bid);
- bid action.

Secondary:
- bid count/history;
- buy now if available;
- reserve state;
- seller/trust.

Deep:
- description/evidence;
- rules;
- related.


## Detailed implementation map


1. Create lifecycle-specific layout variants rather than only swapping labels.
2. Sticky dock for Live contains one dominant Bid and optional Buy now.
3. Bid sheet:
   - minimum next bid;
   - amount;
   - “you’ll pay” total;
   - confirmation.
4. Max/custom bid can be introduced as advanced option if backend supports.
5. Bid activity: show only most recent 3–5 rows inline; full history sheet.
6. Reserve status uses one restrained line.
7. Clock resync/stale state should replace timer with “Updating…” rather than keep a potentially false countdown.
8. Winning state after end becomes transaction/order continuation, not disabled Bid UI.
9. Upcoming state emphasizes start date + Watch/notify.
10. Related auctions only after item/rules are complete.


## Micro-detail pass


- Numeric text uses tabular figures.
- Countdown does not animate each second beyond number update.
- Haptic on successful bid/outbid transition is meaningful; avoid haptic on every data poll.
- Sheet height should fit one decision without nested scroll on standard phones.


## Acceptance / screenshot QA


Scenarios:
- upcoming;
- live no bid;
- leading;
- outbid;
- final minute;
- reserve not met;
- ended won/lost;
- buy now;
- stale/offline.

Pass:
- live bidding needs no scrolling to understand required next action.


## Reference crosswalk


- Whatnot: swipe/custom/max bid, visible countdown, automatic win purchase.
- Auction psychology: urgency is earned by time/state, not decorative color.
