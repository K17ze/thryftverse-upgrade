# Backend Domain Contracts for Production UI

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Why backend architecture is now a visual-quality issue

A front end cannot maintain flagship density if backend objects are underspecified or semantically inconsistent.

Phase 5 treats presentation contracts as first-class backend product engineering.

## Listing

Backend active-listing DTO must provide:
- stable media array with dimensions/type/poster;
- title/product identity;
- category;
- price/currency;
- seller summary;
- condition when category requires;
- category-specific fields;
- status;
- timestamps;
- commerce family.

Do not make frontend derive canonical title from arbitrary description.

## Seller summary

Reusable:
- id;
- username;
- displayName;
- avatarUrl;
- verification/trust facts needed by card/detail.

## Notification

Adopt V2 semantic contract from doc 08.

## Conversation

Conversation summary:
- type;
- title;
- avatar/mosaic;
- participants;
- listing/order context;
- unread;
- last message;
- roles.

No truncated-ID display fallback.

## Group

Backend membership:
- owner/admin/member if product supports admin.
- invite/add/remove/leave semantics.

## Search

Facet contract:
- category-aware;
- count;
- supported sort;
- commerce-family semantics.

## Co-Own

Preserve factual/TBC semantics.
Evidence resources need source/date/document metadata.

## Wallet

Money values:
- integer minor unit / decimal-safe amount;
- currency;
- fees;
- rate timestamp;
- status.

## Contract versioning

Use:
- OpenAPI or shared schema;
- generated TypeScript;
- runtime validation at network boundary;
- backward-compatible migrations.

## Principle

Backend should send **facts and semantics**.
Frontend decides **presentation**.

Do not send final English sentences when behavior depends on them.
