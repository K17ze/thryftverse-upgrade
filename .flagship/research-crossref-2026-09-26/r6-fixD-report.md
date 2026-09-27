# r6-fixD — saved-instrument consumers truthful in live mode (P0)

**Workstream:** R6-D — make every remaining consumer of
`useSavedAddresses()`/`useSavedPaymentMethods()` truthful after the store's
live-mode empty-out (fixture seeds + localStorage extras no longer reach
live users).
**Scope owned:** `web/src/app/orders/[id]/page.tsx`,
`web/src/app/orders/[id]/receipt/page.tsx`,
`web/src/components/settings/AddressesView.tsx`,
`web/src/components/settings/PaymentMethodsView.tsx`,
`web/src/components/settings/PostageView.tsx`,
`web/src/components/checkout/AddPaymentSheets.tsx` (the add/edit sheet the
views import), **new** `web/src/lib/hooks/instrument-queries.ts`.
**Status:** FIXED — `npx tsc --noEmit` clean repo-wide; `npx eslint` clean
(0 problems) on all seven files. `userPaymentData.ts`, `queries.ts` and all
shared service files untouched.

## Backend truth established (backend/api/src)

- `GET /users/:userId/addresses` — `index.ts:24946`
- `POST /users/:userId/addresses` — `index.ts:24987` (auto-defaults the
  first row; honours `isDefault`)
- `DELETE /users/:userId/addresses/:addressId` — `index.ts:25077`
  (re-promotes the freshest remaining row to default itself)
- **No address PATCH / PUT / set-default route exists** — verified by
  grep across `backend/api/src` (`app.(patch|put|delete)` on addresses:
  only the DELETE above). Live edit and re-default are therefore honestly
  omitted; create-time `isDefault` is the only live default write.
- `GET /v2/payments/methods` — `routes/v2.ts:135` (Stripe-projected rail;
  each item carries numeric `id` + `providerPaymentMethodId` `pm_*`)
- `DELETE /v2/payments/methods/:providerMethodId` — `v2.ts:177` (detaches
  at Stripe, flips local projection to `detached`, re-syncs → a new
  default is promoted server-side)
- `PATCH /v2/payments/methods/:providerMethodId/default` — `v2.ts:248`
- Legacy `/users/:id/payment-methods` POST/PATCH/DELETE are all
  permanently **410 TOKENISED_PAYMENT_METHOD_REQUIRED**
  (`index.ts:25262`, `25360`, `25454`) — no web card-add rail.
- `GET /orders/:orderId` emits `addressId` + `paymentMethodId`
  (`index.ts:34671-72`) — the per-order instrument refs. The mapped
  `CommerceOrder` contract drops them; live `fulfilmentSnapshot.
  destinationSummary` is always `null` on both list and detail
  projections, so the order's own refs are the only truthful destination.

## New file — `web/src/lib/hooks/instrument-queries.ts`

One module, three mode-aware hooks; all live reads reuse
`lib/api/services/checkout.ts` (`fetchLiveAddresses`,
`createLiveAddress`, `fetchLivePaymentMethods`) and share
useCheckoutInstruments' query keys (`['checkout','addresses',userId]`,
`['checkout','payment-methods',userId]`) so settings, checkout and order
pages share one cache and mutations invalidate everywhere.

- `useManagedAddresses()` → `{ mode, addresses, defaultAddress,
  isLoading, isError, refetch, updateAddress, setDefaultAddress,
  addAddress, removeAddress }`. Fixture: pure `useSavedAddresses`
  passthrough (sync writes wrapped in resolved promises — byte-identical
  behaviour). Live: server list; `addAddress` POSTs and invalidates so
  the rail re-reads the server-resolved default; `removeAddress` DELETEs,
  invalidates, and reports `promotedToDefault` **only when the refreshed
  list actually shows a new default**. `updateAddress`/`setDefaultAddress`
  are `null` in live — no route exists, controls omit.
- `useManagedPaymentMethods()` → same shape plus `useBalanceFirst`
  (device-local pref, honest in both modes) and `providerUnavailable`.
  Live `removePaymentMethod`/`setDefaultPaymentMethod` resolve the row's
  `pm_*` provider ref via a **fresh** `GET /v2/payments/methods` read
  (verify-then-act: the mapped `PaymentMethod` drops the ref; a stale row
  answers not-found instead of detaching the wrong instrument), then hit
  the v2 DELETE/PATCH routes and invalidate. `addPaymentMethod` is `null`
  in live.
