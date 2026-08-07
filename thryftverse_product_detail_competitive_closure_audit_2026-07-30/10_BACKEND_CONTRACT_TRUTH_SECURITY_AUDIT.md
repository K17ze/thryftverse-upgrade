# Backend Contract, Truth and Security Audit

## Severity summary

### P0

1. Remove or authorize the public Co-Own holdings route exposing holder financial data.
2. Stop Direct mapper fabrication and status collapse.
3. Make non-public listings inaccessible except to authorized owners/operators.
4. Supply versioned Co-Own rights/dossier truth so fail-closed trading can become operable.
5. Close Auction Buy Now into exactly one order/fulfilment transaction.

### P1

6. Add reserve-state support to the auction contract.
7. Add versioned realtime/resume semantics to Auction and Co-Own.
8. Canonicalize media for all families.
9. Replace generic protection/returns values with an authoritative policy quote.
10. Make market/book snapshots atomic and meaningfully timestamped.
11. Add media ordering and immutability constraints.

## Direct contract

Return:

- exact status;
- server-derived viewer capabilities and denial reasons;
- canonical media;
- explicit nullable item facts;
- seller trust summary with provenance;
- policy/checkout quote with version and expiry;
- reservation/offer context where authorized;
- semantic counts named correctly.

Never make the mobile mapper responsible for commercial truth.

## Auction transaction closure

Use one database transaction/locking strategy to:

- verify auction version and eligibility;
- ensure live status and valid price;
- end bidding for Buy Now;
- record authoritative winner/result;
- create exactly one order/reservation/payment intent;
- write an outbox event;
- return a versioned outcome.

Idempotency must return the original result under retries. Provider webhooks must be inboxed, deduplicated and processed asynchronously.

## Co-Own market closure

- Return dossier and rights as immutable/versioned records.
- Make viewer position private and asset-scoped.
- Generate book levels and sequence in one consistent transaction/snapshot.
- Limit bid and ask sides independently.
- Separate `generatedAt`, `lastBookChangeAt` and `lastExecutionAt`.
- Stream monotonic events with resumption.
- Enforce holdings and cash invariants under concurrent orders.

## Media integrity

- Verify upload owner, checksum, content type, dimensions and scan/moderation state.
- Verify video poster belongs to the same authorized publication.
- Add unique ordering and optimistic publication version.
- Freeze a media version when an auction/Co-Own offering becomes live.
- Re-check takedown status at read time or propagate invalidation reliably.

## Privacy and authorization

- Define owner, seller, bidder, holder, issuer, operator and public projections.
- Do not expose bidder/holder identity or financial basis unless required and authorized.
- Return stable reason codes without leaking private existence/details.
- Add object-level authorization tests for every detail and child route.

## Observability

Record:

- detail load/partial failure by family;
- snapshot age and event lag;
- bid/order idempotency replays;
- checkout unknown-outcome recovery;
- media playback/finalization failure;
- policy quote failures;
- privacy-denied route attempts;
- invariant and reconciliation alerts.

No completion without integration tests using a real database and provider simulators.

