# Inbox, Chat & Concierge V6

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Normal chat stays normal

No product feature should permanently complicate a simple conversation.

## Commerce context

Listing/order context is compact.

## High-value concierge

For high-value categories, the conversation may include:
- specialist;
- broker;
- authentication team;
- support;
- scheduled viewing.

Represent roles explicitly.

## Structured actions

Chat card can initiate:
- Offer;
- Request viewing;
- Send evidence;
- Schedule call;
- Request authentication;
only when backend/workflow exists.

## No off-platform ambiguity

Transaction-critical actions stay canonical, even if conversation is social.

## Group

Phase 5 group truth closure is preserved.

## Media

Shared chat images should have sensible quality:
- thumbnail in thread;
- larger derivative on open;
- source/high-res when needed.
