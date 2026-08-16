# Code Evidence & Exact Change Map V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

| Area | Current evidence | Phase 5 work |
|---|---|---|
| Runtime modes | `constants/runtimeFlags.ts`: dev defaults fixture-design | explicit visual/integration modes |
| BackendDataContext | substitutes fixtures on API fail/empty; domain Listing from mockData | truthful source + shared schema |
| Listing mapper | universal display-ready requirements | category-aware activation/completeness |
| Home | custom tile removes title/brand; reduced price overlay | HomeDiscoveryCard with identity floor |
| ProductCardV2 | Listing type from mockData; richer than Home custom tile | move type; role-specific card family |
| Notifications | All/Unread + overflow semantics + time groups | one attention model |
| Notifications | prose/event fallback classification/aggregation | NotificationEventV2 |
| CreateGroupChat | visible Group photo affordance without picker handler | real upload or generated mosaic |
| chatApi | group creation supports avatar field but flow doesn't wire it; types from mockData | domain types + avatar pipeline |
| GroupMembers | admin unsupported; fallback names derived from IDs | canonical participant summaries/roles |
| GroupInfo | leave/delete operate local-store semantics | server membership truth |
| Co-Own | position rail was regressed then restored | regression lock/screenshot |
| CI | Expo Doctor red | dependency alignment |
| CI | screenshot baseline test red | reviewed iOS/Android baselines |
| Home monitoring | screen-level dynamic require workaround | monitoring adapter |
| Design system | global flattening over-applied | role-aware composition |
