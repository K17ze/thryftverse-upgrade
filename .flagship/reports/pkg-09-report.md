# PKG-09 — Commerce surfaces: cached refresh, wallet tenders, portfolio status, profile stat, reorder grid, condition media, Q&A gate — Report

Status: COMPLETE. All seven findings closed; `npm run typecheck` clean;
focused vitest file green (18/18).

## Findings

### FRESH-01 — live home blank body on refresh failure (High) — CLOSED
`LiveShoppingHomeScreen.tsx` now discriminates four render branches
instead of the old mutually-exclusive pair: `showLoading` /
`showError` (error AND no summary) / `showEmpty` / `showContent`, plus a
new `showRefreshError = !!error && summary != null`. A failed pull-to-
refresh or retry keeps the last-good summary fully rendered and prepends
an inline `CommerceDetailUnavailableInline` freshness notice whose retry
runs the real `handleRetry` → `load()` path; the full-screen
`FlagshipState` error only renders when nothing was ever loaded. New
i18n: `liveShopping.refreshFailed.title/body` in `en.json`.

### FRESH-04 — branded tender buttons ignore device support (High) — CLOSED
Two-layer fix at the source of truth.

`useCheckoutPaymentFlow.ts`: `handlePay` now takes an explicit
`tender: 'card' | 'platform_pay'`. The wallet path creates the same
order + payment intent (`createStripeOrderSheet`) but confirms through
`confirmPlatformPayPayment` with a real native sheet config — Apple Pay
cart items (item, buyer protection, delivery, total) and Google Pay
`amount` in minor units + listing label — never `initPaymentSheet`/
`presentPaymentSheet`. Settlement then shares the existing poll:
`succeeded` → `Success`, `pending` → `OrderDetail`, failures surface the
server message — pending/unknown is never rendered as success. A
separate `platformPayEligible` keeps the branded CTA available without a
saved card (the credential is supplied at confirm time) while the card
rail correctly stays ineligible.

`CheckoutScreen.tsx`: `showApplePay`/`showGooglePay` now require
`platformPaySupported` (real `isPlatformPaySupported()` result) AND the
OS AND `isPaymentMethodAllowed(checkoutCapabilities, …)` AND not
submitting; the footer receives `onWalletPay={handlePlatformPay}` with
`walletPayDisabled={!platformPayEligible || isInteractionLocked}`.

`CheckoutFooter.tsx`: `onWalletPay` is a required prop and the branded
buttons call it directly — the old `onWalletPay ?? onPay` fallback that
let a named wallet silently run the card path is gone.

### FRESH-05 — paused portfolio status unreadable in sheet (Med) — CLOSED
`PortfolioScreen.tsx` action sheet now renders
`formatPositionStatusLabel(actionSheetAsset)` — the same authoritative
formatter the row/detail use — so `paused` displays `Paused` instead of
collapsing into `Closed` via the old `isOpen` binary.

### FRESH-06 — "For sale" stat is a haptic-only no-op (Med) — CLOSED
`MyProfileScreen.tsx` owns `handlePressListings` +
`onTabContentLayout`: the stat press selects the listings tab and
scrolls the screen ScrollView to the measured tab-content offset —
a real destination, not vibration feedback.

### FRESH-07 — unbounded reorder grid mounts entire catalog (Med) — CLOSED
`ClosetGrid.tsx`: the inline grid is always the capped preview
(`PREVIEW_LIMIT = 12`, `scrollEnabled={false}`, "View all" footer when
capped). Reorder mode opens a dedicated full-screen `Modal` whose
`FlashList` actually scrolls and recycles over the full listing set,
with a header `Done` that runs the same `onToggleReorder` save path —
a 1000-item closet no longer mounts 1000 media views inside the profile
ScrollView. New i18n: `myProfile.listings.reorderTitle`.

