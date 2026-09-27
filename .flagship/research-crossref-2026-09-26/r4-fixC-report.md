# r4-fixC — Seller-away gate, holiday-mode discoverability, toast copy, fixture carrier fabrication

Workstream: buyer-side seller-away gate (live mode), holiday-mode settings placement,
toast register, fixture carrier/service fabrication. All four findings verified against
contracts before fixing.

## 1. [HIGH] Buyer-side seller-away gate unreachable in live mode — FIXED

**Contract verification:**
- `backend/api/src/routes/sellers.ts:62` — `GET /sellers/:sellerId` is a **public** route
  (`request.authUser?.userId ?? null`); no auth required for the PDP buyer read.
- `backend/api/src/routes/sellers.ts:274-288` — publishes `holidayMode` (effective-away
  via `isEffectivelyAway` — a lapsed `holidayMode_until` never reads as still-away),
  `awayMessage` (gated on the same predicate), `holidayModeUntil`, and
  `reachState` (`users.reach_state ?? 'normal'`).
- `web/src/lib/contracts/domain.ts:39-42` — `ListingSeller` already declares
  `holidayMode?: boolean` and `reachState?: 'normal' | 'limited' | 'suspended' | null`,
  but `normalizeSeller` never mapped them and `GET /listings/:id` doesn't emit them —
  so `capabilities.ts`'s `listing.seller?.holidayMode` gate was dead code in live mode.
- Native parity confirmed: `frontend/src/platform/product/useListingQueries.ts:143`
  (`useSellerTrust` → `GET /sellers/:id`) feeds
  `frontend/src/components/commerce/detail/CommerceActionDock.tsx:161,205` — suspended
  then blocked then away, each replacing purchase affordances with a factual state dock.

**Changes:**
- **NEW** `web/src/lib/api/services/sellers.ts` — `SellerTrustSummary` type +
  `fetchSellerTrustSummary(sellerId, signal)` → `GET /sellers/:id`, returns `null` when
  no seller object. Documented: a null/failed read must never be treated as "not away".
  Deliberately *not* re-exported through `services/index.ts` (outside ownership);
  consumers import the module directly, matching the established
  `import * as commerceService from '@/lib/api/services/commerce'` pattern.
- `web/src/lib/hooks/pdp-queries.ts` — added `useSellerTrustSummary(sellerId)`:
  `['seller-trust', id]` key, `enabled: DATA_MODE === 'live' && !!sellerId`,
  `staleTime: 60s`. Fixture mode intentionally skips the fetch — the away projection
  (`fixtures-seller.ts:791 applyAwayStateToFixtures`) already writes
  `listing.seller.holidayMode`, which the gate reads directly. Fixture path preserved.
- `web/src/lib/commerce/capabilities.ts` —
  - New exported `SellerAvailability` interface (holidayMode / reachState /
    holidayModeUntil / awayMessage).
  - `listingCapabilities(listing, viewerId, sellerAvailability?)` — additive optional
    third param. When provided its fields **win** over `listing.seller` (the endpoint
    resolves effective-away server-side); when null/undefined (loading/failed) the
    listing's own fields apply — fail-open read, backend 409 remains the enforcer,
    same posture as native.
  - `listingStateCopy(caps, seller?)` — optional second param; the seller-away subtitle
    now shows `Purchases resume when they return — back {date}` when a real published
    `holidayModeUntil` exists, else the seller's `awayMessage` verbatim, else the
    factual default (native ordering: date > note > default).
