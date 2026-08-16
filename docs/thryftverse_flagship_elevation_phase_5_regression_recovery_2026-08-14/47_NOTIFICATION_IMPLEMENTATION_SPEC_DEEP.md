# Notifications V5 — Deep Backend + Frontend Implementation Specification

> Audit date: 2026-08-14  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## 1. Stop using presentation text as a schema

Current fallback logic that searches title/body for words is technical debt.

Migrate in stages.

### Stage A
Backend emits both:
- current fields;
- V2 semantic fields.

Frontend logs whenever it must use legacy inference.

### Stage B
All known producers emit V2.
Fallback telemetry should reach zero in staging.

### Stage C
Delete regex/text inference.

## 2. Canonical event registry

Create one backend registry:

```ts
export const NotificationEvents = {
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
  OFFER_RECEIVED: 'offer.received',
  OFFER_ACCEPTED: 'offer.accepted',
  AUCTION_OUTBID: 'auction.outbid',
  AUCTION_WON: 'auction.won',
  AUCTION_ENDING: 'auction.ending',
  PRICE_DROP: 'saved.price_drop',
  USER_FOLLOWED: 'social.followed',
  LOOK_LIKED: 'social.look_liked',
  POSTER_REACTION: 'social.poster_reaction',
  MESSAGE_REQUEST: 'message.request',
  PAYOUT_AVAILABLE: 'wallet.payout_available',
  RESOLUTION_UPDATED: 'resolution.updated',
} as const;
```

No producer invents local event strings.

## 3. Presentation factory

Frontend:

```ts
type NotificationPresentation = {
  role: 'social'|'commerce'|'auction'|'financial'|'system';
  primary: string;
  secondary?: string;
  image?: NotificationImage;
  action?: NotificationAction;
  attention: boolean;
  aggregation?: NotificationAggregationView;
};
```

Map event type → localized presentation.

## 4. Localization

Use keys:
- `notification.auction.outbid`
- variables `{itemName, amount}`

Do not store the English copy as the semantic source of truth.

## 5. Aggregation

Aggregation runs on:
- `aggregationKey`;
- eventType;
- object.

Examples:

`social.look_liked:look123`

Group:
actors [Maya, Noor, Dan...]
count 5.

Presentation:
`Maya and 4 others liked your Look`

The backend may pre-aggregate or frontend may group within a window, but both must use the semantic key.

## 6. Priority rules

### critical
Rare:
- security/account issue;
- severe payment problem.

### action
- outbid;
- ship order;
- offer waiting if time-sensitive;
- dispute/verification.

### important
- shipped;
- offer accepted;
- payout ready.

### info
- like;
- follow;
- generic activity.

Do not allow every producer to mark itself critical.

## 7. Notification Center UI

### `Needs attention`
Only events with `requiresAction`.

Sort:
- urgency/deadline;
- recency.

### chronological
Today / Yesterday / Earlier.

If Needs Attention item is also in Today, show it once, not duplicated.

## 8. Filter architecture

Toolbar filter is contextual utility.

Filter state:

```ts
{
  unreadOnly: boolean;
  categories: NotificationCategory[];
}
```

No separate active pseudo-tab.

The filter button can show:
`Filters · 2`.

## 9. Deep link truth

Route is typed:
```ts
{ name:'AuctionDetail', params:{auctionId} }
```

Do not infer navigation from title.

Validate route before delivery where possible.

## 10. Row components

Create separate row presenters sharing spacing primitives:

- `SocialNotificationRow`
- `CommerceNotificationRow`
- `AuctionNotificationRow`
- `FinancialNotificationRow`
- `SystemNotificationRow`

Do not one-component-conditional the whole universe into a generic card.

## 11. Read semantics

Mark read:
- on explicit open;
- optionally viewport dwell for info events if product chooses;
- server sync.

Unread count must derive from server/canonical store, not visible filtered list.

## 12. Push vs in-app

NotificationEventV2 can feed both, but delivery policy is separate.

Not every in-app event deserves push.

Policy table:
- outbid → push + in-app;
- like → maybe bundled push + in-app;
- seller operational deadline → push + in-app;
- routine system sync → in-app only or none.

## 13. Image choice

Social:
actor avatar.

Commerce:
object/listing thumbnail.

Group/message:
group/person avatar.

Financial:
usually object/icon, not stock generic image.

## 14. Accessibility

Example:
`Action required. You were outbid on Prada bag. Current bid 450 pounds. Button: Bid again.`

## 15. Contract tests

- changing English copy leaves category unchanged;
- aggregation identical after localization;
- route typed;
- unknown event safely uses system row;
- legacy fallback telemetry increments.

## 16. Native QA

Capture 30-event mixed feed and compare:
- action scanning;
- row monotony;
- avatar/thumbnail selection;
- long translations;
- dark mode.

A successful redesign should make the filter less important because default prioritization is better.
