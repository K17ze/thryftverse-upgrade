# Phase 5 Acceptance Matrix

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## CI / release
- [ ] current branch all required jobs green
- [ ] Expo Doctor green
- [ ] iOS golden baselines present/reviewed
- [ ] Android golden baselines present/reviewed

## Data parity
- [ ] production runtime imports no domain type from mockData
- [ ] fixtures validate against canonical DTO
- [ ] source reports api/fixture/cache truthfully
- [ ] integration mode never silently swaps in fixtures
- [ ] dual-mode golden routes pass visual parity

## Home
- [ ] card shows media + product identity + price
- [ ] optional context max one
- [ ] no universal avatar/badge overload
- [ ] five-viewport rhythm review passes

## Notifications
- [ ] UI never derives semantic category from title/body
- [ ] aggregation uses structured key
- [ ] default screen has one primary organization model
- [ ] action-required events are obvious
- [ ] filters do not create extra pseudo-tabs

## Groups
- [ ] Group photo affordance works or is removed
- [ ] default mosaic exists
- [ ] people-first recents/search picker
- [ ] participant display names never derived from IDs
- [ ] leave/add/remove uses server truth
- [ ] role/admin UI matches backend capability

## Small flows
- [ ] every item in doc 30 has entry/complete/cancel/loading/error
- [ ] no inert visible action

## Visual system
- [ ] PRs declare presentation role
- [ ] no global flat/card migration across unrelated roles
- [ ] commerce cards retain information floor
- [ ] utility screens remain appropriately calm

## Backend
- [ ] category-aware listing activation
- [ ] NotificationEventV2
- [ ] conversation participant summary
- [ ] presentation completeness metrics

## Human-authored gate
- [ ] no fixture-only visual richness
- [ ] no copy-driven business semantics
- [ ] no fake capability
- [ ] native screenshots reviewed by human
