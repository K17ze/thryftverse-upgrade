# Notifications and attention system

## Code surfaces inspected / affected

- `frontend/src/screens/NotificationsScreen.tsx`
- `frontend/src/services/notificationsApi.ts`
- `frontend/src/utils/notificationRouting.ts`

## Current diagnosis


Notifications currently aggregates some social events, supports filters, groups into Orders/Social/System, swipes, unread and quiet hours. The problem is taxonomy overload: six filter tabs plus grouped sections means two classification systems are visible at once.


## User psychology / product job


Notifications are not a content destination. They are an attention router.

The question is:
- what changed;
- does it require action;
- where do I go?


## Flagship target composition


Default:
- chronological/priority stream grouped lightly by time or action class.
- action-needed events visually stronger.
- social aggregation reduces noise.

Filter only if volume justifies it; otherwise search/settings can handle detail.


## Detailed implementation map


1. Choose one visible organizing system: priority/time sections OR filter tabs, not both.
2. Orders/resolutions/auction-outbid are action events.
3. Likes/follows/new items aggregate.
4. Price drops can aggregate by saved collection/category.
5. Mark all read lives in overflow/header.
6. Swipe delete/read can remain; avoid two visible buttons on every row.
7. Notification row:
   - actor/object image;
   - human verb;
   - time;
   - optional compact CTA.
8. Use backend event type, not string parsing, wherever schema can be extended.
9. Quiet Hours is settings behavior, not a banner on the notification list unless active status materially explains absence.


## Micro-detail pass


- Do not show category pill per notification.
- Unread = dot/background nuance, not full border.
- Transaction event image can be listing thumbnail; social uses avatar.


## Acceptance / screenshot QA


Pass:
- user identifies action-required notifications without reading filters.
- no simultaneous six-chip filter rail + three-section taxonomy.


## Reference crosswalk


- Instagram-style aggregation is useful for social volume.
- Commerce events need stronger action semantics than social events.
