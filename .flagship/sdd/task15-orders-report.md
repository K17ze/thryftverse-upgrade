# Task 15 — Orders screen: actual order state + next action

**Status:** DONE
**Screen:** `frontend/src/screens/MyOrdersScreen.tsx` (the Orders surface — there is no `OrderHistoryScreen.tsx`; `SyndicateOrderHistoryScreen.tsx` is the co-own trade ledger, out of scope)
**Row component:** `frontend/src/components/orders/OrderLedgerRow.tsx`
**tsc:** `node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → exit 0, zero diagnostics

---

## 1. Case study — what the screen already did

The surface was already a flat ledger (no cards): `ScreenHeader` + filter icon → `OrdersTabRail` (All/Buying/Selling/Completed) → needs-action banner → search field → date-grouped `FlashList` of `OrderLedgerRow`s separated by hairlines. States covered: skeleton loading, per-tab/per-filter/per-search empty states, full error with retry, pagination error footer.

Per-row composition (before): thumb → status badge pill + `#orderNo` → title → `Bought/Sold · @user · date` + total → tracking line (only when `trackingNumber` present) → ship-by deadline badge (seller/paid) → next-action hint → **decorative 3-dot paid→shipped→delivered progress rail** → chevron.

### Gaps found against the brief

| Requirement | Before |
|---|---|
| Actual order state prominent | Status badge existed — kept |
| Obvious next action | Hint existed but gated by `!terminal` → **delivered orders showed nothing**, even though "Check your item" is the real next step. Also could print "Track your parcel" when the order had **no tracking number** — untruthful |
| Carrier evidence | Tracking number + provider only. `serviceName` was mapped into the view model but **never rendered**; `fulfilmentSnapshot.etaMinDays/MaxDays` and `deliveredAt` were dropped on the floor |
| Support entry | **Absent** — the only route was via Order Detail |
| Partial state | **Silent** — a failed pull-to-refresh set `loadError`, which only rendered when `orders.length === 0`. With cached data the failure was swallowed |
| Decorative timeline | The 3-dot progress rail duplicated the status badge verbatim ("Shipped" badge + "Shipped" dots) |

## 2. Changes made

### `OrderLedgerRow.tsx`

- **View model extended** (`OrderViewModel`): `deliveredAt`, `etaWindow`, `nextActionLabel` — all optional, no other consumers exist (row is used only by `MyOrdersScreen`).
- **Next action is now capability-resolved at the parent** and rendered whenever present — delivered buyer orders now show "Check your item" instead of nothing. Removed `getNextActionHint` import; the row never reinterprets status strings.
- **Carrier evidence line rebuilt** with truthful priority:
  - `delivered`/`completed` + `deliveredAt` → `checkmark-circle-outline` "Delivered 12 Sep · ROYALMAIL"
  - in-flight → `car-outline` "ROYALMAIL · AB123… · Est. 2–3 days" (ETA from the immutable fulfilment snapshot)
  - no tracking yet → purchased service name + ETA window ("Royal Mail Tracked 48 · Est. 2–3 days")
  - cancelled/refunded/returned → none (status badge is the whole story)
- **Removed the decorative progress-dot rail** (~35 lines JSX + 4 style blocks) — it restated the status badge and was the "decorative timeline" the report warns about.
- Accessibility label now speaks the evidence line + next action.

### `MyOrdersScreen.tsx`

- **List now consumes `resolveCapabilities`** (the canonical P0-3 projection — same resolver as Order Detail) instead of letting the row recompute hints. `hasTracking` is derived from `trackingNumber != null`; `fulfilmentSnapshot` is passed through so `etaWindow`/`serviceName` resolve centrally.
- **Truthfulness guard:** `nextActionLabel` is suppressed when there is no primary action (e.g. seller-delivered "Order complete" is passive, not an action) and when an in-transit order has no tracking (never promise tracking that doesn't exist).
- **Partial state added:** when a refresh fails but cached orders are visible, a hairline-separated banner now reads "Couldn't refresh — showing saved orders · Retry" (suppressed while offline, where `OfflineBanner` already covers it).
- **Support entry added:** a quiet footer row "Get help with an order" (help-buoy glyph + hairline top rule, muted meta type) → `HelpSupport`. Present only when orders exist; per-order support remains on Order Detail → `OrderSupport` (which requires `orderId`).

### Preserved

Navigation (`OrderDetail`, `Login`, `MainTabs`, `Sell`), haptics (`selection` on tabs, `tap` on new actions), analytics-free surface, FlashList v2 memoization pattern, `OrdersTabRail` spring indicator, all filter/search/pagination logic.

## 3. State coverage after the change

| State | Handling |
|---|---|
| Loading | `OrderRowSkeleton` ×6 |
| Empty | Per-tab copy ("No orders yet" / "No purchases yet" / "No sales yet") + per-search/per-filter variants, each with a CTA |
| Error (initial) | Offline-aware error block + Retry |
| **Partial (new)** | Stale-data banner on failed refresh with cached rows; pagination error footer with inline Retry |
| Offline with data | `OfflineBanner` (existing) |

## 4. Anti-AI check

Flat canvas retained — hairlines, not cards. One pill per row (the status badge — the dominant signal); the deadline badge only appears for genuinely urgent seller work. No duplicated state: the dots that restated the badge are gone. Support is one muted row at the foot, not a per-row button farm.

## 5. Concerns / notes

- **Completed-order hint:** the list payload carries no `hasReview`/`hasOpenResolution` flags, so a `completed` buyer order still resolves `inspect` → "Check your item". This is the canonical resolver's output given the available contract; the detail screen (which has the flags) remains the authority. If a per-order hint for fully-closed orders is unwanted, the list API would need a review flag — a backend contract change, flagged but not made.
- **ETA is a window, not a date:** `CommerceUserOrder` exposes `etaMinDays/etaMaxDays` ("2–3 days"), not an estimated delivery date — rendered as "Est. 2–3 days". An absolute ETA date would need a server field.
- `OrderSupport` (per-order issue flow) still requires `orderId`; the list-level entry routes to `HelpSupport` intentionally.
