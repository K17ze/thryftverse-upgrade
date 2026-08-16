# Visual Role Matrix

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

| Role | Typical screens | Media | Text density | Containment | Actions |
|---|---|---|---|---|---|
| Commerce discovery | Home/Search | high | low-medium | media object | 0–1 |
| Editorial media | Galleria/Look feature | very high | low | free | 0–1 |
| Personal collection | Saved/Collections | high | low | mosaic/object | manage context |
| Social identity | Profile/Inbox | avatar/content | medium | flat | 1–2 |
| Attention event | Notifications/Seller | thumbnail | medium | flat/semantic | only if needed |
| Transaction | Offer/Bid/Wallet | supporting | exact | explicit review | one commit |
| Evidence | Due Diligence | evidence media | medium-high | document | disclosures |
| Utility | Settings/Connections | minimal | medium | flat rows | trailing |
| Live market | Auction/Order book | supporting | numeric | state-oriented | dominant trade |
| Creator canvas | Poster/Look | canvas | minimal | none | contextual |
| Agent approval | Chat/Agent | optional | exact | decision card | approve/deny |

## Regression rule

Never refactor multiple rows/components merely because they share radius values.
Their role decides visual treatment.
