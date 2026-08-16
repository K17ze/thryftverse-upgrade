# Phase 5 Atomic Coding Prompts

> Audit date: 2026-08-14  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## P5-01 — CI truth
Align Expo SDK 57 dependency patches reported by current Expo Doctor. Regenerate lockfile, rerun doctor and smoke tests. Do not ignore packages. Then establish reviewed native golden baselines.

## P5-02 — Domain decoupling
Move production Listing/Conversation/Message/Agent type ownership out of mockData. Preserve runtime behavior. Add import gate.

## P5-03 — Data provider parity
Make fixture/API data providers explicit. Add truthful source. Remove integration silent fixture fallback.

## P5-04 — Listing activation policy
Implement category-aware required fields server-side. Remove universal brand/size assumptions. Add completeness telemetry.

## P5-05 — Home card recovery
Replace anonymous media tile with HomeDiscoveryCard: media + one identity + price + max one context fact. Compare fixture/backend screenshots.

## P5-06 — Home rhythm
Add role-aware feed treatment without reordering relevance. Validate 5 consecutive viewports.

## P5-07 — Notification contract
Implement NotificationEventV2. Remove semantic inference from title/body and regex aggregation.

## P5-08 — Notification UX
Needs Attention + chronological. One filter button. Event-specific rows.

## P5-09 — Create Group
Implement recent/suggested people picker, selected tray, real avatar upload or generated mosaic. Remove inert photo affordance.

## P5-10 — Group backend truth
Canonical participant summaries and roles; real leave/add/remove semantics. No ID-derived names.

## P5-11 — Microflow wave A
Message Requests, Shared Media, Quick Replies, report/block, follower lists.

## P5-12 — Microflow wave B
Make Offer, Counteroffer, Size Guide, Ask Seller, Price Alert, Collections.

## P5-13 — Sell/search feedback loop
Ensure every active listing produces display-ready category-aware card/search data.

## P5-14 — Product richness review
Restore confidence/evidence where flattening made the page too generic, without adding card soup.

## P5-15 — Co-Own role lock
Add regression screenshot for horizontal Positions. Upgrade dossier presentation only.

## P5-16 — Creator small-flow QA
Permissions, drafts, publish retry, product tags, viewer interactions. No fake capability.

## P5-17 — Wallet/order microflows
Receipt/pending/refund/dispute and exact amount state.

## P5-18 — Role-aware audit
Run doc 51 across all routes. Do not apply one visual transform across multiple roles.

## P5-19 — Dual-mode golden suite
Fixture + seeded backend, iOS + Android. Treat parity failures as contract/design bugs.

## P5-20 — Completion audit
All CI green, no inert affordances, no runtime mockData imports, Notification V2 complete, small-flow matrix complete.
