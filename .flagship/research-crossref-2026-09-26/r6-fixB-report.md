# R6-FixB — Live checkout & bag truth repair (web)

Scope: remove fixture-seeded instruments and fixture-only listing resolution
from the live checkout and bag flows, without touching PDP surfaces.

## Root causes fixed

1. **Fixture instruments in live checkout.** `useSavedAddresses()` /
   `useSavedPaymentMethods()` unconditionally merged fixture seeds
   (`ADDRESSES`, `PAYMENT_METHODS`) plus localStorage extras. In live mode the
   checkout displayed "Visa •••• 4521"-style fixture rows, and order submission
   ran `Number(addressId) || undefined` / `Number(paymentId) || undefined` —
   string fixture/local ids became `NaN`, which `||` silently dropped, so
   `POST /orders` went out **without the instruments the UI displayed**.

2. **Fixture-only listing resolution.** `bag/page.tsx` and the checkout bag
   branch resolved bag entries through `listingById()` (fixture catalogue
   only). Live bag ids never resolved, so live bags rendered empty/wrong rows.

3. **Quote/order contract mismatch.** The live order path sent a fixture
   `shippingQuoteId` only when `quote.live` was set (never true for catalogue
   quotes → field omitted) and never sent `shippingCarrierId`, which the order
   route requires alongside a persisted quote (`SHIPPING_QUOTE_INVALID`).

## Files changed

### New files

