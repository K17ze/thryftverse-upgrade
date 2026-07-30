# Auction Realtime, Fulfilment and Art-Direction Prompt

## Goal

Build restrained auction theatre backed by realtime, versioned market truth and complete terminal fulfilment.

## Realtime

- Subscribe to authenticated/public auction events as appropriate.
- Include monotonic version/sequence and server time.
- Resume after reconnect; resnapshot on gaps.
- Expose connecting/live/stale/recovering states.
- Recompute viewer leading/outbid eligibility after every accepted event.
- Announce meaningful changes accessibly without announcing every timer tick.

## Transaction closure

- Bid with idempotency and optimistic version.
- Reconcile price-changed rejection.
- Buy Now creates exactly one order and returns its authoritative next action.
- Close handles reserve met/not met, winner, payment pending/failed and seller fulfilment.
- Terminal screens link to the correct order, payment or seller task.

## Art direction

- One auction plaque: current bid and remaining time dominate.
- Bid count, reserve state and watchers remain secondary.
- Leading/outbid/blocked status is visibly viewer-specific.
- Only real events trigger a restrained visual pulse.
- Terminal state fully replaces live controls.
- Media is immutable/versioned lot evidence.

## States and tests

Test scheduled, live eligible, leading, outbid, watching, blocked, reserve not met, won, lost, cancelled, payment pending/failed, fulfilment required, disconnected/stale and removed.

Run multi-client concurrency, out-of-order event, reconnect/gap, idempotency replay and end-boundary tests with a real database.

## Evidence

Provide event schema, state machine, transaction diagram, API examples, integration results and device captures. A single-client happy path is insufficient.

