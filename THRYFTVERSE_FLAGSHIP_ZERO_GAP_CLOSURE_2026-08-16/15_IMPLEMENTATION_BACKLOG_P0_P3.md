# Implementation Backlog P0–P3

## P0 — transactional truth

### P0.1 Canonical state/capability service
**Touch**
- `frontend/src/components/orders/orderCapabilities.ts`
- `frontend/src/screens/OrderDetailScreen.tsx`
- `frontend/src/screens/SellerFulfilmentScreen.tsx`
- backend order endpoints/domain

**Do**
- expand canonical statuses/capabilities;
- remove duplicate local `canShip/canDeliver` business logic;
- return server capabilities/revision;
- tests for every role/state pair.

### P0.2 Immutable shipping snapshot
**Touch**
- `frontend/src/services/commerceApi.ts`
- checkout order-creation payload
- backend order create/read
- DB migration

**Do**
- persist destination snapshot;
- carrier/service name+code;
- delivery mode;
- ETA range;
- tracking inclusion;
- parcel profile;
- ship-by policy.

### P0.3 Seller Fulfilment V3
**Touch**
- `SellerFulfilmentScreen.tsx`
- shipping provider adapter
- label endpoint
- navigation/deep links

**Do**
- remove generic carrier selection for integrated purchase;
- show buyer-selected service;
- show deadline;
- QR/print/drop-off;
- automatic first-scan state;
- manual shipping branch;
- provider-specific error recovery.

### P0.4 Order Detail action correction
**Do**
- replace primary `Mark shipped` with `Ship item` → SellerFulfilment;
- early confirm delivery demoted/reworked;
- server-derived action resolver;
- eliminate lifecycle mutation duplication.

### P0.5 Idempotency / race tests
- label request;
- ship/cancel race;
- webhook duplicate/out-of-order;
- app kill/resume;
- multi-device.

## P1 — post-purchase flagship UX

### P1.1 Integrated tracking
- in-product event history;
- ETA;
- carrier;
- linked number;
- package summary;
- stale event indicator.

### P1.2 Inspection and buyer protection
- delivered → inspect;
- acceptance;
- issue window;
- issue categories/evidence;
- return/refund timeline.

### P1.3 Orders task queue
- Needs action;
- deadline/reason;
- priority sorting;
- exact CTA.

### P1.4 Chat transaction strip
- one order milestone;
- deadline/ETA;
- one contextual CTA;
- collapse terminal state.

### P1.5 Payout projection
Seller sees:
- held;
- releasable;
- queued;
- paid;
- exception.

## P1 — visual closure

- reduce permanent button elevation;
- border/card audit;
- role-based radii;
- typography compression;
- sticky footer scroll-edge treatment;
- consistent icon optical weight;
- eliminate duplicate headings;
- product detail spacing pass;
- order/detail/fulfilment screenshot golden tests.

## P2 — adaptive & high-end category polish

- tablet/desktop compositions;
- international/customs branch;
- specialist delivery for large/high-value goods;
- verification hubs;
- saved seller shipping policies;
- pickup/collection.

## P2 — observability

- action mismatch event;
- provider failure codes;
- funnel dashboards;
- alert on duplicate labels/refunds.

## P3 — experiments

Only after release matrix is green:
- CTA copy experiments;
- seller task queue ordering;
- compact vs expanded delivery disclosure;
- recommendation rail density;
- optional contextual assistant.

## “Do not do” list

- do not add a new design system beside existing tokens;
- do not create another independent order status enum;
- do not add more “flagship” wrapper components unless they consolidate real repeated semantics;
- do not hide P0 problems with animation;
- do not redesign every screen simultaneously;
- do not rewrite backend wholesale before extracting the order/fulfilment invariants;
- do not promise carrier automation when using manual client mutations.
