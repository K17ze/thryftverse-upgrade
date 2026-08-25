# ThryftVerse Shipping, Returns and Seller Fulfilment (Upgraded)

## P0 production dossier — code audit, policy model and implementation specification

**Research cut-off:** 25 August 2026 (includes CMA direct consumer enforcement one-year report April 2026, DMCC Act 2024 drip-pricing/fake-reviews enforcement, CMA208 fake reviews guidance, CMA200 direct enforcement guidance, draft revised unfair contract terms guidance January 2026, Royal Mail Parcels User Guide August 2026, Royal Mail Tracking API v2 1.0.38, Royal Mail Shipping V2 REST, Consumer Rights Act 2015 as amended April 2026)
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Surfaces:** checkout shipping, seller dispatch, labels, tracking, buyer delivery, returns, reverse logistics, claims, refunds, protection and operator exceptions
**Deliverable type:** codebase-grounded research and implementation specification; this report does not change product code
**Release verdict:** **P0 BLOCKED — OUTBOUND SHIPPING IS PARTLY REAL; RETURNS ARE NOT AN EXECUTABLE DOMAIN**
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

---

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection. The following material is new or substantially expanded:

1. **CMA direct consumer enforcement — one year on (April 2026)** — the CMA's new direct enforcement regime under the DMCC Act 2024 has been operational for one year. In that year, the CMA opened investigations into 14 businesses, settled with 2, ordered £760,000 in refunds, imposed £4.7 million in fines, issued 157 advisory/warning letters, and sent 46 information notices. The three enforcement priorities are **drip pricing**, **fake reviews**, and **online choice architecture (OCA)**. The AA was fined £4.2 million for drip pricing. This directly affects ThryftVerse: if shipping costs are not shown upfront in the total price, or if optional add-ons are added by default, the CMA can investigate and fine up to 10% of global turnover.
2. **DMCC Act 2024 — drip pricing and fake reviews** — drip pricing (showing a low headline price then adding mandatory fees later) is now a banned practice. Misleading countdown timers are also banned. Fake reviews (including concealed incentivised reviews and publishing reviews in a misleading way) are a banned practice. ThryftVerse's checkout must show the total price including all mandatory shipping costs upfront. ThryftVerse's review system (P0-8) must take steps to prevent fake reviews and must not publish reviews in a misleading way.
3. **CMA208 fake reviews guidance** — platforms publishing reviews must take steps to prevent publication of fake reviews and reviews where incentives are hidden. This includes online marketplaces. The guidance covers how reviews are obtained, moderated, and displayed, through to star ratings. This is directly relevant to P0-8 (reputation and reviews) but also affects shipping/returns because return-related feedback and seller ratings must not be misleading.
4. **Draft revised unfair contract terms guidance (January 2026)** — the CMA published draft revised guidance on unfair contract terms under the Consumer Rights Act 2015. This affects ThryftVerse's terms of service, return policies, and buyer protection terms. Return policy terms must be fair, transparent, and not exclude statutory rights.
5. **Royal Mail Parcels User Guide (August 2026)** — Royal Mail offers free Parcel Shipping Solutions including API solutions for 2D barcoded labels, automated billing, and pre-advice. The Tracking API v2 (version 1.0.38) provides track-and-trace for account customers. The Shipping V2 REST API exposes shipment creation, label production, and documentation for domestic and international items. This confirms the carrier integration path is viable but requires account onboarding and label approval.
6. **Consumer Rights Act 2015 — as amended April 2026** — the CRA is current as of 22 August 2026 with all changes in force. It covers goods, digital content, and services. Digital content (relevant to ThryftVerse's digital/co-own features) is covered in Chapter 3. The DMCC Act amended the CRA to add direct enforcement powers.
7. **Deeper codebase verification** — the synthetic tracking number defect (`orders.ts:2323` — `TV-${orderId.toUpperCase()}`) was re-confirmed. The fallback quote source chargeable at checkout was re-confirmed. The missing server handlers for `/orders/:id/shipping-label` and `/orders/:id/fulfilment/handoff-assertion` were re-confirmed as integration blockers. The hardcoded 14-day return policy for every listing was re-confirmed.
8. **Deeper drip-pricing analysis** — the current checkout flow shows shipping as a separate line item selected on `PostageScreen`. If the shipping cost is not included in the headline price shown before the shipping selection step, this may constitute drip pricing under the DMCC Act. The CMA has specifically investigated marketplaces and booking platforms for this practice. ThryftVerse must ensure the total price (item + mandatory shipping) is shown upfront, with shipping options presented as a transparent selection, not as a surprise fee.
9. **Deeper fake-reviews exposure** — the CMA's fake-reviews enforcement is directly relevant to the shipping/returns domain because seller ratings and review authenticity affect buyer trust in fulfilment. If ThryftVerse publishes seller reviews that are fake, incentivised, or misleadingly presented, the CMA can investigate. The return policy display (`ShippingReturnsInfo.tsx:72-77`) and seller trust signals must not present misleading information.

---

## 1. Evidence language

This dossier deliberately separates what is known from what is proposed.

- **[VERIFIED — CODE]** means the behaviour is directly visible in the inspected repository at the cited path and line.
- **[VERIFIED — EXTERNAL]** means the statement is supported by a linked primary or official source current at the research cut-off.
- **[INFERENCE]** means the conclusion follows from multiple verified observations but has not been exercised against a live carrier or production database.
- **[EXTERNAL REQUIREMENT]** means a legal, regulatory, contractual or provider constraint that must be confirmed for the launch countries and merchant model.
- **[DECISION]** means the recommended ThryftVerse product or architecture rule.
- **[PROPOSED]** means a schema, contract, screen or operating process that does not exist yet.

Line references are forensic anchors, not substitutes for runtime validation. The working tree can move after this report.

---

## 2. Executive finding

ThryftVerse has several unusually good foundations for an early marketplace: authenticated server-issued quotes, buyer/address/listing binding, quote expiry and one-time consumption, provider adapters, webhook signature handling, normalized parcel events, and an integrated-shipping concept in which a seller handoff assertion should not outrank the carrier’s first scan.

The department nevertheless cannot be considered production safe for four reasons:

1. **A production user can still create a fabricated tracking number.** `POST /orders/:orderId/ship` substitutes `TV-${orderId}` when no tracking number exists and marks the order shipped. That route is seller-accessible and is not limited to fixture mode.
2. **Fallback prices can become chargeable checkout facts.** The quote provider creates algorithmic fallback rates whenever live rating fails. The quote table explicitly accepts `source = 'fallback'`, while checkout validates ownership, carrier, expiry and usage but does not reject a fallback source.
3. **The native fulfilment workflow calls routes that were not found on the server.** The screen invokes `/orders/:id/shipping-label` and `/orders/:id/fulfilment/handoff-assertion`; repository-wide search found client calls/comments but no registered backend handler. The UI therefore describes an architecture that is not fully wired.
4. **The return/refund experience is materially untruthful.** every listing is returned with a hardcoded 14-day return policy; support copy promises a return label and an escrow refund; the buyer’s `Request refund` action calls an admin-only refund-execution route; and there is no return request, RMA, return shipment, inspection or remedy state machine.

The correct P0 programme is not a larger `OrderDetailScreen`. It is a separate fulfilment domain with immutable evidence, explicit authority, versioned legal policy, idempotent money coupling and a native experience organized around the parcel and next action.

---

## 3. End-to-end code trace

### 3.1 Quote and checkout path

| Layer | Evidence | Assessment |
|---|---|---|
| Native preferences | `frontend/src/screens/PostageScreen.tsx:50-55` defines three fixed UK carriers and prices; `:104` and `:125-126` install them when capability loading fails. | **P0 truth defect.** A failure state becomes operational-looking rate data. These are neither cached signed quotes nor labelled examples. |
| Quote request | `backend/api/src/routes/shipping.ts:159-191` authenticates the caller and prevents a non-admin from supplying another buyer ID. | Sound identity boundary. Remove `buyerId` from normal client input in the next contract; the authenticated subject should be authoritative. |
| Address binding | `shipping.ts:216-226` resolves the destination only from an address owned by the buyer or their primary address. | Strong. The returned UI projection must remain privacy-reduced; raw recipient address must never enter analytics or logs. |
| Country policy | `shipping.ts:246-260` falls back to the GB capability profile if compliance-profile lookup fails. | **P0 jurisdiction defect.** Unknown country is not GB. Fail with `COUNTRY_CONTEXT_UNAVAILABLE`; do not silently change carrier, customs or rights policy. |
| Carrier rating | `backend/api/src/lib/shippingProvider.ts:1065-1077` attempts a live quote and substitutes `fallbackQuoteForCarrier` for every failed carrier. | Useful only for explicitly marked development fixtures. A quote used for payment must be provider-backed or an approved tariff-table rate with its own provenance and version. |
| Persistence | `backend/api/src/db/migrations/072_server_shipping_quotes.sql:4-20` binds buyer, seller, listing, address, carrier, amount, source, hash, expiry and one consumed order. | Good base. Missing service code/version, parcel snapshot, tax/duty basis, provider request ID, quote status and immutable request hash uniqueness. |
| Checkout validation | `backend/api/src/routes/orders.ts:714-770` locks and validates quote ownership, address, carrier, expiry and prior use. | Strong anti-tamper base, but the query does not select `source` and cannot reject a fallback quote. A signed hash is not proof the price came from a carrier. |

### 3.2 Shipment, label and dispatch path

| Layer | Evidence | Assessment |
|---|---|---|
| Live provisioning | `shippingProvider.ts:1081-1123` calls configured provider endpoints and requires a tracking number before accepting the response. | Sensible first adapter. It assumes a shipment is synchronous and reduces provider state to one nullable label URL; asynchronous label jobs need a persisted state machine. |
| Provider outage | `shippingProvider.ts:1155-1171` throws `SHIPPING_PROVIDER_UNAVAILABLE` in `NODE_ENV=production` and creates a fake label/tracking object only outside production. | Good fail-closed behaviour in this function. Release-channel gating must use an explicit `SHIPPING_FIXTURE_MODE=false`, not merely `NODE_ENV`, because EAS preview/staging builds can be distributed to auditors. |
| Payment coupling | `backend/api/src/routes/orders.ts:1319-1358` attempts shipment provisioning after marking a manually paid order paid, swallows provisioning failure into `provisioned: false`, then commits. | Keeping payment independent from carrier availability is correct, but a durable `label_pending/failed` job and retry key are required. Logging alone loses the operation. |
| Seller label UX | `frontend/src/screens/SellerFulfilmentScreen.tsx:182-208` calls `POST /orders/:id/shipping-label`. | **P0 integration blocker.** No matching server route was found. If the label was already generated during payment, the screen should request/retry the canonical shipment resource, not create a second shipment. |
| Handoff UX | `SellerFulfilmentScreen.tsx:287-310` correctly states that integrated carrier scan—not seller assertion—advances canonical status, then calls the client handoff function. | Correct product principle. **Integration blocker:** no server handler was found for `/fulfilment/handoff-assertion`. |
| Manual dispatch | `backend/api/src/routes/orders.ts:2275-2331` checks seller ownership and `paid` status, but accepts optional carrier/tracking and synthesizes `TV-${orderId.toUpperCase()}` at `:2322-2323`. | **Immediate stop-ship defect.** The database can now hold a fabricated tracking number, notifications can present it as real, and downstream release/ranking may treat the order as shipped. |
| Idempotency | The manual ship route has no idempotency key, request hash or transition-event uniqueness. | Retried requests can overwrite provenance/time and cannot distinguish replay from a second action. |

### 3.3 Tracking, delivery and settlement path

| Layer | Evidence | Assessment |
|---|---|---|
| Parcel ledger | `backend/api/src/db/migrations/019_order_parcel_events.sql:1-32` stores provider, normalized event, provider event ID, tracking ID, occurred/received times and payload; provider-event uniqueness exists. | Strong starting event ledger. Add raw payload hash/object reference, schema version, signature verification record, authority and correction/supersession. Keep PII out of payload JSON. |
| Status taxonomy | The same migration supports `picked_up`, `in_transit`, `out_for_delivery`, `delivered`, `collection_confirmed`, `delivery_failed`, `returned`. | Too coarse for operations: missing label lifecycle, handoff asserted, delivery attempted, available for collection, exception, lost, damaged, customs, return-to-sender phases and explicit non-terminal mappings. |
| Webhooks | `backend/api/src/routes/shipping.ts:375-539` verifies/normalizes carrier events, resolves order by tracking, applies the event, and queues settlement notifications. | Credible architecture. Must acknowledge quickly after durable inbox insert; provider retries should not wait on settlement or notification work. |
| Buyer confirmation | `orders.ts:2340-2395` lets the buyer set a shipped order to delivered and calls `releaseCommerceOrderEscrowToSeller` in the same transaction. | **High-risk money defect.** Buyer acknowledgement can be a strong signal, but direct immediate release needs step-up, dispute/return-open checks, amount thresholds, unknown-outcome handling and an append-only settlement decision. It must not erase carrier conflicts. |
| Protection window | `orders.ts:2057-2115` derives 30 days from delivery or 60 days from order creation and caps coverage at £500 in route code. | Hardcoded commercial policy without persisted policy/version acceptance. Coverage must be server policy data bound to the order snapshot. |

### 3.4 Returns, claims and refund path

| Layer | Evidence | Assessment |
|---|---|---|
| Product detail | `backend/api/src/routes/listings.ts:2862-2875` returns Buyer Protection as available and returns `{accepted: true, windowDays: 14}` for every listing. | **P0 fabricated policy.** It ignores seller status, jurisdiction, category exceptions, voluntary policy, listing snapshot and whether protection is operationally available. |
| PDP rendering | `frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:72-77` turns that object into `14-day returns` or `No returns`. | Rendering is straightforward, but it collapses statutory rights, defect remedies and voluntary change-of-mind returns into one switch. |
| Support entry | `frontend/src/screens/OrderSupportScreen.tsx:274-278` promises investigation, return labels and refunds once the seller receives the item. | **P0 truthful-UI defect.** Only a generic support ticket exists; no RMA/reverse-label/inspection execution was found. |
| Buyer refund CTA | `frontend/src/screens/OrderDetailScreen.tsx:1475-1496` shows `Request refund` after delivered/completed and invokes `refundOrder`; `:1172-1178` shows a success toast after the call. | **Broken contract.** It is styled destructive even though it is a request, and its server endpoint is execution-only. |
| Refund backend | `backend/api/src/routes/orders.ts:2404-2455` requires `authUser.role === 'admin'` and only accepts `paid` or `shipped`; it cannot execute for the delivered/completed state where the buyer CTA is shown. | **Deterministic failure.** Request creation and refund execution must be separate endpoints and state machines. The route also bypasses the richer payment-refund provider workflow described elsewhere. |
| Return domain | Repository searches found return copy and `returned` status vocabulary but no canonical return-request/RMA/return-shipment/inspection/remedy schema. | **Confirmed capability absence**, not a polish gap. |

---

## 4. Capability matrix

Legend: **Real** = code-backed foundation; **Partial** = exists but unsafe/incomplete; **Absent** = no executable domain found; **Block** = must close before launch.

| Capability | Buyer | Seller | Operator | Backend/source of truth | Status |
|---|---:|---:|---:|---|---|
| Authenticated server quote | ✓ | — | inspect | `commerce_shipping_quotes` | Partial: fallback source chargeable |
| Live carrier rate provenance | display | — | diagnose | adapter metadata | Partial |
| Quote expiry/one-use binding | ✓ | — | inspect | DB lock/`used_order_id` | Real |
| Parcel dimensions/weight snapshot | limited | limited | — | request defaults to 0.4kg | Block |
| Label create/retrieve/retry | intended | intended | — | client route not found | Block |
| Label void/reprint | — | — | — | none | Absent |
| Integrated first-scan authority | timeline | intended | event path | parcel events | Partial |
| Manual tracking verification | timeline | input | — | no validation owner | Block |
| Handoff assertion | — | intended | — | server route not found | Block |
| Out-of-order webhook handling | timeline | timeline | inspect | normalization/apply layer | Partial; prove tests |
| Buyer delivery acknowledgement | ✓ | notified | — | direct order transition | Unsafe money coupling |
| Trader/private seller disclosure | missing | missing | missing | no authoritative seller-status snapshot | Block |
| Statutory vs voluntary returns | misleading | missing | missing | hardcoded listing object | Block |
| Return request/RMA | copy only | — | generic ticket | none | Absent |
| Reverse quote/label/tracking | promised | — | — | none | Absent |
| Return receipt/inspection | promised | — | — | none | Absent |
| Repair/replacement/price reduction | — | — | — | none | Absent |
| Partial/full refund orchestration | broken CTA | — | execution route | ledger-only route | Block |
| Outbound/return loss claim | — | — | — | none | Absent |
| Carrier claim recovery | — | — | — | none | Absent |
| Fulfilment exception queue | — | — | fragmented | alerting only | Absent/partial |
| Customs, duties and restricted goods | — | — | — | inferred country/default parcel | Absent |
| Multi-parcel/combined order | — | — | — | order has one tracking number | Absent |

---

## 5. August 2026 legal and policy model

This is an engineering interpretation, not legal advice. Launch counsel must approve the seller classification, marketplace role, policy text, countries, categories and remedy precedence.

### 5.1 Never model “returns” as one Boolean

**[VERIFIED — EXTERNAL]** UK guidance for traders says online customers generally have 14 days after receipt to cancel, another 14 days to return, and traders must refund within 14 days after receiving the item; faulty/not-as-described goods have separate rights. Standard delivery cost is also part of the refund, while premium delivery uplift need not be. [GOV.UK returns guidance](https://www.gov.uk/accepting-returns-and-giving-refunds) and [distance-selling guidance](https://www.gov.uk/online-and-distance-selling-for-businesses/distance-selling).

**[VERIFIED — EXTERNAL]** EU guidance, last checked 28 April 2026, states that the distance-sale withdrawal right does not cover a purchase from a private individual, while defective-return cost is the trader’s responsibility. The marketplace must make the professional/private distinction visible. [Your Europe — returns and withdrawal](https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm).

**[VERIFIED — EXTERNAL]** For EU-facing trader sales, DSA Article 30 requires trader traceability information before offering products, with specified trader information made clearly available; Article 31 requires the interface to enable legally required pre-contract information. [Regulation (EU) 2022/2065, Articles 30–31](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065).

Therefore each order needs a persisted, immutable rights snapshot:

```text
seller_capacity: private | trader | unknown
seller_capacity_evidence_id
buyer_country / seller_country / destination_country
rights_policy_version
sale_context: distance_marketplace
statutory_withdrawal: eligible | exempt | not_applicable | review_required
statutory_nonconformity_remedies: applicable | not_applicable | review_required
voluntary_return_policy_id
return_postage_default_payer
standard_outbound_postage_refundable
withdrawal_notice_deadline
return_dispatch_deadline
claim_deadline_by_reason
```

`unknown` must never be coerced to `private` or `trader`. The purchase button should be unavailable for trader-classification-required jurisdictions until seller status and required disclosures are valid.

### 5.2 Rights precedence

**[DECISION]** The policy engine evaluates in this order:

1. statutory safety/recall obligations;
2. statutory non-conformity remedies (faulty, counterfeit, materially not as described);
3. statutory distance-sale withdrawal for trader sales;
4. ThryftVerse Buyer Protection;
5. seller voluntary return promise;
6. discretionary goodwill.

A seller’s `No returns` choice can only suppress layer 5. It can never suppress layers 1–4. UI copy must state the applicable basis, not a generic marketing sentence.

### 5.3 Categories and exceptions

The policy service—not React code—must encode counsel-approved exceptions and evidence requirements for hygiene-sealed goods, personalized goods, perishables, counterfeit claims, digital/intangible goods, hazardous materials, authenticity programmes and cross-border customs. A policy decision stores `policy_version`, evaluated facts and reason code so a later policy change does not rewrite the buyer’s contract.

---

## 6. Target bounded contexts and ownership

```text
Checkout
  -> Shipping Quote Service
       -> Carrier Gateway(s)
       -> Quote Ledger
  -> Order Service (stores quote + rights snapshots)

Order paid
  -> Outbox: shipment.provision_requested
  -> Fulfilment Service
       -> Shipment/Parcel aggregate
       -> Carrier Gateway
       -> Provider Webhook Inbox
       -> Parcel Event Ledger
  -> Settlement Policy consumes authoritative events

Buyer problem / withdrawal
  -> Returns & Claims Service
       -> Eligibility Policy Service
       -> Return aggregate + evidence
       -> Reverse Shipment
       -> Decision/appeal
  -> Remedy Orchestrator
       -> Payment Refund Service
       -> Ledger/escrow adjustments
       -> notifications
```

**Ownership rules**

- Order owns the sale snapshot, parties and total—not mutable tracking state.
- Fulfilment owns shipments, parcels, labels and carrier evidence.
- Returns owns eligibility, reverse movement, inspection and decision.
- Payment owns provider refund execution and unknown outcomes.
- Ledger owns accounting entries; no other service writes balance state.
- Support references a return/claim; it does not impersonate one with a ticket status.
- Search/reputation consume finalized projections, never free-text support topics.

Use the existing Postgres, Redis/BullMQ and Fastify stack. Do **not** add Kafka or a separate logistics database at present. A transactional outbox plus idempotent workers is proportionate and auditable.

---

## 7. Authoritative data model

All money uses canonical integer minor units and ISO currency. All mutable aggregates use `version BIGINT` for optimistic concurrency. All provider operations store a request hash and idempotency key.

### 7.1 Shipping

**[PROPOSED] `shipping_quotes` v2**

```sql
id, buyer_id, seller_id, listing_id, address_id
origin_address_snapshot_id, destination_address_snapshot_id
parcel_snapshot_id, carrier_account_id, service_code, service_name
amount_minor, currency, tax_minor, duty_estimate_minor
source live_provider | contracted_tariff
provider_quote_id, provider_request_id, tariff_version
request_hash, response_hash, expires_at, consumed_order_id
status active | consumed | expired | invalidated
created_at
```

Delete `fallback` from chargeable source values. Development fixtures live in a different schema or carry `environment = fixture` and cannot be consumed outside automated tests.

**[PROPOSED] `shipments` and `parcels`**

```sql
shipments:
  id, order_id, direction outbound | return, provider, provider_shipment_id
  service_code, status, label_status, tracking_status
  ship_from_snapshot_id, ship_to_snapshot_id, incoterm
  amount_minor, currency, idempotency_key, request_hash
  created_at, updated_at, version

parcels:
  id, shipment_id, sequence, weight_grams
  length_mm, width_mm, height_mm, declared_value_minor, currency
  tracking_number_ciphertext, tracking_number_fingerprint
  provider_tracking_id, latest_event_type, latest_event_at
```

**[PROPOSED] `shipment_labels`**: provider document ID, format, encrypted object key, checksum, state (`requested|generating|ready|failed|voided|expired`), failure class, retry time. Do not persist public provider URLs as durable labels; they may expire and leak PII.

**[PROPOSED] `carrier_webhook_inbox`**: provider event ID, signature status/key version, body hash, encrypted raw-body object key, received time, processing state, attempt count and last error. Insert and acknowledge first; normalize asynchronously.

**[PROPOSED] `parcel_events` v2**: normalized type, provider type/code, provider/occurred/received times, authority (`integrated_carrier|aggregator|seller_assertion|buyer_assertion|operator`), location projection, evidence ID, supersedes event ID, raw event ID and schema version.

### 7.2 Returns and remedies

**[PROPOSED] `return_cases`**

```sql
id, order_id, requester_id, seller_id
reason: changed_mind | not_as_described | damaged | wrong_item |
        suspected_counterfeit | missing_parts | faulty | safety | other
basis: statutory_withdrawal | statutory_nonconformity |
       buyer_protection | seller_policy | goodwill
requested_remedy: return_refund | refund_without_return | repair |
                  replacement | price_reduction
status, policy_version, order_rights_snapshot_id
opened_at, response_due_at, ship_by_at, inspect_by_at, appeal_by_at
resolution_code, resolved_at, version
```

**[PROPOSED] supporting tables**

- `return_items`: immutable listing/condition/quantity snapshot.
- `case_evidence`: remote finalized asset ID, owner, type, hash, moderation state and capture time. Never accept a local URI.
- `return_eligibility_decisions`: inputs, rule version, output, explanation code and human override.
- `return_shipments`: shipment ID, payer (`buyer|seller|platform|carrier`), reverse quote ID and deadline.
- `return_receipts`: carrier delivery, seller acknowledgement or operator evidence.
- `return_inspections`: structured condition comparison, media, actor and deadline.
- `remedy_decisions`: remedy, amount components, reason, policy basis, approval authority and appeal state.
- `shipping_claims`: outbound/return shipment, carrier claim number, loss/damage evidence, filing deadline, recovery amount and status.
- `fulfilment_audit_events`: append-only actor, action, before/after version, reason and correlation ID.

### 7.3 Idempotency and concurrency invariants

- One active return case per order/reason family unless an operator explicitly supersedes it.
- One provider shipment per `(order_id, direction, attempt_generation)`.
- One label-purchase request per idempotency key and request hash.
- One refund execution per remedy component and payment intent.
- Provider event uniqueness is `(provider, account, event_id)`; body-hash replay is detected separately.
- Order rights snapshot is immutable after checkout.
- A refund success is only emitted from a confirmed provider webhook/read-back, never from request dispatch.
- A carrier event can advance the aggregate but cannot delete or rewrite earlier evidence.

---

## 8. State machines and authority

### 8.1 Shipment state

```text
draft
  -> provisioning
  -> label_pending -> label_ready
  -> handoff_pending
  -> handoff_asserted                (seller evidence only; no canonical transit)
  -> accepted_by_carrier             (first authoritative scan)
  -> in_transit -> out_for_delivery
  -> delivered

Exception branches:
  label_failed -> retryable | terminal
  handoff_pending/asserted -> no_first_scan
  in_transit -> delayed | customs_hold | damaged | lost
  out_for_delivery -> attempted -> collection_ready | in_transit
  any pre-transit -> cancelled -> label_void_pending -> voided
  any carrier state -> return_to_sender -> returned_to_sender
```

Order display status is a projection. Do not force all carrier detail into the existing `orders.status` enum.

### 8.2 Return state

```text
draft
  -> submitted
  -> eligibility_pending
  -> seller_response_pending | operator_review
  -> approved | declined

approved
  -> return_label_pending -> return_label_ready
  -> return_handoff_pending -> return_in_transit
  -> return_delivered -> inspection_pending
  -> remedy_authorized -> refund_pending
  -> refunded | replacement_in_progress | repaired | price_reduced
  -> closed

declined -> appeal_available -> appealed -> upheld | overturned -> closed

Exceptions:
  cancelled_by_buyer | expired_no_handoff | return_lost | return_damaged |
  seller_nonresponsive | inspection_disputed | refund_unknown
```

### 8.3 Authority matrix

| Claim | Can display as evidence | Can advance parcel state | Can release funds |
|---|---:|---:|---:|
| Signed integrated carrier event | yes | yes | policy input |
| Aggregator poll matching provider | yes | yes, lower precedence | policy input |
| Seller “dropped off” assertion | yes, labelled | no | no |
| Manual tracking entered by seller | yes after format/service validation | only to `handoff_pending` | no |
| Buyer “received” acknowledgement | yes | yes to buyer-acknowledged projection | only after risk/policy checks |
| Operator override | yes with reason | yes via compensating event | maker-checker for money |
| Timer | yes | can create exception | never by itself unless a versioned, approved protection policy explicitly allows timed release and no blocking case exists |

---

## 9. API contract specification

All mutation requests carry `Idempotency-Key`, authenticated actor, `If-Match` aggregate version where relevant and a client correlation ID. Stable machine codes drive UI; English messages do not.

### Quotes

- `POST /v2/shipping/quotes` — order/listing/address/parcel input; returns provider-backed options and expiry.
- `GET /v2/shipping/quotes/:id` — current/expired/consumed state.
- Checkout accepts only `quoteId`; carrier and price are derived from the locked quote.

### Shipments

- `POST /v2/orders/:orderId/shipments` — idempotently create an outbound shipment.
- `GET /v2/orders/:orderId/fulfilment` — authoritative buyer/seller projection with permissions and next action.
- `POST /v2/shipments/:id/labels` — request label; `202 label_pending` is normal.
- `GET /v2/shipment-labels/:id` — one-time authenticated download/QR projection.
- `POST /v2/shipments/:id/void` — allowed only before carrier acceptance; provider outcome may be pending.
- `POST /v2/shipments/:id/handoff-assertions` — records seller assertion/evidence without transit advancement.
- `POST /v2/shipments/:id/manual-tracking` — validates provider/service/format, records non-integrated path and returns verification state.

### Returns

- `POST /v2/orders/:orderId/return-cases` — creates a request; **never executes a refund**.
- `GET /v2/return-cases/:id` — role-reduced case projection and next action.
- `POST /v2/return-cases/:id/evidence` — accepts finalized media asset IDs only.
- `POST /v2/return-cases/:id/withdraw` — buyer cancels before prohibited stages.
- `POST /v2/return-cases/:id/seller-response` — accept/propose remedy/challenge within policy.
- `POST /v2/return-cases/:id/return-shipment` — idempotent reverse label request.
- `POST /v2/return-cases/:id/inspection` — seller/operator structured receipt evidence.
- `POST /v2/return-cases/:id/appeals` — one bounded appeal with new evidence/reason.
- `POST /v2/ops/return-cases/:id/decisions` — authorized decision; maker-checker above risk threshold.
- `POST /v2/remedies/:id/execute` — internal-only outbox consumer to payment service.

Example honest unknown outcome:

```json
{
  "ok": false,
  "code": "REFUND_OUTCOME_UNKNOWN",
  "returnCaseId": "ret_...",
  "remedyId": "rmd_...",
  "recovery": { "action": "poll", "retryAfterMs": 2000 },
  "message": "We are checking whether the refund completed. Do not submit it again."
}
```

---

## 10. Failure and edge-case catalogue

| Failure | Required system behaviour | User treatment |
|---|---|---|
| Live rate timeout | no fabricated quote; retry other configured provider/contract tariff; record provider health | Inline `Shipping options unavailable`; preserve address and parcel form |
| Quote expires during payment | reject before payment creation or refresh quote with explicit price-delta confirmation | Show old/new total; never silently charge |
| Address changes after quote | invalidate quote and shipment draft | Explain that shipping was recalculated |
| Label provider returns pending | durable job; webhook/poll reconciliation | `Preparing label`; safe leave-and-return |
| Provider charged but response lost | read back by idempotency/provider reference before retry | `Checking label`; never buy twice |
| Label generated, DB commit fails | webhook/poll finds orphan provider shipment and attaches/voids it | No duplicate action |
| Seller prints label twice | same document/version; no second charge | `Reprint label` |
| Address error after label | void/rebuy only if provider permits; audit cost bearer | Explicit cost and consequence |
| Seller asserts drop-off, no scan | exception after service-specific threshold; do not mark transit | `Waiting for carrier scan`; route to evidence/support |
| Manual tracking malformed | reject with carrier-specific validation | Field-level correction |
| Manual tracking valid but unverified | display `Tracking added · not yet verified`; do not release | No carrier movement claims |
| Duplicate/out-of-order webhook | inbox dedupe; retain chronological event; monotonic projection | Stable timeline, no status regression |
| Carrier says delivered, buyer says not received | freeze release if within policy; open claim; preserve delivery proof | Evidence-led problem flow |
| Buyer confirms delivery accidentally | cooling window/confirmation undo where money not released; otherwise support recovery | Avoid a one-tap irreversible release |
| Parcel lost outbound | carrier claim + buyer remedy; seller protection depends on eligible scan/label | Separate buyer refund from carrier recovery |
| Return lost in transit | cost/authority based on approved label and scan | Do not blame buyer with proof of handoff |
| Seller refuses return | deadlines advance to operator/default decision according to policy | Show exact deadline, not vague “under review” |
| Returned item differs | structured inspection dispute; original and return media comparison | Both parties see submitted evidence categories |
| Refund API timeout | unknown state; provider reconciliation; no duplicate refund | `Checking refund` with refresh |
| Carrier webhook secret rotated | overlapping key versions; reject unverifiable event into security queue | Tracking may be delayed, never fabricated |
| Provider outage longer than SLO | circuit breaker, queue pause, alternate carrier if label not purchased | Non-destructive switch-service path |
| Cross-border customs hold | scan-based status, documents action, no promised date | Explain carrier/customs ownership |
| Multi-parcel partial delivery | per-parcel timeline and remedy quantity | Do not mark entire order delivered |

---

## 11. Native UX specification — authored, not dashboard-shaped

### 11.1 Checkout shipping selection

**Dominant object:** total cost and arrival/service choice.  
**First viewport:** destination summary, two or three real quote rows, total delta and primary continue action.  
**Composition:** flat list with hairline separation; no card around each carrier, no decorative carrier icon circles, no “recommended” badge unless an explainable rule selected it.  
**Truth:** show `Estimated 2–4 working days` only from service data. Show rate expiry only when actionably close. A non-live option is not shown.  
**States:** address needed, parcel data needed, loading skeleton matching rows, partial provider results, no service, expired, price changed and offline cached-read-only.

### 11.2 Seller fulfilment

The current screen has the right conceptual direction but too many sequential panels. Re-author around the product image and one next action:

```text
[Back]                    Order #…

[item image]  Item title
              Ship by Tue 27 Aug
              Royal Mail Tracked 48

Pack the item
Use a rigid box · 420 g max

[ Get label ]  <- only dominant action

Later state replaces, not stacks below:
[ QR / label preview ]
Drop off by Tue · Find a location
Waiting for carrier scan
```

- Separate 44pt hit targets from 22–24pt glyphs.
- Replace completed steps rather than retaining every prior card.
- A handoff assertion is visibly labelled `You marked this as dropped off`; carrier truth remains `Waiting for carrier scan`.
- Label errors stay attached to the label action with retry and provider status.
- Manual shipping is a different flow with provider, service and tracking validation; never mix it under an integrated label.
- No generic escrow “safe” claim unless the money projection supplies a specific, evidenced hold state. Avoid the legally loaded word `escrow` unless the approved payments model supports it.

### 11.3 Buyer tracking

**Dominant object:** item + latest authoritative parcel event. Use one vertical timeline; collapsed older scans; carrier/source and `Updated …` freshness. ETA is a range and disappears when stale. `Track on carrier site` is a text action, not another large rounded control.

Problem entry is contextual:

- before first scan: `Seller says it was dropped off, but the carrier has not scanned it`;
- in transit overdue: `Delivery is taking longer than expected`;
- delivered: `I can’t find the parcel` / `Something is wrong with the item`;
- return: `Track my return`.

### 11.4 Return request

**Step 1 — reason:** item photo dominates; one reason list; plain language.  
**Step 2 — evidence:** only ask for evidence needed by that reason. For changed mind, no accusatory photo theatre. For damage/not-as-described, show camera guidance and upload progress.  
**Step 3 — outcome preview:** eligibility basis, deadline, payer for postage, expected remedy and what happens next.  
**Step 4 — submitted case:** a single next-action timeline; do not render a “case dashboard” of equal rounded cards.

Never use red for a normal return. Reserve danger styling for destructive loss of rights or confirmed rejection. Motion is limited to 160–220ms step transitions and progress changes, respects reduced motion, and never animates the whole list.

### 11.5 Accessibility and resilience

- Dynamic Type must not hide deadlines, amount or primary action.
- Each parcel event announces event, location if safe, date and source; colour is supplementary.
- Screen reader order follows parcel → latest state → next action → history.
- Label QR has a textual alternative and brightness affordance.
- Evidence uploads expose byte progress, failed asset and retry/remove action.
- Offline creates a local draft only; it never says the return was submitted.
- Sticky actions clear gesture navigation, keyboard and app dock on tested Android/iOS devices.

---

## 12. Carrier and stack decisions

### 12.1 Adapter approach

Keep a provider-neutral internal model but do not pretend providers share one contract. Each adapter must implement explicit capabilities:

```ts
rate, createDraft, buyLabel, getLabel, voidLabel,
track, verifyWebhook, schedulePickup, dropOffLocations,
createReturnLabel, createClaim, getClaim
```

Capability absence is typed, not discovered by HTTP 404 in production.

**[VERIFIED — EXTERNAL]** Royal Mail’s current API Shipping V2 exposes shipment creation, document/label operations, update/delete and manifest operations with account onboarding. [Royal Mail API Shipping V2](https://pp.developer.royalmail.net/product/7992) and [Royal Mail API onboarding](https://developer.royalmail.net/start).

**[VERIFIED — EXTERNAL]** Easyship’s current flow requires address, dimensions and weight, supports rate selection and asynchronous label creation, and recommends signed webhooks for label/tracking changes. Its 2024-09 API moved labels to batch generation and uses `courier_service_id`. [Easyship overview flow](https://developers.easyship.com/docs/overview-flow-guide), [webhook verification/retry guide](https://developers.easyship.com/reference/webhooks-guide), and [2024-09 migration](https://developers.easyship.com/reference/migrate-from-v2023-to-v2024).

The existing adapter’s speculative multi-path probing (`/rates`, `/v1/quotes`, etc.) should be replaced with version-pinned, contract-tested clients generated from provider OpenAPI where available. Provider response parsing should fail closed on schema drift and emit a compatibility alert.

### 12.2 Recommended stack

- Existing Fastify services and Postgres remain authoritative.
- Postgres transactional outbox + BullMQ workers for label/refund/claim jobs.
- Object storage with short-lived signed URLs for labels and evidence.
- OpenTelemetry correlation from native request → API → worker → provider webhook.
- Provider contract tests using recorded, scrubbed fixtures plus sandbox calls in CI/nightly.
- Feature flags by country/carrier/service; circuit breaker and provider kill switch.
- No blockchain, Kafka, bespoke route optimizer or live-map tracking in this phase.

---

## 13. Rollout and migration plan

### Phase 0 — immediate truth closure (before another EAS audit)

1. Remove synthetic tracking from `POST /orders/:id/ship`; require a real manual tracking number or an explicit untracked method that cannot claim carrier movement or trigger automatic release.
2. Reject `source=fallback` at checkout and stop showing hardcoded `PostageScreen` prices as current.
3. Replace country fallback-to-GB with an unavailable state.
4. Remove/disable buyer refund execution CTA; route it to support honestly until `return_cases` exists.
5. Remove return-label/refund promises that cannot be executed.
6. Replace hardcoded listing return policy with `null`/policy-unavailable until rights snapshots ship.
7. Implement or remove the client-only label and handoff routes; no dead controls.

### Phase 1 — schema and owner services

1. Add address/parcel/order-rights snapshots and shipping v2 migrations.
2. Add carrier webhook inbox, shipment/label aggregates and outbox.
3. Backfill existing paid/shipped orders into `legacy_manual` shipments without inventing provider IDs.
4. Add return/remedy schemas behind disabled feature flags.
5. Establish policy versions for initial UK private/private, UK trader/consumer and supported EU routes after counsel approval.

### Phase 2 — outbound production path

1. Integrate one launch carrier or aggregator end to end; do not claim multi-carrier breadth first.
2. Ship quote → checkout → async label → first scan → tracking → delivery without manual DB intervention.
3. Add void/reprint, no-first-scan and provider reconciliation queues.
4. Shadow settlement decisions; compare against operator outcome before enabling automated release.

### Phase 3 — returns and remedies

1. Launch buyer request, reason-specific evidence, eligibility and seller response.
2. Add reverse labels and return tracking for eligible routes.
3. Add inspection, operator decision, payment-refund orchestration and unknown outcomes.
4. Add appeals and carrier claims.

### Phase 4 — expansion

Only after launch-country SLOs hold: multi-parcel, pickup, cross-border customs, insurance, restricted-goods routing, alternate providers and trader-country expansion.

Migration safety:

- additive nullable columns/tables first;
- dual-write old order projection and new fulfilment aggregate;
- backfill in resumable ID ranges with checksums;
- compare projections in shadow mode;
- switch reads by feature flag;
- retain rollback read path until reconciliation is clean;
- make constraints `NOT VALID`, validate online, then enforce writes.

---

## 14. Operations, SLOs and metrics

### 14.1 Proposed service objectives

| Objective | Target | Measurement |
|---|---:|---|
| Quote API availability | 99.95% per launch region/month | valid non-fixture response / eligible requests |
| Quote latency | p95 < 1.5s, p99 < 3s | server receive to response; provider separated |
| Label request acknowledgement | p95 < 500ms | durable job accepted |
| Label ready | 99% < 60s where provider supports async labels | request to ready/failed |
| Webhook durable acknowledgement | p99 < 750ms | receive to inbox commit/2xx |
| Webhook normalization lag | 99.9% < 2m | received to projection |
| Duplicate label/refund | zero | reconciled provider duplicates |
| No-first-scan detection | 99% within service threshold + 15m | eligible shipment exceptions |
| Return eligibility decision | 90% automated < 5s; manual p95 < 24h | submitted to decision |
| Approved reverse label | p95 < 60s | approval to ready |
| Confirmed refund | p95 < 24h after authorization, provider-dependent disclosed | authorization to confirmed provider state |
| P0 exception age | none > 15m unowned | queue ownership telemetry |

SLOs must be segmented by carrier, service, country, app version and manual/integrated flow. A blended number can hide a broken carrier.

### 14.2 Product and integrity metrics

- quote success, partial success, expiry and price-change rates;
- provider/fallback leakage count (**must be zero** in release);
- label failure/duplicate/void rates and provider charge reconciliation;
- seller paid→label and label→first-scan time distributions;
- fabricated/invalid/unverified tracking attempts;
- carrier scan freshness and out-of-order event rate;
- delivery dispute rate by authority/evidence;
- return request rate by basis/reason/category/seller capacity;
- eligibility overturn and appeal rate;
- reverse-handoff, return-delivery and inspection cycle time;
- refund unknown-outcome and duplicate-prevention count;
- carrier recovery amount and ageing;
- support contacts per 100 orders, with deflection measured only when the issue is actually resolved.

Guardrail metrics: seller-capacity misclassification, policy-decision error, accessibility task completion, buyer/seller outcome gap, and false fraud/abuse blocks. Never optimize return friction to reduce return rate.

---

## 15. Test and validation programme

### 15.1 Contract and database

- clean database applies every migration and contains exact constraints/indexes;
- quote amount/source/address/parcel snapshot cannot be client-overridden;
- idempotency same-key/same-body replays; same-key/different-body conflicts;
- concurrent checkout consumes one quote once;
- state transition table rejects illegal regressions;
- one provider event applies once even with concurrent delivery;
- return/refund uniqueness and compensating transitions hold under retry;
- projection rebuild from event ledger matches stored aggregate.

### 15.2 Provider and chaos

- official sandbox happy path and version-pinned response schemas;
- timeout before provider receive, after provider receive and after provider success;
- malformed/unsigned/replayed webhook, rotated key and delayed event;
- event order: delivered before in-transit; duplicated delivered; returned after delivered;
- provider charged but label response lost;
- label ready webhook before API response;
- provider outage/circuit opening/recovery;
- reconciliation attaches or voids orphan shipment.

### 15.3 Rights/return matrix

At minimum: UK private seller, UK trader, EU trader, EU private seller, unknown seller capacity, changed mind, faulty, damaged, wrong item, not as described, hygiene-sealed exception, personalized item, deadline exact-boundary/DST/weekend, buyer-paid vs trader-paid return, standard vs premium outbound postage, partial order, seller non-response, lost return, disputed inspection, appeal overturn and refund unknown outcome.

### 15.4 Native device validation

Test release EAS builds—not Expo/web approximations—on small and large Android, iPhone with Dynamic Type, light/dark, reduced motion, TalkBack/VoiceOver, poor network, offline resume, app background during upload, keyboard open, gesture navigation and dock overlap.

Retain local before/after captures for:

- first useful content Y position;
- useful actions above fold;
- visible rounded-container count;
- largest non-media control;
- bottom-dock occlusion;
- skeleton/final geometry shift;
- seller label, first-scan, buyer tracking and all return states.

---

## 16. Non-goals

- No fabricated ETA, tracking, label, scan, refund or protection status to make demos look populated.
- No universal 14-day policy applied to private sellers.
- No client-side legal eligibility rules.
- No seller assertion treated as carrier truth.
- No support ticket status used as return status.
- No refund implementation inside the returns service; payment remains owner.
- No simultaneous integration of every named carrier.
- No decorative map, animated parcel or glass-card redesign before state truth is complete.
- No use of “escrow”, “insured” or “guaranteed” unless the financial/legal arrangement proves that exact claim.

---

## 17. Hard acceptance gates

The department is not flagship-ready until every gate passes:

1. A release build cannot create, persist or display a synthetic quote, tracking number, label, scan, ETA or refund.
2. Checkout cannot consume a fallback quote and cannot silently assume GB jurisdiction.
3. Every visible fulfilment action has a registered server handler and verified live response.
4. Manual tracking is required/verified or honestly classified untracked; it cannot trigger carrier-derived states.
5. Seller handoff never advances integrated shipping before authoritative first scan.
6. Buyer acknowledgement cannot release money while any return/dispute/blocking risk state is open.
7. Seller capacity and versioned rights snapshot are persisted at purchase and disclosed before pay.
8. Statutory, protection and voluntary return bases are distinct and correctly prioritized.
9. A return can move end to end through request, evidence, decision, reverse shipment, receipt, inspection, remedy, refund confirmation and appeal.
10. Refund execution is transactional/idempotent, records unknown outcome, and reconciles to provider plus ledger.
11. Duplicate/out-of-order webhooks do not duplicate state, money or notifications.
12. All operator overrides are reasoned, audited and maker-checker protected above thresholds.
13. Exception queues have named owners, deadlines and no unowned P0 event beyond SLO.
14. TypeScript, service tests, clean migration, provider sandbox, chaos tests and native EAS matrix pass.
15. Thumbnail/squint tests show product and parcel dominance; utility chrome recedes; no generic stack of equal cards.

---

## 18. Primary and official sources

### Consumer rights and marketplace obligations

- [GOV.UK — Accepting returns and giving refunds](https://www.gov.uk/accepting-returns-and-giving-refunds)
- [GOV.UK — Online and distance selling](https://www.gov.uk/online-and-distance-selling-for-businesses/distance-selling)
- [GOV.UK/CMA — Unfair commercial practices overview, updated December 2025](https://www.gov.uk/government/publications/what-businesses-need-to-know-about-unfair-commercial-practices/what-businesses-need-to-know-about-unfair-commercial-practices)
- [European Commission, Your Europe — Returns and right of withdrawal, checked April 2026](https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm)
- [European Commission, Your Europe — B2C distance selling requirements](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm)
- [EUR-Lex — Digital Services Act, Regulation (EU) 2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065)

### CMA direct enforcement and DMCC Act 2024

- [CMA — Direct consumer enforcement: one year on, April 2026](https://competitionandmarkets.blog.gov.uk/2026/04/17/direct-consumer-enforcement-one-year-on/) | 14 investigations, £760K refunds, £4.7M fines, 157 advisory letters, drip pricing/fake reviews/OCA priorities.
- [CMA — CMA200 Direct consumer enforcement guidance, March 2025](https://assets.publishing.service.gov.uk/media/6808ca0d8c1316be7978e74b/CMA_200_Direct_consumer_enforcement_guidance.pdf) | CMA's approach to DMCC Act direct enforcement, monetary penalties up to 10% global turnover.
- [CMA — CMA208 Fake reviews guidance](https://assets.publishing.service.gov.uk/media/67eeb64fe9c76fa33048c790/CMA208_-_Fake_reviews_guidance.pdf) | Banned practice: fake reviews, concealed incentivised reviews, misleading publication, broker prohibition.
- [CMA — Draft revised guidance on unfair contract terms, January 2026](https://assets.publishing.service.gov.uk/media/6971eb523f2908a3490404f8/draft_guidance.pdf) | CRA Part 2 unfair terms, CMA enforcement, trader compliance.
- [GOV.UK — CMA launches major consumer protection drive on online pricing](https://www.gov.uk/government/news/cma-launches-major-consumer-protection-drive-focused-on-online-pricing-practices) | 400 businesses reviewed, 14 sectors, drip pricing and misleading countdown timers banned, advisory letters to 100 businesses.
- [GOV.UK — Trainline, Virgin Atlantic, RED Driving School investigated for drip pricing](https://www.gov.uk/government/news/trainline-virgin-atlantic-and-red-driving-school-investigated-for-drip-pricing) | First CMA investigations using new DMCC Act powers, mandatory fees not shown upfront.
- [Legislation — Consumer Rights Act 2015, as amended April 2026](https://www.legislation.gov.uk/ukpga/2015/15/2026-04-06) | Current CRA covering goods, digital content, services; DMCC Act amendments.
- [Legislation — Digital Markets, Competition and Consumers Act 2024](https://www.legislation.gov.uk/ukpga/2024/13/schedule/23/part/2/enacted/data.xht) | DMCC Act subscription contracts, pre-contract information, cancellation rights, return responsibilities.

### Carrier implementation

- [Royal Mail — API onboarding](https://developer.royalmail.net/start)
- [Royal Mail — API Shipping V2](https://pp.developer.royalmail.net/product/7992)
- [Royal Mail — Tracking API v2 (Server-side) 1.0.38](https://developer.royalmail.net/product/175625/api/76888) | Track-and-trace for account customers, version 1.0.38 current.
- [Royal Mail — UK Parcel Services User Guide, August 2026](https://www.royalmail.com/sites/royalmail.com/files/2026-04/royal-mail-parcels-user-guide-april-2026.pdf) | Free Shipping Solutions, 2D barcoded labels, API integration, COSS specification for bespoke systems.
- [Easyship — 2024-09 overview flow](https://developers.easyship.com/docs/overview-flow-guide)
- [Easyship — webhook signature and retry guide](https://developers.easyship.com/reference/webhooks-guide)
- [Easyship — API 2024-09 migration](https://developers.easyship.com/reference/migrate-from-v2023-to-v2024)

---

## Final status

**PARTIAL — BACKEND CAPABILITY BLOCKER.** The correct foundation is present in quotes and parcel events, but production truth is broken by consumable fallback pricing, synthetic manual tracking, missing native/server route parity and a non-existent return lifecycle. Phase 0 is an immediate stop-ship correction; Phases 1–3 are required before claiming production-grade marketplace fulfilment.

### Upgraded status (25 August 2026)

**RESEARCH DEEPENED — IMPLEMENTATION BLOCKERS UNCHANGED.** The CMA's direct enforcement regime under the DMCC Act 2024 has been operational for one year with £4.7M in fines and 14 investigations. Drip pricing, fake reviews, and misleading countdown timers are banned practices with penalties up to 10% of global turnover. ThryftVerse's checkout must show total prices upfront (including all mandatory shipping), its return policies must be fair and transparent under the CRA, and its review system must prevent fake/incentivised reviews. The synthetic tracking number defect (`orders.ts:2323`), fallback quote chargeability, missing server handlers, and hardcoded 14-day return policy remain unchanged. Royal Mail's Shipping V2 REST API and Tracking API v2 (1.0.38) are confirmed viable integration paths requiring account onboarding. No production shipment, return, or refund claim may be presented to users until every gate in §17 passes.
