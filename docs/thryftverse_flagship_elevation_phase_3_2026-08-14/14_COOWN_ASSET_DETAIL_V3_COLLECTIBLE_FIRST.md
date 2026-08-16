# Co-Own Asset Detail V3 — Collectible First

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Preserve Phase 2

Keep the Due Diligence split. Do not move all legal/trust material back into the main PDP.

## Remaining problem

The first sequence still introduces Co-Own taxonomy, issuer, provenance, reference price, market state, spread, allocation and trust before the object fully breathes.

This is still instrument-first.

## V3 first two viewports

### Viewport 1
- unobstructed media;
- back/share/save;
- state only if actionability requires it.

### Under media
- asset title;
- one context line;
- issuer;
- one-unit price;
- availability;
- sticky Buy/Sell.

### Viewport 2
- short asset story;
- three evidence-backed trust facts;
- holder position if relevant;
- Market details;
- Due diligence.

## Defer market microstructure

Main:
`1 unit · 1ZE 1.24`
`220 available`
`Market open`

Market details:
- last settled price;
- bid/ask;
- spread;
- depth;
- chart;
- volume;
- NAV comparison;
- price alert.

Avoid “Continuous · Open” in the consumer first viewport unless essential.

## Move identity off photography

Title/availability/holder count should live on clean canvas under media by default.

## Family badge

Inside Co-Own, a `Co-Own` product-family badge is often redundant. Use `Co-owned` only when clarification is needed.

## Trust

Flat factual line:
Authenticated · Insured custody · Rights v2

Tap into anchored Due Diligence section.

No trust score.

## Due Diligence as evidence report

Use:
- evidence source
- verified date
- document link
- provenance timeline
- issuer/custodian/valuer attribution.

Avoid making every section visually identical to Settings.

## Shared state

Main detail and Due Diligence must consume a shared cached asset query keyed by asset ID. Avoid duplicate fetches and visual truth mismatch.

## Holder position

Quiet summary:
`You own 12 units · 3.4%`

More detail lives in Portfolio.

## Acceptance

A non-financial user can identify what the object is, who issued it, what one unit costs, what is available, why it is trustworthy, and what action is available in about five seconds.
