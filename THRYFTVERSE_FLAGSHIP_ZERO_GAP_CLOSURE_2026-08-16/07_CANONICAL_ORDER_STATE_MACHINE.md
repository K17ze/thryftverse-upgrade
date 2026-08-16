# Canonical Order State Machine

## Problem

The app currently mixes compact order statuses, richer display statuses, parcel events and locally computed capabilities. This creates state drift.

## Recommended canonical model

### Payment
- `CREATED`
- `PAYMENT_PENDING`
- `PAID`
- `PAYMENT_FAILED`
- `CANCELLED`

### Fulfilment
- `FULFILMENT_REQUIRED`
- `LABEL_GENERATING`
- `LABEL_READY`
- `HANDOFF_PENDING`
- `CARRIER_ACCEPTED`
- `IN_TRANSIT`
- `OUT_FOR_DELIVERY`
- `DELIVERED`

### Post-delivery
- `INSPECTION_WINDOW`
- `COMPLETED`
- `PAYOUT_QUEUED`
- `PAID_OUT`

### Exception overlays
Use orthogonal exception/case state when possible instead of exploding one flat enum:
- `ADDRESS_PROBLEM`
- `LABEL_FAILED`
- `DEADLINE_EXPIRING`
- `DEADLINE_MISSED`
- `NO_FIRST_SCAN`
- `DELIVERY_EXCEPTION`
- `LOST`
- `DAMAGED`
- `DISPUTE_OPEN`
- `RETURN_REQUIRED`
- `RETURN_IN_TRANSIT`
- `RETURNED`
- `REFUND_QUEUED`
- `REFUNDED`

## Why overlays

An order can be `IN_TRANSIT` and also have a `DELIVERY_EXCEPTION`. Modelling every combination as a flat status creates brittle UI conditionals.

## Source-of-truth hierarchy

1. Payment provider/webhook for payment settlement.
2. Order service transaction for order lifecycle.
3. Shipping provider webhook/event for integrated handoff/transit/delivery.
4. Resolution service for issue/return/refund.
5. Payout service for payout state.
6. Client is a projection, never the truth owner.

## Core invariant

A client button may request a transition but never invent a state.

## Integrated shipment transition

`LABEL_READY`
→ carrier first acceptance scan
→ `CARRIER_ACCEPTED`
→ provider events
→ `IN_TRANSIT`
→ `OUT_FOR_DELIVERY`
→ `DELIVERED`

The client should not directly mutate `LABEL_READY → SHIPPED` merely because a seller tapped a button.

## Manual shipment transition

`FULFILMENT_REQUIRED`
→ seller submits valid carrier + tracking + acknowledgement
→ server validates and records proof
→ `HANDOFF_PENDING`
→ first trackable event if available
→ `CARRIER_ACCEPTED/IN_TRANSIT`

## State revision

Every order projection should carry:
- `stateVersion` / revision;
- `updatedAt`;
- transition ID;
- source (`payment_webhook`, `carrier_webhook`, `seller_action`, etc.).

Mutations submit `expectedStateVersion` where practical. Conflict returns refreshed canonical state rather than silently overwriting.

## Idempotency

Required for:
- create order;
- create payment intent;
- generate shipping label;
- confirm manual dispatch;
- cancel;
- confirm receipt;
- open issue;
- approve refund;
- create return label;
- payout scheduling.

## Capabilities envelope

Backend response should include authoritative capabilities:

```ts
type OrderCapability =
  | { id: 'dispatch'; enabled: true; route: 'seller_fulfilment' }
  | { id: 'track'; enabled: true }
  | { id: 'inspect'; enabled: true; deadlineAt: string }
  | { id: 'report_issue'; enabled: boolean; reason?: string }
  | { id: 'cancel'; enabled: boolean; reason?: string };
```

Frontend resolver may shape presentation but may not loosen backend rules.
