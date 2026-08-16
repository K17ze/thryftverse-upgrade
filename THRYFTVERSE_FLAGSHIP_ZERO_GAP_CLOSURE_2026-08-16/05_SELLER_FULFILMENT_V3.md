# Seller Fulfilment V3

## North star

A first-time seller who has never shipped on Thryftverse must be able to complete a sale without opening Help or asking the buyer how to send it.

## Entry points

The exact same fulfilment route should open from:
- Order Detail primary CTA;
- Orders > Selling > Needs action;
- Seller Hub;
- sale notification deep-link;
- transaction strip in buyer/seller Chat.

No entry point may bypass the same policy.

## State 1 — sold / fulfilment required

### Header
**Ship by Tue, 18 Aug**  
`2 days left` only if useful; do not add urgency colour before genuinely urgent.

### Compact transaction card
- item thumbnail;
- title;
- buyer handle;
- amount / estimated seller proceeds if helpful;
- order ID only as tertiary.

### Delivery contract
**Buyer chose**  
`Evri ParcelShop`  
`Tracked · prepaid · QR or print`  
`Buyer paid £3.49`

If buyer chose collection/locker, name that delivery mode. If seller is not allowed to change carrier, do not render a carrier picker.

### Destination
For integrated label:
- show enough destination context to prevent mistakes (town/postcode or collection point);
- full address exists in the generated label;
- provide full address only where operationally required and privacy-appropriate.

For custom shipping:
- full shipping address with Copy;
- required service level;
- tracking requirement;
- protection consequence.

### Package
`Small parcel · max X kg · max dimensions …`  
Show only if carrier service requires it.

### Packing guidance
Collapsed by default:
- remove/cover old labels;
- package securely;
- category-specific instructions;
- restricted/prohibited-item check when relevant;
- recommended evidence photos for high-risk categories.

### Primary CTA
**Get shipping label**

Secondary:
`Message buyer`

Tertiary:
`Having trouble?`

## State 2 — label ready

Hero action changes to:
**Show drop-off QR**

Adjacent secondary:
- `Print label`
- `Find drop-off`

Show:
- selected carrier/service;
- ship-by date;
- closest/selected drop-off only if location permission or user selection exists;
- label validity/expiry if carrier provides it;
- “Tracking updates automatically after the carrier scans the parcel.”

No general `Mark shipped` for integrated shipping.

## State 3 — handed to carrier / first scan

Carrier acceptance is authoritative.

Show:
**Parcel accepted by Evri**  
`Today, 16:42 · Waterloo ParcelShop`

Primary:
`Track parcel`

Secondary:
`Message buyer`

Seller payout panel:
`Payment held`  
`Estimated release: after delivery + buyer inspection window`

Do not invent an exact payout date if business rules/carrier ETA do not support one.

## Manual/custom shipping branch

Only when order shipping method is truly custom:
1. show required service: tracked / signature / insurance;
2. full buyer address;
3. carrier + tracking entry;
4. validate tracking format where possible;
5. require explicit confirmation;
6. explain protection consequence;
7. persist proof-of-postage option;
8. primary action becomes **Add tracking & confirm dispatch**.

## Deadline policy

The state model must contain server-authoritative:
- `shipByAt`;
- extension eligibility;
- extension request;
- buyer accepted/declined;
- final cancellation deadline.

UI:
- normal: neutral;
- <24h: subtle warning;
- overdue: explicit consequence and recovery.

Never make a countdown the visual centre unless urgent.

## Label-generation failures

Different failures need different remedies:

| Failure | UI |
|---|---|
| Buyer address invalid | “Buyer needs to update their address”; message/cancel-reorder policy |
| Seller return address missing | direct link to fix seller postage address |
| Carrier outage | retry + alternate *only if order policy permits* |
| Quote/label expired | regenerate under same purchased service or server-approved replacement |
| No printer | QR/drop-off code path |
| QR not accepted | printable label / alternate drop-off / support |
| Parcel too large | package mismatch recovery; do not silently switch service |
| Provider timeout | preserve state; retry idempotently |
| Label generated but response lost | GET fulfilment state restores existing label, never buys twice |

## Protection

Display a compact “Protected when you…” disclosure only at the moment it matters:
- use this generated label;
- hand over before deadline;
- keep proof/pack securely if required.

## Success semantics

Do not celebrate `status = shipped`. Celebrate meaningful real-world milestones:
- label created;
- carrier accepted parcel;
- delivered;
- payout available.

A tiny haptic/toast is enough; avoid confetti for routine logistics.
