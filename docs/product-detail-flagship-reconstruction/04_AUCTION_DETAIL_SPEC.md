# 04 — AUCTION DETAIL RECONSTRUCTION

## Goal

Auction must feel urgent and premium without becoming noisy.

The current screen is already closer to the desired media-first model than Co-Own, but it still has:

- too many floating hero actions;
- multiple state badges;
- static `Colors` usage;
- transaction, viewer and terminal modules that can stack;
- large detail sections;
- possible duplication between watch, save and favourite;
- a long screen with several unrelated containers.

## Required mobile order

### 1. Media

- Shared media stage.
- Back, Share, Saved/Watch, Overflow.
- Maximum three visible utility controls.
- One auction-state chip.
- Do not render separate Like, Save and Watch controls simultaneously unless product semantics prove all three are necessary.
- Watch is the auction participation state. Save-to-collection may remain in overflow.

### 2. Identity

- brand;
- title;
- condition;
- seller confidence row;
- no duplicated large title elsewhere.

### 3. Auction transaction surface

One strong surface containing:

- current bid or starting bid;
- bid count;
- reserve status;
- countdown;
- minimum next bid;
- Buy Now price when available;
- viewer state.

Priority:

1. current actionable amount;
2. countdown;
3. next action;
4. reserve and supporting metadata.

### 4. Viewer state

Integrate into the transaction surface rather than adding another full-width block when possible:

- Leading;
- Outbid;
- Watching;
- Seller view;
- Won;
- Lost;
- Cancelled.

Do not stack both a viewer-state block and a duplicate sticky action explanation.

### 5. Bid history

Compact disclosure:

- `Bid history`;
- count;
- latest bid summary;
- sheet for full history.

### 6. Product evidence

Use the same shared evidence rhythm as direct listing:

- description;
- category facts;
- authenticity;
- seller;
- delivery/fulfilment;
- auction rules.

Auction rules should be a disclosure row, not another large generic card.

### 7. Sticky dock

Live:

- current/minimum next bid;
- `Place bid`;
- optional `Buy now` only when truly available.

Outbid:

- `Minimum to lead`;
- `Bid again`.

Leading:

- calm leading state;
- secondary action to increase max bid only if supported.

Terminal:

- one result state;
- one next valid action.

### 8. Visual restrictions

- No ornamental urgency red.
- Red is reserved for factual outbid/error/final urgency.
- Countdown uses tabular numerals.
- Final-minute treatment must not animate aggressively.
- Avoid four circular hero buttons.
- Replace large square/rounded utility containers in the collapsed header with quiet glyph hit targets.

## Existing files to reconstruct

- `frontend/src/screens/AuctionDetailScreen.tsx`
- `frontend/src/components/auction/AuctionStickyBidDock.tsx`
- `frontend/src/components/auction/AuctionCountdown.tsx`
- `frontend/src/components/auction/AuctionStateBadge.tsx`
- `frontend/src/components/auction/ReserveStatusBadge.tsx`
- `frontend/src/components/ui/BidSheet.tsx`
- `frontend/src/components/ui/BuyNowSheet.tsx`

Do not change auction transaction semantics.