- `web/src/lib/api/services/checkout.ts` — checkout-scoped live service:
  - `fetchLiveAddresses(userId, signal)` — `GET /users/:id/addresses`
    (`{ok, items}`; numeric ids mapped to the UI's string `Address.id`).
  - `createLiveAddress(userId, input)` — `POST /users/:id/addresses`
    (`{ok, item}`, 201; server promotes the first address to default).
  - `fetchLivePaymentMethods(signal)` — `GET /v2/payments/methods`
    (Stripe-projected rows; numeric `id` is the `paymentMethodId` POST
    /orders accepts). No create/delete — the legacy
    `POST /users/:id/payment-methods` is permanently `410
    TOKENISED_PAYMENT_METHOD_REQUIRED` and card creation is provider-hosted
    (Stripe SetupIntent), which web has no rail for.
  - `fetchCheckoutShippingQuote(input)` — `POST /shipping/quote` reusing the
    commerce `ShippingQuoteResponse` type, with `preferredCarrierId` added to
    the input (the route sorts that carrier's quotes first — needed to honour
    the buyer's pick when a quote is fetched at pay time).
  - `createCheckoutOrder(input)` — `POST /orders` with the full field set
    including `shippingCarrierId` (the route validates the persisted quote's
    carrier against the payload).

- `web/src/lib/store/useBagListings.ts` — mode-aware bag resolver:
  fixture resolves via `listingById()` (unchanged); live batch-fetches each
  bag id via `fetchListingById()` (`GET /listings/:id`, the same service the
  PDP uses) with a position-preserving `Promise.allSettled`. Unresolvable
  live ids are dropped and counted (`unresolvedCount`); sold listings are
  excluded and counted (`soldOutCount`); `isLoading` gates the surface.

- `web/src/components/checkout/useCheckoutInstruments.ts` — unified
  instrument rail for checkout: fixture mode returns the local overlay store
  unchanged; live mode reads `fetchLiveAddresses` + `fetchLivePaymentMethods`
  as react-query reads (keyed per user), exposes `isLoading`, per-read error
  flags, `refetchInstruments`, and a live `addAddress` that POSTs to the real
  route, invalidates the read, and resolves with the server row.
  `addPaymentMethod` throws in live mode (no client-side card rail exists).

### Edited files

- `web/src/lib/store/userPaymentData.ts` — `useSavedAddresses()` /
  `useSavedPaymentMethods()` now resolve to **empty lists** when
  `DATA_MODE === 'live'`: fixture seeds and localStorage extras can never
  reach a live picker (their ids are non-numeric local strings no backend
  route accepts). Fixture behaviour is untouched. Write actions remain
  fixture-only and are documented as such in the file header.

- `web/src/app/bag/page.tsx` — resolves bag entries through `useBagListings`.
  Live mode shows the skeleton while fetches are in flight, renders resolved
  real listings, and reports dropped rows honestly: a muted line naming how
  many items sold out / couldn't be loaded, and a "Nothing left in your bag"
  empty state when everything pruned. Fixture path identical to before.

- `web/src/app/checkout/page.tsx` —
  - Instruments come from `useCheckoutInstruments`; seeding waits for the
    live reads (`instrumentsReady`) instead of hydrating the persisted store.
  - Bag checkout consumes `useBagListings(itemId ? [] : bag)` — same live
    resolution as /bag.
  - Live delivery quotes are fetched **per item** via
    `POST /shipping/quote` bound to the selected server `addressId` (a quote
    binds one listing; parcels can't share across items). The parcel picker
    displays the first item's quote list; the ledger re-resolves the priced
    quote per seller against the fresh lists (`effectiveDelivery`) so the
    displayed shipping is always a bound quote's price.
  - `canPay` additionally requires `liveQuotesReady`: a real selected address
    and a server-bound (`live && quoteId`) quote on every buyer-paid parcel.
    A fallback catalogue quote disables Pay rather than lying on the wire;
    a warning note with a Retry affordance appears under DeliveryPicker.
  - `handlePay` live path: requires a finite numeric `addressId` (throws
    otherwise — no more `Number(id) || undefined` NaN-stripping), sends
    `paymentMethodId` only when the selected method's id is numeric, and for
    each item resolves the binding quote — the prefetched quote matching the
    chosen carrier, else a fresh `POST /shipping/quote` with
    `preferredCarrierId` — then posts `shippingQuoteId` +
    `shippingCarrierId` together via `createCheckoutOrder`. Orders remain one
    `POST /orders` per item (backend contract), each with its own
    idempotency key, followed by the existing payment-intent settlement flow.
  - `AddAddressSheet.onSave` is async: live saves POST to the server and
    surface a failure line under the picker instead of pretending to persist.
  - Per-read error notes (addresses / payment methods) with a "Try again"
    refetch — a failed live read shows an honest retry, not an empty rail.

- `web/src/components/checkout/AddPaymentSheets.tsx` — `AddCardSheet` renders
  an honest provider-tokenisation state in live mode ("cards are added
  through secure tokenisation — add a card in the app and it appears here"),
  instead of a raw-PAN form that would mint an unchargeable local row.
  Fixture mode keeps the existing local card sim. `AddAddressSheet`
  unchanged.

## Backend contracts confirmed (backend/api/src/index.ts)

- `GET /users/:userId/addresses` → `{ok, items[{id:number, userId, name,
  street, city, postcode, isDefault, createdAt, updatedAt}]}` (auth-scoped).
- `POST /users/:userId/addresses` → `{ok, item}` 201; body
  `{name, street, city, postcode, isDefault}`; first address auto-defaults.
- `DELETE /users/:userId/addresses/:addressId` exists (not wired here —
  settings surfaces are out of scope).
- `GET /v2/payments/methods` → provider-backed tokenised list; numeric row id
  is the `paymentMethodId` `/orders` accepts. Legacy
  `POST /users/:id/payment-methods` → `410` permanently.
- `POST /orders` — `addressId`/`paymentMethodId` must be positive integers;
  `shippingQuoteId` must be a persisted quote bound to the same listing,
  seller, address **and** `shippingCarrierId`; `walletDebitGbp > 0` is
  rejected (no split tender — the wallet rail is `paymentGatewayId:
  'oneze_internal'`, full-tender only, matching the existing implementation).
- `POST /shipping/quote` — returns persisted `quotes[]` with `quoteId`,
  `carrierId`, `label`, `priceFromGbp`, `eta*`, `tracking`, `live`, `source`;
  accepts `addressId`, `destinationPostcode`, `preferredCarrierId`,
  `declaredValueGbp`.

## Verification

- `cd web && npx tsc --noEmit` — clean (0 errors).
- `npx eslint` on all owned/new files — clean (0 errors, 0 warnings).

## Cross-cutting issues outside ownership (flagged, not changed)

1. **Other consumers of `useSavedAddresses`/`useSavedPaymentMethods` now see
   empty lists in live mode** — `app/orders/[id]/page.tsx`,
   `orders/[id]/receipt/page.tsx`, `settings/AddressesView.tsx`,
   `settings/PaymentMethodsView.tsx`, `settings/PostageView.tsx`. That is the
   *correct* direction (they previously rendered fixture instruments to live
   users), but those surfaces now need their own live reads —
   `fetchLiveAddresses` / `fetchLivePaymentMethods` are exported and ready to
   reuse; management mutations (edit/remove/set-default against the server
   rows) remain unimplemented for web.
2. **No web card-add rail.** Live users can pay with existing tokenised
   methods or the 1ZE wallet only; card collection needs a Stripe
   SetupIntent/hosted-element surface — a deliberate product decision needed
   (the sheet currently points users to the app honestly).
3. **Order detail's instrument display.** If order detail surfaces resolve
   `addressId`/`paymentMethodId` back through the local store, live orders
   will show blank instrument rows until those surfaces read server data
   (same hook family, outside this slice).
4. **`fetchShippingQuote` in `commerce.ts` lacks `preferredCarrierId` and
   `createCheckoutOrder` lacks nothing vs `createOrder` missing
   `shippingCarrierId`** — left untouched per ownership; the checkout service
   carries the fuller contract. A follow-up could fold `shippingCarrierId`
   into `commerceService.createOrder` for other callers.
5. **Live payment intent UX** is unchanged from the existing web
   implementation (create intent → poll `waitForPaymentSettlement`; a card
   intent that needs SCA/action lands on the order page as pending — the
   truthful state, but Stripe confirmation UX remains a web gap).
