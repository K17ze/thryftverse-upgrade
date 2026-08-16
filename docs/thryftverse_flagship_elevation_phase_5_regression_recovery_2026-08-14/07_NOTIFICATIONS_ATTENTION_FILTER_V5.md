# Notifications — Attention Model & Filter Reconstruction V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current UI problem

Current screen combines:
- All / Unread;
- semantic filters in an overflow sheet;
- Today / Yesterday / Earlier time groups.

That is three axes of classification.

The filter technically works but does not feel authored because the user has to understand how these taxonomies interact.

## New mental model

Notifications is an **attention router**.

Default page:

```text
Notifications                       •••

Needs attention
[auction thumbnail] You were outbid...
                    Bid again >

Today
[avatar] @maya followed you
[item ] Your order shipped
[avatars] 4 people liked your Look

Earlier
...
```

## Primary organization

1. `Needs attention` if any.
2. chronological stream.

No permanent tabs required.

## Filter

One filter button in toolbar.

Sheet:
- Unread only
- Orders
- Auctions
- Messages
- Social
- Price & saved-item updates
- System

These are mutually composable if product needs multi-filter, or radio if simple.

Active:
toolbar/filter badge:
`Filters · 2`

Do not add an additional selected pseudo-tab under the header.

## Attention semantics

Backend supplies:
- priority;
- requiresAction;
- event type.

`Needs attention` examples:
- outbid;
- payment failed;
- ship order;
- dispute update;
- verification required.

Not:
- like;
- follow;
- saved item update unless urgent.

## Row anatomy by event role

### Social
avatar(s) + actor verb + object snippet.

### Commerce
listing/order thumbnail + status verb + concise CTA.

### Auction
item thumbnail + price/time/state + Bid/Watch action.

### Payment
financial icon/item + amount/status + View.

### System
simple icon/text; usually no media.

Do not force all through one generic row template.

## Aggregation

Examples:
- `Maya and 4 others liked your Look`
- `3 saved items dropped in price`

Aggregation should come from structured key/event metadata, not regex on human sentences.

## Unread

Use:
- small dot;
- weight/background nuance.

No giant unread badge/pill on every row.

## Mark all read

Overflow.
Not a primary permanent control.

## Swipe

Optional:
- mark read/unread;
- clear.

Provide accessible context-menu alternative.

## Offline

If cached notifications exist:
show them, with one quiet offline banner.

If none:
state clearly.

## Acceptance

User can scan 20 notifications and identify:
- which require action;
- what changed;
- where tapping goes;
without opening Filters.

No more than one classification system is visible at once.