- `useOrderInstrumentFacts(orderId, isBuyer, { resolvePaymentMethod })`
  → `{ deliveryAddress, paymentMethod, isLoading }`. Live only: reads
  `GET /orders/:id` raw for `addressId`/`paymentMethodId`, then matches
  against the shared live rails. Buyer-gated (seller views resolve
  nothing — the instruments belong to the buyer). Unresolvable refs
  (wallet-paid, detached card, deleted address) → `null` → row omitted.
  Fixture mode returns nulls; callers keep the store defaults.

## Changes per file

### `web/src/components/settings/AddressesView.tsx`
- Consumes `useManagedAddresses` instead of `useSavedAddresses`.
- Live: real server rows; remove wires the DELETE route (confirm sheet
  gains `busy`); Edit button omitted (`updateAddress === null` — no PATCH
  exists). Add sheet POSTs via `createLiveAddress`; its "set as default"
  toggle is honoured by the create payload.
- Live save returns the promise to the sheet → sheet stays open + busy
  until the server confirms; failure keeps the form and toasts the
  server message. Fixture path returns void → synchronous close,
  identical to before.
- New live loading gate (`isLoading`) and honest error EmptyState with
  retry (`isError` → `refetch`).

### `web/src/components/checkout/AddPaymentSheets.tsx`
- `AddAddressSheet.onSave` widened `void → void | Promise<void>`; a
  returned promise holds the sheet open with a `Saving…` disabled state
  and only closes on success (rejection keeps the form). Sync callers
  (fixture, checkout page) close synchronously — byte-identical.
- `AddCardSheet` needed no change — it already self-gates in live into
  the "cards are added through secure tokenisation / add a card in the
  app" state (`DATA_MODE === 'live'` branch, lines ~241-264).

### `web/src/components/settings/PaymentMethodsView.tsx`
- Consumes `useManagedPaymentMethods`. Live list is the Stripe-projected
  rail; "Set default" and trash are real (v2 PATCH default + v2 DELETE
  via resolved `pm_*` refs).
- Live errors render inline (Preferences toggle stays mounted):
  `PAYMENT_PROVIDER_UNAVAILABLE` (503) → "Cards are managed in the app"
  state, no retry loop; other failures → retry.
- Live empty state says the honest thing ("cards are added through
  secure tokenisation in the ThryftVerse app — anything you save appears
  here"); "Add card" opens the self-gating sheet's tokenisation notice.
  No localStorage card form is reachable in live.

### `web/src/components/settings/PostageView.tsx`
- "Saved addresses" count now reads `useManagedAddresses` — live shows
  the real server count (skeleton gate extended by `addressesLoading`),
  fixture identical.

### `web/src/app/orders/[id]/page.tsx` + `receipt/page.tsx`
- Purchase-summary rows no longer read local defaults in live.
  `useOrderInstrumentFacts` resolves the order's own
  `addressId`/`paymentMethodId` against the live rails; unresolvable →
  row omitted (never a fixture/local stand-in). Receipt passes
  `{ resolvePaymentMethod: false }` — it renders no payment row, so the
  methods rail (which triggers a server-side Stripe sync per uncached
  GET) isn't fetched needlessly.
- Fixture mode renders `defaultAddress`/`defaultMethod` exactly as
  before.

## Consumers checked (requirement 2)

Grep across `web/src` for `useSavedAddresses`/`useSavedPaymentMethods`/
`useUserPaymentData`:

- `web/src/components/checkout/useCheckoutInstruments.ts` (lines 24,
  72-74) — **outside ownership, already correct**: it reads the fixture
  hooks unconditionally (rules-of-hooks) but only consumes their values
  in the fixture branch; live mode returns the server queries untouched.
  No action needed — flagged for the main agent's awareness.
- `web/src/lib/store/userPaymentData.ts` — the store itself (not owned).
- No other consumers exist.

## Honest omissions / surfaced gaps

- **No address edit or re-default in live** — no backend route exists.
  Adding `PATCH /users/:id/addresses/:id` (+ `/default`) server-side is
  the follow-up if parity with fixture/mobile editing is wanted.
- Live order pages cannot show a "Deliver to" line for sellers —
  `destinationSummary` is never persisted server-side (both projections
  emit `null`). Buyer views resolve the real address via `addressId`.
- Wallet-paid (`oneze_internal`) live orders carry no `paymentMethodId`
  → the "Paid with" row omits rather than inventing a wallet label.
- Live guests: instrument queries are disabled → empty states + the
  tokenisation notice; an add attempt toasts "Sign in to save…" from the
  hook's auth guard.

## Verify

```
cd web
npx tsc --noEmit   # exit 0
npx eslint <7 owned files>   # 0 problems
```