- `web/src/components/pdp/BuyPanel.tsx` — calls `useSellerTrustSummary(listing.sellerId)`
  and passes the result into both `listingCapabilities` and `listingStateCopy`. An away
  or suspended seller now renders the factual state dock (badge + subtitle + "Browse
  similar items" + quiet "Message seller") instead of live Buy/Offer CTAs.
- `web/src/lib/api/mappers.ts` — `normalizeSeller` now maps `holidayMode` (boolean only)
  and `reachState` (whitelisted vocabulary only, else `undefined`) so any payload that
  does carry them is honoured.

**Residual gap (outside ownership, flagged for the parent):**
`web/src/components/pdp/PdpBuyDock.tsx:47` and `web/src/app/checkout/page.tsx:109` call
`listingCapabilities(listing, user?.id)` without the new third param, so the mobile-web
buy dock and the `?item=` checkout guard still don't see live-mode seller-away. The new
optional param + `useSellerTrustSummary` hook make this a two-line follow-up for
whichever workstream owns those files; the backend still 409s, so this is a UX gap,
not a correctness hole.

## 2. [MEDIUM] Holiday-mode control location — FIXED (deep link)

- `web/src/components/settings/PrivacyView.tsx` — added a **"Shop activity"**
  `SettingsSection` (between "Profile" and "Blocked users", mirroring native's
  Settings → Shop activity placement inside privacy-style settings) containing a
  `SettingsRow` "Holiday mode" deep-linking to `/seller-hub/settings`, where the real
  control + mutation live. The row's trailing value reads the **real** away state via
  the existing `useShopAway()` hook (`/users/me/preferences` live, device store in
  demo) and shows "On" only when actually on — no duplicated mutation wiring.
- `web/src/components/settings/settingsDestinations.ts` — added index entry
  `holiday-mode` (section "Buying & selling", icon `bag`, keywords
  `away pause shop vacation sellers hide listings shop activity`, route
  `/seller-hub/settings`). Note: the file lives at
  `src/components/settings/settingsDestinations.ts`, not `src/lib/settings/` as the
  brief stated — no `lib/settings` directory exists.

## 3. [LOW] Toast copy drift — FIXED

- `web/src/app/seller-hub/settings/page.tsx:101` —
  `'Welcome back — your shop is live again'` →
  `'Holiday mode off — your listings are visible again'`. Factual state copy, matching
  the on-toggle grammar (`'Holiday mode on — your shop is paused for buyers'`).

## 4. [CHECK-THEN-FIX] Fixture carrier fabrication — FIXED (3 sites)

Confirmed `web/src/lib/commerce/offerAcceptance.ts:90-91` already writes
`carrier: null, service: null` (prior fix intact). Three remaining fabrications removed
from `web/src/lib/data/fixtures-commerce.ts`:

- `orderDetailFor` (~334): derived fallback `'Royal Mail' / 'Tracked 48'` → `null / null`
  for orders with no authored fulfilment row.
- `recordOrder` (~434): `choice?.carrierId ?? 'Royal Mail'` → `?? null` (and
  `serviceName` likewise). A real carrier/service is still recorded when the buyer
  picked a delivery quote at checkout — only the unchosen/seller-covered case stops
  inventing one.
- `commerceOrderDetailFor` (~1052): `enr.carrier ?? base?.carrier ?? 'Royal Mail'` →
  `?? null` (and service likewise). Authored `ORDER_DETAILS`/`ORDER_ENRICHMENT`
  carrier values (ord-1042, ord-1038, ord-1021, ord-1050, ord-1051) still win — real
  sold/shipped history kept.

**Render safety on null — verified, no crash, no em-dash artifacts needed:**
- `web/src/app/orders/[id]/page.tsx:587` — `detail.carrier ? ... : ''` guard.
- `web/src/components/orders/OrderReceipt.tsx:283-284` — `Service`/`Carrier` rows
  render only when non-null; `hasDeliveryFacts` (line 94) already tolerates all-null.
- `web/src/components/orders/OrderTrackingSection.tsx:18-19` — props typed
  `carrier: string | null`, joins with `.filter(Boolean)`.

## Validation

- `npx tsc --noEmit` (web/): **clean on all touched files**. Two pre-existing errors in
  `src/components/inbox/ChatPanel.tsx` (`receiptsEnabled` redeclare, lines 214/664) —
  outside ownership, observed concurrently, not introduced by this change.
- `npx eslint` on all nine touched files: **clean, zero warnings**.

## Files changed

| File | Change |
|---|---|
| `web/src/lib/api/services/sellers.ts` | NEW — `SellerTrustSummary`, `fetchSellerTrustSummary` |
| `web/src/lib/hooks/pdp-queries.ts` | Added `useSellerTrustSummary` |
| `web/src/lib/commerce/capabilities.ts` | `SellerAvailability` param on `listingCapabilities`; `seller?` param on `listingStateCopy` with back-date/away-note subtitle |
| `web/src/components/pdp/BuyPanel.tsx` | Wired trust query into caps + state copy (seller-away row only) |
| `web/src/lib/api/mappers.ts` | `normalizeSeller` maps `holidayMode`/`reachState` |
| `web/src/app/seller-hub/settings/page.tsx` | Toast copy → factual |
| `web/src/components/settings/PrivacyView.tsx` | "Shop activity" section + Holiday mode deep-link row with real On value |
| `web/src/components/settings/settingsDestinations.ts` | `holiday-mode` search entry |
| `web/src/lib/data/fixtures-commerce.ts` | Three `Royal Mail`/`Tracked 48` fabrications → `null` |
