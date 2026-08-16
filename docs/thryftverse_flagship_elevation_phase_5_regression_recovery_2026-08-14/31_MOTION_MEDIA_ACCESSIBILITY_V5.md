# Motion, Media & Accessibility V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Motion

Phase 5 reverses neither motion cleanup nor reduced-motion work.

Motion is role-aware.

Commerce discovery:
- press response;
- media transition only if stable.

Attention:
- no bounce/pulse except truly urgent.

Creator:
- direct manipulation.

Transactions:
- state resolution, not celebration.

## Media

Store and propagate:
- kind;
- dimensions;
- duration;
- poster;
- focal point.

This supports parity across fixture/backend and prevents geometry shifts.

## Accessibility

44pt iOS / appropriate Android touch targets.
Large text.
Screen reader.
Reduced motion.
Reduce transparency/high contrast.

## Role-specific screen-reader summaries

Home tile:
`Acne Studios scarf, £86`

Notification:
`You were outbid on Prada bag. New bid £450. Action available: Bid again.`

Transaction:
exact amount/consequence.

## Gesture alternatives

Every drag/swipe-only action gets:
- menu/accessibility action;
- explicit button where necessary.

## No fake hidden content

Do not make important commerce identity visible only on hover-like interaction unavailable on touch/screen reader.
