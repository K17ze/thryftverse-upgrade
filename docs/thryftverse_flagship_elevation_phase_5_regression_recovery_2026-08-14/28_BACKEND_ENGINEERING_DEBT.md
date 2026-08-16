# Backend Engineering Debt Affecting Production Quality

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## 1. Data completeness must be server-visible

Create a listing-quality validator/service by category.

Metrics:
- active listings missing cover;
- active listings missing identity;
- invalid media metadata;
- missing seller summary;
- invalid category fields.

Do not rely on the frontend to quietly filter.

## 2. Notification semantics

Move from prose-driven to event-driven V2.

## 3. Group chat

Add complete group domain support if product promises:
- avatar;
- description;
- roles/admin;
- add/remove;
- leave;
- invite.

Do not model leave as local deletion.

## 4. Search facets

Server returns available facets/counts and supported sorts.

Avoid frontend category constants pretending to reflect live inventory.

## 5. Presentation summaries

For high-frequency lists return compact summary DTOs:
- Home listing summary;
- notification summary;
- conversation summary;
- seller operational summary.

Avoid overfetching full detail.

## 6. Idempotency

Preserve for:
- group create;
- offers;
- bids;
- payments;
- publish.

## 7. Observability

Backend dashboards:
- endpoint p50/p95;
- error rate;
- empty-result rate;
- invalid DTO rate;
- media processing latency;
- search no-result rate;
- group create failures;
- notification delivery delay.

## 8. Cache semantics

Responses should carry enough version/timestamp/ETag information for frontend to distinguish:
- stale but usable;
- fresh;
- invalid.

## 9. API schema ownership

Stop duplicating enums and categories in frontend constants where backend is canonical.

## 10. Production seed environment

Have a realistic staging dataset.
Do not use production user data for visual tests.
