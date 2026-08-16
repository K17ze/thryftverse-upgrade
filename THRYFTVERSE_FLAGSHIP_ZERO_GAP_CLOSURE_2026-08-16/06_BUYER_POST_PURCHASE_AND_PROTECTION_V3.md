# Buyer Post-Purchase & Protection V3

## Immediately after purchase

The confirmation screen and Order Detail should say:

**Order confirmed**  
`Seller ships by Tue, 18 Aug`

Then:
- item summary;
- delivery method buyer selected;
- destination/collection point;
- total;
- payment state;
- buyer-protection summary;
- expected delivery only if backed by service/quote data.

Primary action is normally **View order** or **Message seller** only if communication is likely necessary. Do not manufacture a CTA if no action is required.

## Before dispatch

Status:
**Waiting for seller to ship**

Show:
- ship-by deadline;
- chosen service;
- seller identity;
- what happens if deadline is missed;
- extension request if seller asks.

Do not nag the buyer to message the seller before the seller has missed a reasonable SLA.

## In transit

Primary:
**Track parcel**

In-product view contains:
- expected delivery date/range;
- progress;
- carrier;
- linked tracking number;
- detailed events;
- package contents.

External carrier site remains a secondary escape hatch.

## Delivery

When carrier reports delivered:
**Delivered — check your item**

Primary:
**Everything is OK**

Secondary:
**Report a problem**

Supporting text:
`You have [inspection window] to report an issue before payment is released.`

If the platform auto-releases after a period, the exact server-derived deadline should be visible.

## Early/manual receipt

If business logic permits a buyer to confirm before carrier delivery:
- hide it behind `I already received this`;
- require consequence confirmation;
- do not make it the primary CTA while parcel is merely in transit.

## Issue flow

Start from user intent, not internal ticket categories:
- item not received;
- arrived damaged;
- not as described;
- wrong item;
- counterfeit/authenticity concern;
- parcel marked delivered but missing;
- other.

Then ask only evidence relevant to that branch.

## Resolution

Show one compact case status:
- issue opened;
- seller response due;
- return required;
- return label ready;
- return in transit;
- refund approved;
- refund sent.

Never force user to deduce case state from chat messages.

## Returns

Mirror outbound fulfilment quality:
- exact return carrier/service;
- QR/label;
- return-by date;
- packing instruction;
- drop-off;
- tracking;
- refund milestone.

## Completion

After inspection window:
- order complete;
- review action;
- receipt;
- resale/list-similar only if contextually useful.

Avoid post-purchase upsell noise before users know the order is safe.
