# Visual Dataset Lab

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Objective

Create a developer-only route/app mode dedicated to visual QA.

## Catalogue categories

### Listings
- best case;
- sparse valid;
- long brand/title;
- 1 media;
- 20+ media;
- video;
- flawed;
- luxury;
- brandless;
- no size;
- sold;
- reserved.

### People
- avatar/no avatar;
- long name;
- verified;
- blocked/restricted test.

### Notifications
Every event family.

### Conversations
- direct;
- group;
- commerce;
- agent;
- unread;
- long preview.

### Creator
- images of every aspect ratio;
- video.

### Co-Own
- full evidence;
- TBC evidence.

### Money
- large/small/zero amounts;
- pending;
- negative/error.

## Data source

Fixtures are generated/validated against the canonical schema.

## Why

Designers/agents can see all states without needing to mutate live backend data, while staying contract-faithful.

## Guard

Lab cannot be reachable in production.
