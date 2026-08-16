# Auction Full Audit

## Score

Visual/UI: 6.9/10  
Media: 6.5/10  
Contract/state truth: 5.4/10  
Overall: 6.3/10

## Strengths

- Canonical image/video media reaches the screen.
- The clock is based on server time and lifecycle is resynchronised.
- Bid and Buy Now requests use idempotency and refresh after mutation.
- The auction plaque has stronger family identity than the old shared card.
- Missing terminal money is no longer silently displayed as zero.
- Buyer/seller, live/terminal and action eligibility are better separated.

## Critical findings

### Reserve is visually supported but absent live

The client models `reservePriceGbp`, yet the backend auction detail does not select or return a reserve amount. Any reserve-met UI is therefore unreachable or dependent on non-production fixtures.

### Buy Now does not close the commerce workflow

The backend updates auction/bid/winner state, but the audited flow does not create the protected order and fulfilment transition expected from Buy Now. The response can look complete while the downstream transaction is not.

### A live-looking screen is not live

The backend emits auction events, but the screen does not subscribe or poll for competing bids. It updates on initial load, local transaction refresh, manual refresh and clock lifecycle resync. Current bid, leading/outbid state and activity may silently become stale.

### Terminal watching can render an empty result

The terminal-result logic lacks a meaningful branch for the watcher state, leaving a visually empty outcome container and a generic discovery dock.

### Media context is lost in fullscreen

Opening the viewer always starts at index zero. The active carousel index is ignored. Poster, focal, dimensions and blurhash are returned but flattened away before rendering.

## Required live-state model

Every auction response/event needs:

- auction version or monotonic sequence;
- server time;
- current bid and bidder-facing status;
- next minimum bid;
- reserve state without exposing restricted reserve data;
- bid count and last bid time;
- Buy Now availability;
- viewer capability and reason;
- settlement/fulfilment reference after close.

The client must reject or reconcile out-of-order events.

## Target composition

- Media remains product-first.
- Current bid and countdown form a single, purpose-built plaque.
- Reserve, watchers and bid count are secondary.
- Leading/outbid status is viewer-specific and immediately visible.
- A real bid update triggers a restrained pulse and screen-reader announcement.
- Terminal state replaces live bidding with Won/Lost/Sold/Cancelled plus the authoritative next action.

## Missing states

- realtime price change while viewing;
- bid rejected because a newer bid arrived;
- reserve not met at close;
- payment pending/failed;
- winner default and recovery;
- seller fulfilment required;
- shipping/tracking;
- dispute/cancel/refund;
- event connection lost and snapshot stale;
- restricted bidder/KYC/region;
- removed lot;
- media moderation/takedown.

## Acceptance examples

- Two clients bidding concurrently converge on the same versioned state.
- A stale client cannot claim “You’re leading.”
- Buy Now creates or returns exactly one order under retries.
- Closing an auction with unmet reserve never assigns a winner.
- The current carousel item opens in fullscreen at the same index.
- A video has a poster, loading, error/retry and background-pause behaviour.

