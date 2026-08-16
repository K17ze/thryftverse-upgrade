# Error Recovery & Edge-Case Matrix

Flagship robustness is visible when the happy path breaks.

| Scenario | Required behaviour |
|---|---|
| Shipping quote expires during checkout | re-quote before payment; show changed price/service explicitly |
| Buyer address becomes invalid pre-payment | block checkout with targeted address fix |
| Label generation timeout | retry idempotently; GET fulfilment restores already-created label |
| Provider returns 500 | preserve purchased service; do not silently switch |
| Provider outage lasting hours | explain state + retry; alternative only through server-approved migration |
| QR unavailable | printable label path |
| Printer unavailable | QR/drop-off code path |
| QR rejected at shop | alternate label/drop-off/support path |
| Parcel size mismatch | guide package correction/requote policy; no silent carrier mutation |
| Seller selects wrong manual carrier | prevent or warn before submission |
| Seller uses wrong integrated label | explain protection/cancellation consequence |
| No carrier first scan | waiting state + proof/recovery path; do not instantly claim in transit |
| Seller misses ship deadline | server policy cancels/extends; UI explains money consequence |
| Seller requests extension | buyer gets explicit accept/decline with new date |
| Buyer does not respond to extension | policy-driven result, not indefinite pending |
| Carrier reports delay | update ETA/event and notify without changing money incorrectly |
| Carrier reports delivery exception | surface reason + carrier/support actions |
| Parcel marked delivered but buyer cannot find | specific issue branch |
| Buyer receives item before scan | secondary early-receipt path with consequence confirmation |
| Buyer reports damage | collect evidence; freeze payout if policy requires |
| Buyer reports not-as-described | case + evidence + response deadlines |
| Return label fails | same idempotent recovery quality as outbound |
| Return is never scanned | deadline/recovery |
| Refund provider pending | show `Refund pending`, never `Refunded` |
| Duplicate webhook | idempotent transition |
| Out-of-order carrier event | event ordering/reconciliation; never regress visible state |
| App killed after payment success | resume from server truth, not local stage |
| App killed after label purchase | restore label by provider label ID |
| Offline during status mutation | do not fake success; preserve pending intent carefully |
| Multi-device seller session | same server next action on both devices |
| Buyer cancels while seller dispatches | transactional conflict resolution; one canonical winner |
| Seller regenerates label repeatedly | reuse or void/reissue with audit trail; no duplicate charges |
| Expired signed label URL | issue fresh access URL from stable label ID |
| Tracking number malformed | validation + correction rules before irreversible submission |
| Carrier unsupported link | keep integrated tracking view; external link optional |
| Partial parcel-event outage | show last known state + stale timestamp, not blank page |
| Payment succeeded but order creation uncertain | reconcile by idempotency key/signature |
| Payout failure | order stays complete; payout becomes separate actionable exception |
| Account restricted mid-order | preserve consumer obligations/support path |
| Dynamic type causes CTA wrap | layout remains usable and target height expands |
| Screen-reader user | state + consequence read in logical order; icon-only controls labelled |
