# Implementation Prompts

Use these prompts sequentially on `feat/product-detail-contract-media-device-closure`. Each prompt assumes the previous one is merged or present. Do **not** let the coding agent reinterpret the visual identity from scratch.

---

## Prompt P0-A — Canonical order capability closure

You are working in `K17ze/thryftverse-upgrade` on branch `feat/product-detail-contract-media-device-closure`.

Mission: make order action semantics single-source-of-truth.

Read first:
- `frontend/src/components/orders/orderCapabilities.ts`
- `frontend/src/screens/OrderDetailScreen.tsx`
- `frontend/src/screens/SellerFulfilmentScreen.tsx`
- `frontend/src/screens/MyOrdersScreen.tsx`
- all order/parcel backend handlers and tests.

Required:
1. inventory every order/parcel/payment status currently emitted by backend;
2. build one normalized state vocabulary and role-aware capability resolver;
3. delete/reduce independent `canShip`, `canDeliver`, `canCancel`, etc. condition trees from screens;
4. Order Detail, Orders row, Seller Fulfilment entry, Chat transaction action and notifications must consume the same resolver/server capability;
5. no client may loosen backend transition permissions;
6. add table-driven tests for every state × buyer/seller role;
7. preserve current visuals except where action hierarchy must change;
8. output a status-map document and tests.

Non-negotiable: seller paid order primary action must be `Ship item` / `Dispatch item` entering guided fulfilment, not direct generic `Mark shipped`.

---

## Prompt P0-B — Immutable purchase fulfilment snapshot

Mission: close checkout → order shipping information loss.

Read:
- `CheckoutScreen.tsx`
- `commerceApi.ts`
- server shipping quote implementation
- order creation DB/schema/routes
- migrations for server shipping quotes/parcel events.

Implement an immutable order snapshot containing:
- destination snapshot;
- quote ID/hash;
- carrier ID/name;
- service code/name;
- delivery mode;
- ETA min/max;
- tracking inclusion;
- buyer shipping price/payer;
- parcel profile;
- ship-by policy/version.

Requirements:
- migration/backfill strategy;
- role-aware redaction;
- API response types;
- order-create transaction persistence;
- tests proving current seller shipping settings cannot change an already-purchased service;
- app restart/multi-device reads identical purchased service.

Do not reconstruct the buyer choice from mutable tables after purchase.

---

## Prompt P0-C — Seller Fulfilment V3

Rebuild `SellerFulfilmentScreen.tsx` as an operational task.

For integrated shipping:
- headline = ship-by deadline;
- show exact buyer-selected service;
- show destination context;
- show parcel profile/limits;
- primary before label = `Get shipping label`;
- after label = `Show drop-off QR`;
- secondary = `Print label`, `Find drop-off`, `Message buyer`;
- carrier picker must not be shown if buyer already purchased a fixed service;
- carrier first scan drives state;
- no generic primary `Mark shipped`;
- provider error branches are typed, not one generic catch;
- label ID persisted; expiring URL refreshed;
- app kill/reopen restores label.

For manual shipping:
- full address;
- required tracked service;
- carrier/tracking validation;
- proof;
- explicit `Add tracking & confirm dispatch`.

Maintain Thryftverse’s current restrained visual language. Do not add dashboard cards for every block.

---

## Prompt P0-D — Order Detail semantic correction

Refactor `OrderDetailScreen.tsx`.

Required:
- remove direct seller happy-path `Mark shipped`;
- primary seller action routes to guided fulfilment;
- remove duplicated capability conditions;
- buyer in-transit primary should be `Track parcel`, not `Confirm delivery`;
- early receipt, if retained, must be a secondary exception action;
- after carrier delivery, primary becomes `Check your item`;
- show exact server-derived shipping service and destination summary;
- show ETA + integrated parcel history;
- show inspection/payment-release deadline after delivery;
- failures get dedicated exception state, not misleading normal progress;
- no proxy “paid timestamp” presented as real paid time.

---

## Prompt P0-E — Shipping provider event authority

Mission: make integrated shipping event-driven.

Implement:
- normalized provider adapters;
- webhook signature verification where provider supports it;
- idempotent event ingestion;
- event dedupe;
- out-of-order reconciliation;
- first scan / carrier accepted transition;
- in-transit / out-for-delivery / delivered;
- delivery exception;
- stable tracking URL from backend adapter;
- reconciliation job for missed webhooks.

Tests:
- duplicate events;
- delayed older event after newer event;
- provider outage;
- webhook replay;
- no first scan;
- label bought but client lost response.

---

## Prompt P1-A — Orders as action inbox

Upgrade `MyOrdersScreen.tsx` and order rows.

Required:
- first-class `Needs action`;
- seller tasks prioritized by deadline/severity;
- row shows state + deadline/ETA + one exact contextual action;
- preserve search/filter/history;
- no cluttering multiple button pills;
- terminal orders remain calm archive;
- buyer/seller language differs appropriately.

---

## Prompt P1-B — Chat transaction strip

Add a compact transaction strip in the buyer–seller chat.

Requirements:
- one item thumbnail;
- one state line;
- deadline/ETA if meaningful;
- exactly one canonical next action;
- uses same capability resolver;
- hides/collapses after terminal state unless issue open;
- does not consume significant conversation height;
- accessible and dynamic-type safe.

---

## Prompt P1-C — Buyer inspection, return, refund

Implement the post-delivery protection journey:
- delivered → inspection window;
- `Everything is OK` and `Report a problem`;
- issue taxonomy by user intent;
- evidence conditional by issue;
- payout hold;
- return label/QR/deadline/tracking;
- refund pending/completed states;
- no ambiguous money wording;
- full idempotency and recovery tests.

---

## Prompt P1-D — Chic/minimal visual closure

Audit these surfaces after the state work:
- Product Detail
- Checkout
- My Orders
- Order Detail
- Seller Fulfilment
- Chat transaction strip
- Seller Hub
- Settings/Profile affected components.

Rules:
- remove unnecessary card nesting;
- remove permanent borders if spacing can separate;
- one primary CTA;
- no automatic elevation on every primary button;
- consistent radius roles;
- consistent icon optical weight;
- compress excessive vertical padding while keeping hit targets;
- preserve media/content dominance;
- dark mode must remain lower-contrast and refined, not outline-heavy;
- do screenshot comparison on supplied reference-device sizes.

Do not introduce gradients/glass/gold as “premium”.

---

## Prompt P1-E — Adversarial transactional QA

Build automated and manual tests covering every row in `16_ZERO_KNOWN_GAP_ACCEPTANCE_MATRIX.md`.

Must include:
- state × role table tests;
- Detox/Maestro-style E2E where available;
- network fault injection;
- app kill/resume;
- duplicate tap;
- multi-device simulation;
- label provider error fixtures;
- carrier webhook order permutations;
- dynamic type;
- reduced motion;
- screen reader manual checklist;
- screenshot/golden diff at compact/large iOS and Android.

Block release on open Severity 1/2 transactional defects.
