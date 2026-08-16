# Flagship Psychology & Interaction Principles

Flagship quality is largely the removal of micro-uncertainty.

## 1. Recognition over recall

A seller should **see** “Buyer chose Evri ParcelShop · QR code · ship by Tuesday” instead of remembering what happened at checkout or opening help.

**Rule:** never make a user remember a transactional choice that the system already knows.

## 2. Information scent

Labels must tell the user what they will get:
- `Get shipping label`
- `Show drop-off QR`
- `Print label`
- `Track parcel`
- `Inspect item`
- `Report a problem`

Avoid weak labels:
- `Continue`
- `Manage`
- `Done`
- `Proceed`
- `Mark shipped` when the real task is packaging/handoff.

## 3. Choice reduction

Every extra equally strong CTA increases the scan cost. Premium apps do not eliminate capabilities; they hide low-probability capabilities behind context-sensitive secondary locations.

**Rule:** one primary next action per state, then at most one visible secondary if it is frequently co-needed.

## 4. Fitts-style target confidence

Keep targets large enough and spaced enough that interaction does not demand precision. Visible glyph can remain 20–24pt while hit target is 44pt iOS / 48dp Android.

## 5. Progressive disclosure

Do not show customs, parcel dimensions, printer troubleshooting, compensation limits and payout edge cases on every order. Show them when state/category/shipping method makes them relevant.

## 6. Transaction anxiety reduction

Marketplace payments and shipping create uncertainty:
- “Did payment go through?”
- “Can I still cancel?”
- “Did the seller ship?”
- “Do I lose protection if I use another carrier?”
- “When do I get paid?”

Flagship copy answers the uncertainty *before* the user searches for it.

## 7. Goal-gradient / visible progress

A clear progress model makes unfinished tasks feel tractable. The seller’s progress should be operational:
`Sold → Label ready → Handed to carrier → Delivered → Payout`

Do not show stages the user cannot affect as equally strong task steps.

## 8. Perceived control

Users trust a system more when:
- they can see current truth;
- they know what is irreversible;
- they can recover from mistakes;
- destructive actions are separated;
- the system does not silently make high-consequence assumptions.

## 9. Error prevention before error messaging

Examples:
- lock the buyer-selected carrier rather than warning after seller chooses the wrong one;
- validate parcel profile before label generation;
- show destination problem before generating label;
- do not permit integrated order to be manually marked shipped if first-scan automation exists;
- prevent double mutation with idempotency and disabled state.

## 10. Consistency as a trust signal

If Orders says “Dispatch”, Order Detail says “Mark shipped” and Chat says “Send”, users have to infer whether these are the same operation.

**Rule:** action vocabulary is a product API. Centralise it.

## 11. Minimalism is hierarchy, not emptiness

“Chic/minimal/classy” means:
- high signal-to-chrome ratio;
- fewer containers;
- disciplined type;
- consistent edge geometry;
- quiet separators;
- one accent;
- media and primary content dominate;
- exact microcopy.

It does **not** mean removing essential deadlines, costs, service names or consequences.

## 12. Trust through specificity

Compare:
- “Shipping details” → vague.
- “Evri ParcelShop · buyer paid £3.49 · ship by Tue” → actionable.

Specificity reduces the need for visual decoration because the information itself creates confidence.
