# Notification Backend Event Contract V2

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current engineering flaw

The frontend sometimes determines presentation type by checking:
- `eventType`;
- `payload.event`;
- words in human `title/body`.

Aggregation also extracts semantic fragments from display copy with regex.

This makes:
- localization unsafe;
- copy changes behaviorally dangerous;
- tests brittle;
- visual presentation inconsistent;
- backend/frontend ownership unclear.

## Canonical contract

```ts
type NotificationCategory =
  | 'commerce'
  | 'social'
  | 'auction'
  | 'message'
  | 'payment'
  | 'system';

type NotificationPriority =
  | 'critical'
  | 'action'
  | 'important'
  | 'info';

interface NotificationEventV2 {
  id: string;
  eventType: CanonicalNotificationEventType;
  category: NotificationCategory;
  priority: NotificationPriority;
  requiresAction: boolean;

  actor?: {
    userId: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };

  object?: {
    type:
      | 'listing'
      | 'order'
      | 'auction'
      | 'review'
      | 'message'
      | 'profile'
      | 'wallet'
      | 'look'
      | 'poster';
    id: string;
    label?: string;
    imageUrl?: string;
  };

  semanticPayload: Record<string, string | number | boolean>;
  route: NotificationRoute;
  aggregationKey?: string;
  cta?: {
    action: string;
    labelKey: string;
  };

  createdAt: string;
  readAt?: string;
}
```

## Backend owns

- event identity;
- actor/object IDs;
- priority;
- action requirement;
- aggregation key;
- canonical route target;
- typed payload.

## Frontend owns

- localized sentence;
- row anatomy;
- typography;
- grouping by date;
- user-local date/time;
- imagery presentation.

## Do not send final English sentence as business logic

Backend may include fallback copy for compatibility, but behavior cannot depend on it.

## Event examples

### `auction.outbid`

```json
{
  "category":"auction",
  "priority":"action",
  "requiresAction":true,
  "object":{"type":"auction","id":"...","label":"Prada bag"},
  "semanticPayload":{"newBid":450,"currency":"GBP"},
  "aggregationKey":"auction:<id>:outbid"
}
```

### `social.look_liked`

actor + Look object.
Aggregation key:
`look:<id>:likes`

## Migration

1. Add V2 fields without breaking old clients.
2. Frontend prefers V2.
3. Instrument fallback parsing.
4. Get fallback usage to zero.
5. Remove text inference/regex.
6. Add contract tests.

## Acceptance

Changing notification title copy must never change:
- filter category;
- route;
- urgency;
- aggregation;
- CTA.
