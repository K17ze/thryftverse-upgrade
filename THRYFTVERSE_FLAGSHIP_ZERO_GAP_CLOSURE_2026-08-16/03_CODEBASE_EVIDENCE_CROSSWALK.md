# Codebase Evidence Crosswalk

This document separates **observed code** from **recommended target** so the audit does not confuse inference with fact.

## `frontend/src/components/ui/AppButton.tsx`

### Observed
- variants: primary / secondary / danger / ghost;
- sizes: 44 / 52 / 56 minimum height;
- press scale around 0.985;
- loading state;
- accessibility label/hint plumbing;
- optional haptic;
- consistent theme tokens.

### Assessment
The button primitive is **not** the main blocker. Physical quality is already respectable.

### Target
- only one visually prominent primary per choice set;
- no default elevation on every primary action;
- haptics reserved for meaningful state confirmation;
- focus-visible policy for web/desktop;
- icon-only companion primitive with 44pt/48dp invisible target;
- semantic action metadata supplied by the action resolver.

---

## `frontend/src/components/flagship/FlagshipActionCluster.tsx`

### Observed
`ActionItem` is mostly presentation: label, handler, variant, size, disabled/loading and icon. Variant defaults to primary.

### Risk
Multiple actions can accidentally become equally primary. The component cannot distinguish “next task” from “secondary”, “recovery” or “destructive” semantics.

### Target
A semantic action contract:
- stable ID;
- semantic role;
- state prerequisite;
- reason unavailable;
- analytics ID;
- idempotency/transaction key where relevant;
- confirmation model;
- accessibility consequence;
- online requirement.

The component should enforce **max one `primary_next`**.

---

## `frontend/src/components/orders/orderCapabilities.ts`

### Observed
There is already a central capability resolver with buyer/seller roles and primary/secondary action concepts.

### Gaps
- only a compact set of statuses is represented;
- seller action is primarily based on `paid`;
- buyer shipped state points to `confirm_delivery`;
- richer states in Order Detail are not canonicalised here;
- this resolver is not the single authority used by Order Detail.

### Target
Promote this into the only client-side action resolver. It should consume a server-provided state/capability envelope when possible.

---

## `frontend/src/screens/OrderDetailScreen.tsx`

### Observed
Strong:
- role-aware buyer/seller;
- stale-data fallback;
- order snapshot fallback for listing title/image;
- parcel events;
- polling;
- review prompt;
- support/resolution paths;
- transaction breakdown.

Critical:
- action availability is recomputed locally;
- seller `paid|processing|preparing` can get primary **Mark shipped**;
- direct mutation can mark shipped without tracking;
- the richer **Dispatch item** route is in overflow;
- buyer can confirm delivery while shipped/in transit/out for delivery;
- confirmation explicitly releases held funds;
- carrier URLs are hard-coded on client;
- failure states are compressed into a generic stepper progression;
- paid timestamp has an incomplete/proxy treatment.

### Target
Order Detail becomes a read/act projection of the canonical state machine, never a second business-rule engine.

---

## `frontend/src/screens/SellerFulfilmentScreen.tsx`

### Observed
Strong:
- dedicated screen exists;
- label generation endpoint;
- tracking fields;
- mounted/loading/error handling;
- reduced motion and haptics.

Critical:
- seller eligibility differs from Order Detail;
- buyer-selected shipping service is not the visual headline;
- buyer destination is absent;
- no ship-by deadline;
- no package profile/limits;
- generic carrier picker can imply carrier choice after the buyer has already paid;
- provider errors collapse toward a “carrier integration” message;
- generic mark-shipped remains the final dominant mutation;
- tracking can be omitted and added later;
- generated label state is not a complete persistent fulfilment object;
- label rendering is not a purpose-built QR/print/drop-off workflow.

### Target
See `05_SELLER_FULFILMENT_V3.md`.

---

## `frontend/src/screens/CheckoutScreen.tsx`

### Observed
Strong:
- live shipping quote selection;
- quote ID and carrier ID;
- address/payment validation;
- idempotency scaffolding;
- payment settlement polling and SCA handling;
- clear staged payment states;
- offline/partial-data handling.

### Continuity gap
Checkout’s shipping object has more user-facing meaning (label, ETA, tracking, price, quote/carrier IDs) than the post-purchase order contract exposes.

### Target
Purchase commits an immutable shipping-selection snapshot. Order screens never have to guess or reconstruct it.

---

## `frontend/src/services/commerceApi.ts`

### Observed
- shipping quote objects are relatively rich;
- order creation accepts quote/carrier/address identifiers;
- order representation does not carry a full immutable destination + service + fulfilment snapshot;
- address mapping omits/empties some richer address fields in frontend representation.

### Target
See `08_FULFILMENT_DATA_CONTRACT_V3.md`.

---

## `frontend/src/screens/MyOrdersScreen.tsx`

### Observed
Strong:
- buying/selling tabs;
- search;
- filters;
- server pagination;
- FlashList;
- skeletons;
- empty states;
- `needsActionCount` exists.

### Gap
A seller’s order surface is still mostly an archive/ledger. Mature marketplace UX treats pending dispatches and exceptions as a work queue.

### Target
Add a first-class **Needs action** lens, deadline, reason and exact CTA on the row.

---

## Backend architecture

### Observed
The repository has:
- shipping-provider logic;
- parcel-event migration/work;
- server shipping quote work;
- buyer-protection hold/payout scheduling work;
- reconciliation and workflow tests;
- a very large backend API index file.

### Assessment
The core ingredients exist, but UX truth should be projected through a dedicated fulfilment/order domain rather than distributed endpoint-specific conditions. The large API entry file increases the cost of proving ownership, transaction boundaries and state transitions.

### Target
Create/strengthen domain modules:
- `orders/stateMachine`;
- `orders/capabilities`;
- `fulfilment/service`;
- `fulfilment/providerAdapter`;
- `fulfilment/snapshot`;
- `fulfilment/events`;
- `payout/projection`.

Do not refactor the monolith merely for aesthetics; refactor the specific lifecycle paths to make invariants testable.