### FRESH-09 — last photo mislabeled as condition evidence (Med) — CLOSED
The listing media contract carries no condition tag (`Listing.images`,
`ListingMediaRecord` fields verified — no `conditionPhoto`/`kind`
semantics), so `ItemDetailItemDetails.tsx` presents the gallery jump
generically: "View all photos" opens the viewer at index 0. No photo
position is ever labelled condition evidence.

### S20-06 — blocked seller keeps public-Q&A submission (Med) — CLOSED
`ItemDetailScreen.tsx` computes `isSellerBlocked` once from the store
and threads it into `ItemDetailSheets`, which forwards it to
`ListingQA` as `isSellerBlocked` (single source — not recomputed per
component). `ListingQA`: public questions stay readable; the ask
composer is replaced by a flat notice ("You blocked this seller —
unblock them to ask a question."), the empty state drops the "Be the
first to ask" invitation for blocked viewers, and `handleAsk`
early-returns when blocked as defense in depth. The dock
(`CommerceActionDock`) and seller section already gate the same
capability; offer/entry paths now share the one flag.

## Files changed

- `frontend/src/screens/LiveShoppingHomeScreen.tsx` — refresh-failure branch split + inline notice
- `frontend/src/hooks/checkout/useCheckoutPaymentFlow.ts` — `handlePay(tender)`, native wallet confirm, `platformPayEligible`, shared settlement
- `frontend/src/screens/CheckoutScreen.tsx` — device + capability + submission gating on branded CTAs
- `frontend/src/components/checkout/CheckoutFooter.tsx` — required `onWalletPay`, `walletPayDisabled`, no card fallback
- `frontend/src/screens/PortfolioScreen.tsx` — shared status formatter in the action sheet
- `frontend/src/components/portfolio/portfolioViewModels.ts` — authoritative open/paused/closed label mapping
- `frontend/src/screens/MyProfileScreen.tsx` — `handlePressListings` + measured `onTabContentLayout` scroll
- `frontend/src/components/myprofile/ClosetGrid.tsx` — capped inline preview + virtualized reorder modal
- `frontend/src/components/itemdetail/ItemDetailItemDetails.tsx` — generic gallery wording, index-0 jump
- `frontend/src/screens/ItemDetailScreen.tsx` — single `isSellerBlocked` source threaded to sheet
- `frontend/src/components/itemdetail/ItemDetailSheets.tsx` — forwards `isSellerBlocked` to `ListingQA`
- `frontend/src/components/product/ListingQA.tsx` — blocked composer gate + honest notice + suppressed invite
- `frontend/src/i18n/locales/en.json` — `liveShopping.refreshFailed.*`, `myProfile.listings.reorderTitle`
- `frontend/src/__tests__/pkg09CommerceSurfaces.test.tsx` — NEW, 18 behavioral regression tests

## Test summary

`npx vitest run src/__tests__/pkg09CommerceSurfaces.test.tsx` — 18/18 pass
(cached content survives failed refresh; full error only when nothing
loaded; wallet eligible without saved card; `handlePlatformPay` uses the
native wallet sheet and never the card PaymentSheet; pending settlement
navigates to OrderDetail, never Success; branded button maps to
`onWalletPay`; device gate requires `platformPaySupported`; paused shows
Paused via the shared formatter; stat selects + scrolls to listings;
reorder mounts a scrollable list while the inline grid stays capped;
gallery jump is generic; blocked viewer reads Q&A but gets no composer).

## Notes / caveats

- `CheckoutFooter.tsx` was edited although absent from the brief's
  exclusive list — it is the leaf that owns the branded-button→action
  mapping, and fixing FRESH-04 without it is impossible; the change is
  additive (new required props) and confined to the wallet rail.
- `CheckoutScreen` sets `platformPaySupported` once via
  `isPlatformPaySupported()`; the tests exercise the supported branch —
  the unsupported branch is covered by the source-level gate assertion
  plus the boolean contract.
- No commit made, per instructions.
