# Known Gaps — Co-Own Surfaces

This file documents backend gaps identified during the Co-Own surface-to-system
review. The frontend surfaces these limitations to the user rather than
implying functionality that does not exist.

## U51: Co-Own Price Alert Evaluator / Delivery Consumer

**Status:** Not implemented.

**What exists:**
- CRUD endpoints for Co-Own price alerts (`GET/POST/DELETE/PATCH /co-own/price-alerts`).
- The `coown_price_alerts` table has `triggered_at` and `active` columns.
- A listing price alert evaluator exists (`api/src/routes/priceAlerts.ts`) that
  evaluates listing-level alerts on price events. This is **not** wired to
  Co-Own trade events.

**What is missing:**
- An evaluator/consumer that watches Co-Own trade settlement events and
  checks active alerts against the last trade price.
- Crossing-direction logic (above/below) with deduplication.
- Delivery outcome recording (notification sent, failed, suppressed).
- Triggered history backed by execution events (which trade triggered the
  alert, at what price, and when).

**Frontend mitigation:**
- The price alerts screen shows "Alert monitoring is not yet active" so the
  user understands alerts are saved but will not trigger.
- Each alert row displays its trigger basis (last trade price) and crossing
  direction so the user can verify the alert semantics.

**Implementation path:**
- Identify the existing external owner or implement an idempotent event
  consumer that subscribes to Co-Own trade settlement events.
- For each settled trade, evaluate active alerts for the asset.
- Record the crossing, deduplicate (one trigger per crossing), deliver the
  notification, and store the execution event reference.

## U53: DRIP Execution Consumer

**Status:** Not implemented.

**What exists:**
- DRIP enrollment endpoints (`GET /co-own/drip/enrollments`, `POST /co-own/drip/enroll`).
- The enrollment toggle persists the user's preference per asset.

**What is missing:**
- An execution consumer that watches settled distribution events and, for
  enrolled users, automatically reinvests the distribution into additional
  units of the same asset.
- The flow: settled distribution → permitted purchase (or explicit
  retained-cash outcome) → receipt.
- Idempotent replay (one effect per distribution event).

**Frontend mitigation:**
- When DRIP is enabled for any asset, the distribution history screen shows:
  "Automatic reinvestment is not yet processed automatically. Distributions
  will be paid as cash until this feature is active."
- The DRIP setting is preserved (not removed) so the user's intent is
  retained for when the consumer is implemented.

**Implementation path:**
- Identify the existing external owner or implement an idempotent event
  consumer that subscribes to settled distribution events.
- For each settled distribution, check the recipient's DRIP enrollment.
- If enrolled and the purchase is permitted (market open, sufficient
  liquidity, no restrictions), execute the reinvestment purchase.
- If the purchase is not permitted, record an explicit retained-cash
  outcome.
- Emit a receipt event for the reinvestment (or retained-cash) so the
  user has a durable record.
